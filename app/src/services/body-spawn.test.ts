import { describe, it, expect } from 'vitest';
import { createDefaultCharacter } from '@/lib/defaults';
import { deriveRegions, findPartByKey } from '@/lib/body-tree';
import { routeDamage } from '@/lib/body-damage';
import {
  spawnBodyFromStructure,
  ensureInternalPath,
  hasSpawnedBody,
  humanizePartToken,
  partTokenFromName,
} from './body-spawn';
import { applyCreationGrants } from './character-grants';
import type { SeedBodyStructure } from '@/types/growth';
import type { GrowthWorldItem } from '@/types/item';

const HUMANOID: SeedBodyStructure = {
  parts: [
    'HEAD', 'TORSO',
    'LEFT_UPPER_ARM', 'LEFT_LOWER_ARM',
    'RIGHT_UPPER_ARM', 'RIGHT_LOWER_ARM',
    'LEFT_UPPER_LEG', 'LEFT_LOWER_LEG',
    'RIGHT_UPPER_LEG', 'RIGHT_LOWER_LEG',
  ],
  vitals: ['HEAD', 'TORSO'],
};

function seedFixture(overrides: Partial<{ bodyStructure: SeedBodyStructure; baseResist: number }> = {}) {
  return {
    id: 'seed-1',
    name: 'Test Human',
    data: {
      description: 'A test seed',
      baseFateDie: 'd6' as const,
      frequency: 10,
      fatedAge: 80,
      baseResist: overrides.baseResist ?? 4,
      attributes: {
        clout: 0, celerity: 0, constitution: 0, focus: 0,
        flow: 0, willpower: 0, wisdom: 0, wit: 0,
      },
      skills: [],
      nectars: [],
      thorns: [],
      bodyStructure: overrides.bodyStructure ?? HUMANOID,
    },
  };
}

describe('body-spawn — template → real body-part items (Mike 2026-08-17)', () => {
  it('humanize/tokenize round-trips part names', () => {
    expect(humanizePartToken('LEFT_UPPER_ARM')).toBe('Left Upper Arm');
    expect(partTokenFromName('Left Upper Arm')).toBe('LEFT_UPPER_ARM');
    expect(humanizePartToken('HEAD')).toBe('Head');
    expect(partTokenFromName('Head')).toBe('HEAD');
  });

  it('spawns the humanoid template with TORSO as root and all parts present', () => {
    const body = spawnBodyFromStructure(HUMANOID, { baseResist: 4 })!;
    expect(body).not.toBeNull();
    expect(body.partName).toBe('Torso');
    expect(body.isBodyPart).toBe(true);
    const regions = deriveRegions(body);
    expect(regions).toHaveLength(HUMANOID.parts.length);
    const names = regions.map(r => r.partName);
    for (const token of HUMANOID.parts) {
      expect(names).toContain(humanizePartToken(token));
    }
  });

  it('chains lower limbs under their upper counterparts (humanoid convention)', () => {
    const body = spawnBodyFromStructure(HUMANOID, { baseResist: 4 })!;
    const lowerArm = findPartByKey(body, 'Torso/Left Upper Arm/Left Lower Arm');
    expect(lowerArm?.partName).toBe('Left Lower Arm');
    const lowerLeg = findPartByKey(body, 'Torso/Right Upper Leg/Right Lower Leg');
    expect(lowerLeg?.partName).toBe('Right Lower Leg');
    // HEAD hangs directly off the root.
    expect(findPartByKey(body, 'Torso/Head')?.partName).toBe('Head');
  });

  it('flags HEAD and template vitals; applies material defaults', () => {
    const body = spawnBodyFromStructure(HUMANOID, { baseResist: 4 })!;
    const head = findPartByKey(body, 'Torso/Head')!;
    expect(head.isVital).toBe(true);
    expect(head.materialClass).toBe('Hard');
    expect(head.primaryMaterial).toBe('Bone');
    expect(body.isVital).toBe(true); // TORSO is a template vital
    const arm = findPartByKey(body, 'Torso/Left Upper Arm')!;
    expect(arm.isVital).toBeUndefined();
    expect(arm.materialClass).toBe('Soft');
    expect(arm.primaryMaterial).toBe('Flesh');
  });

  it("gives every part the seed's baseResist and full condition (engine contract)", () => {
    const body = spawnBodyFromStructure(HUMANOID, { baseResist: 7 })!;
    for (const region of deriveRegions(body)) {
      expect(region.baseResist).toBe(7);
      expect(region.condition).toBe(3);
    }
  });

  it('uses template descriptors as part descriptions when present', () => {
    const body = spawnBodyFromStructure(
      { ...HUMANOID, descriptors: { HEAD: 'Elongated cranium' } },
      { baseResist: 4 },
    )!;
    expect(findPartByKey(body, 'Torso/Head')?.description).toBe('Elongated cranium');
  });

  it('spawns non-humanoid templates (no TORSO) rooted at the first vital', () => {
    const spider: SeedBodyStructure = {
      parts: ['HEAD', 'THORAX', 'ABDOMEN', 'LEG_1', 'LEG_2'],
      vitals: ['THORAX'],
    };
    const body = spawnBodyFromStructure(spider, { baseResist: 3 })!;
    expect(body.partName).toBe('Thorax');
    expect(deriveRegions(body)).toHaveLength(5);
  });

  it('returns null for an empty/absent template (caller falls back to baseline)', () => {
    expect(spawnBodyFromStructure(undefined, { baseResist: 4 })).toBeNull();
    expect(spawnBodyFromStructure({ parts: [], vitals: [] }, { baseResist: 4 })).toBeNull();
  });

  it('spawned tree is consumable by the damage cascade engine as-is', () => {
    const body = spawnBodyFromStructure(HUMANOID, { baseResist: 4 })!;
    // Piercing designating the Head: torso absorbs 4, head catches the rest.
    const pierced = routeDamage(body, 'piercing', 10, { piercingTargetPath: ['Head'] });
    const headEvent = pierced.events.find(e => e.partName === 'Head');
    expect(headEvent).toBeDefined();
    expect(headEvent!.damageDealt).toBe(2); // 10 − 4 (torso) − 4 (head resist)
    expect(headEvent!.brokeTier).toBe(true);
    // Bashing splits the passthrough evenly across the root's internals.
    const bashed = routeDamage(body, 'bashing', 40, {});
    const directChildren = body.contains!.length;
    const childEvents = bashed.events.filter(e => e.partPath.length === 2);
    expect(childEvents).toHaveLength(directChildren);
  });
});

describe('body-spawn — wiring into applyCreationGrants', () => {
  it('spawns the body from the seed template when the seed lands', () => {
    const c = createDefaultCharacter('Spawn Test');
    const next = applyCreationGrants(c, seedFixture(), [], []);
    const body = next.bodyAnatomy as GrowthWorldItem;
    expect(hasSpawnedBody(body)).toBe(true);
    expect(body.partName).toBe('Torso');
    expect(deriveRegions(body)).toHaveLength(HUMANOID.parts.length);
  });

  it('is idempotent — re-assigning the SAME seed never double-spawns or wipes damage', () => {
    const c = createDefaultCharacter('Idempotency Test');
    const once = applyCreationGrants(c, seedFixture(), [], []);
    // Simulate battle scars: head dropped to Worn.
    const body = once.bodyAnatomy as GrowthWorldItem;
    const head = findPartByKey(body, 'Torso/Head')!;
    head.condition = 2;
    const twice = applyCreationGrants(once, seedFixture(), [], []);
    const bodyAfter = twice.bodyAnatomy as GrowthWorldItem;
    expect(deriveRegions(bodyAfter)).toHaveLength(HUMANOID.parts.length);
    expect(findPartByKey(bodyAfter, 'Torso/Head')!.condition).toBe(2); // damage kept
  });

  it('assigning a DIFFERENT seed rebuilds the body from the new template', () => {
    const c = createDefaultCharacter('Reseed Test');
    const once = applyCreationGrants(c, seedFixture(), [], []);
    const serpent = seedFixture({
      bodyStructure: { parts: ['HEAD', 'BODY_COIL', 'TAIL'], vitals: ['HEAD'] },
      baseResist: 6,
    });
    serpent.id = 'seed-2';
    serpent.name = 'Test Serpent';
    const next = applyCreationGrants(once, serpent, [], []);
    const body = next.bodyAnatomy as GrowthWorldItem;
    expect(deriveRegions(body)).toHaveLength(3);
    expect(deriveRegions(body).every(r => r.baseResist === 6)).toBe(true);
  });

  it('falls back to the Human baseline when the seed has no template', () => {
    const c = createDefaultCharacter('Fallback Test');
    const seed = seedFixture();
    delete (seed.data as { bodyStructure?: SeedBodyStructure }).bodyStructure;
    const next = applyCreationGrants(c, seed, [], []);
    const body = next.bodyAnatomy as GrowthWorldItem;
    expect(body.partName).toBe('Body'); // HUMAN_BASELINE_ANATOMY root
  });
});

describe('body-spawn — lazy organs (ensureInternalPath)', () => {
  it('spawns a missing internal under its designated parent', () => {
    const body = spawnBodyFromStructure(HUMANOID, { baseResist: 4 })!;
    const { spawned } = ensureInternalPath(body, ['Heart'], { baseResist: 4 });
    expect(spawned).toEqual(['Heart']);
    const heart = findPartByKey(body, 'Torso/Heart')!;
    expect(heart.isBodyPart).toBe(true);
    expect(heart.isVital).toBe(true); // Heart defaults vital (Human baseline parity)
    expect(heart.baseResist).toBe(4);
    expect(heart.condition).toBe(3);
  });

  it('is a no-op when the whole path already exists', () => {
    const body = spawnBodyFromStructure(HUMANOID, { baseResist: 4 })!;
    const first = ensureInternalPath(body, ['Head'], { baseResist: 4 });
    expect(first.spawned).toEqual([]);
    const before = deriveRegions(body).length;
    ensureInternalPath(body, ['Head'], { baseResist: 4 });
    expect(deriveRegions(body)).toHaveLength(before);
  });

  it('creates intermediate segments so piercing can route to the new organ', () => {
    const body = spawnBodyFromStructure(HUMANOID, { baseResist: 2 })!;
    ensureInternalPath(body, ['Head', 'Brain'], { baseResist: 2 });
    const brain = findPartByKey(body, 'Torso/Head/Brain')!;
    expect(brain.isVital).toBe(true);
    const result = routeDamage(body, 'piercing', 10, { piercingTargetPath: ['Head', 'Brain'] });
    const brainEvent = result.events.find(e => e.partName === 'Brain');
    expect(brainEvent).toBeDefined();
    expect(brainEvent!.damageDealt).toBe(4); // 10 − 2 (torso) − 2 (head) − 2 (brain)
  });
});
