/**
 * propose_forge_blueprint at the boundary: blocks are campaign-agnostic
 * archetypes; the bearer's specifics land on her link (narrative paint).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, unknown> & { id: string };
const db = vi.hoisted(() => ({
  forge: [] as Array<Record<string, unknown> & { id: string }>,
  links: [] as Array<Record<string, unknown> & { id: string }>,
  sessions: [] as Array<Record<string, unknown> & { id: string }>,
  seq: 0,
}));

function match(row: Row, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      if ('in' in o) return (o.in as unknown[]).includes(row[k]);
      if ('not' in o) return row[k] !== o.not;
      if ('contains' in o) return String(row[k] ?? '').includes(String(o.contains));
      if ('startsWith' in o) return String(row[k] ?? '').startsWith(String(o.startsWith));
      return true;
    }
    if (k === 'OR') return (v as Array<Record<string, unknown>>).some(w => match(row, w));
    return row[k] === v;
  });
}

const BACKSTORY = 'Violet grew up in a narrow house. Her Grandmother raised her. Later, Rosemary Marsh taught her to write and Rosemary kept the Key.';

vi.mock('@/lib/db', () => ({
  prisma: {
    campaign: { findUnique: vi.fn(async () => ({ name: 'Prime', aiSettings: null })) },
    location: { findMany: vi.fn(async () => []) },
    character: {
      findMany: vi.fn(async () => [{ name: 'Violet Almswood' }]),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === 'ch1'
        ? { name: 'Violet Almswood', campaignId: 'c1', data: JSON.stringify({ backstory: { backstory: BACKSTORY } }) }
        : null)),
    },
    dayaWorkSession: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => db.sessions.filter(s => match(s, { campaignId: where.campaignId }))),
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => db.sessions.find(s => match(s, where)) ?? null),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
        Object.assign(db.sessions.find(s => s.id === where.id)!, data)),
    },
    forgeItem: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => db.forge.find(f => match(f, where)) ?? null),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => db.forge.find(f => f.id === where.id) ?? null),
      update: vi.fn(),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `f${++db.seq}`, ...data };
        db.forge.push(row);
        return row;
      }),
    },
    characterBlockLink: {
      upsert: vi.fn(async ({ where, create, update }: {
        where: { characterId_forgeItemId: { characterId: string; forgeItemId: string } };
        create: Record<string, unknown>; update: Record<string, unknown>;
      }) => {
        const k = where.characterId_forgeItemId;
        const hit = db.links.find(l => l.characterId === k.characterId && l.forgeItemId === k.forgeItemId);
        if (hit) return Object.assign(hit, update);
        const row = { id: `l${++db.seq}`, ...create };
        db.links.push(row);
        return row;
      }),
    },
  },
}));
vi.mock('@/services/godhead-dispatcher', () => ({ emit: vi.fn() }));
vi.mock('@/services/maturity', () => ({ recomputeCampaignAdultOnlySafe: vi.fn() }));
vi.mock('../jewl-identity', () => ({ getJewlGodHead: vi.fn(async () => ({ characterUserId: 'jewl', godHeadId: 'g' })) }));

const { proposeForgeBlueprintTool } = await import('./forge-blueprint');
const ctx = { campaignId: 'c1', actorId: 'jewl', actorRole: 'GODHEAD' };

const ROOT_BODY = {
  description: 'Raised by a grandparent: patience, letters and a quiet house.',
  ageAdded: 12,
  attributes: { clout: 2, celerity: 2, constitution: 3, focus: 4, flow: 3, willpower: 4, wisdom: 5, wit: 5 },
  skills: [{ name: 'Writing', level: 4, governors: ['wit'] }],
  nectars: [],
  thorns: [],
};

function propose(name: string, extra: Record<string, unknown> = {}, body: Record<string, unknown> = ROOT_BODY) {
  return proposeForgeBlueprintTool.handler({
    type: 'root',
    name,
    dataJson: JSON.stringify(body),
    gmNote: 'A bookish childhood under a patient elder.',
    characterId: 'ch1',
    attachmentStory: 'Rosemary Marsh raised Violet from age four in the narrow house; she taught her to write.',
    ...extra,
  }, ctx);
}

beforeEach(() => {
  db.forge.length = 0;
  db.links.length = 0;
  db.sessions.length = 0;
  db.sessions.push({
    id: 's1', campaignId: 'c1', goal: 'Character genesis: Violet Almswood [ch1] — x', status: 'blocked',
    stage: 'BUILDING', plan: `GENESIS BRIEF\nBACKSTORY:\n${BACKSTORY}`, progress: '[]',
  });
});

describe('archetype law at the propose_forge_blueprint boundary', () => {
  it('"Raised by Rosemary" for a seed mentioning Rosemary is rejected with the token named, and recorded', async () => {
    await expect(propose('Raised by Rosemary')).rejects.toThrow(/"Rosemary" \(in name\)/);
    expect(db.forge).toHaveLength(0);
    const notes = JSON.parse(db.sessions[0].progress as string) as string[];
    expect(notes.at(-1)).toMatch(/^ARCHETYPE REJECTED: root "Raised by Rosemary" — generalise Rosemary/);
  });

  it('"Raised by an Elder" + attachmentStory naming Rosemary is accepted and the paint lands on the link', async () => {
    const res = await propose('Raised by an Elder', { localName: "Rosemary's Girl" });
    const out = res.output as Record<string, unknown>;
    expect(out.status).toBe('draft');
    expect(out.attachedTo).toBe('ch1');
    expect(db.links).toHaveLength(1);
    expect(db.links[0]).toMatchObject({ characterId: 'ch1', forgeItemId: out.id, sessionId: 's1', localName: "Rosemary's Girl" });
    expect(db.links[0].story).toContain('Rosemary Marsh');
    expect(JSON.parse(db.links[0].history as string)[0]).toMatchObject({ kind: 'origin' });
  });

  it('rule text with the bearer\'s name is rejected', async () => {
    await expect(propose('Raised by an Elder', {}, { ...ROOT_BODY, description: 'Violet learned patience from an elder.' }))
      .rejects.toThrow(/"Violet" \(in description\)/);
  });

  it('characterId without attachmentStory is rejected; a live genesis requires characterId', async () => {
    await expect(propose('Raised by an Elder', { attachmentStory: undefined })).rejects.toThrow(/attachmentStory is required/);
    await expect(propose('Raised by an Elder', { characterId: undefined, attachmentStory: undefined }))
      .rejects.toThrow(/character genesis is building/);
  });

  it('reuse path: an existing campaign block with that name is attached, not drafted again', async () => {
    db.forge.push({ id: 'existing', campaignId: 'c1', name: 'Raised by Grandmother', type: 'root', status: 'published' });
    const res = await propose('Raised by Grandmother');
    const out = res.output as Record<string, unknown>;
    expect(out).toMatchObject({ id: 'existing', reused: true, source: 'campaign' });
    expect(db.forge).toHaveLength(1); // nothing new drafted
    expect(db.links[0]).toMatchObject({ forgeItemId: 'existing', characterId: 'ch1' });
  });

  it('items follow the same law (NARRATIVE PAINT)', async () => {
    await expect(proposeForgeBlueprintTool.handler({
      type: 'item', name: "Rosemary's Knife", dataJson: JSON.stringify({ description: 'x' }), gmNote: 'n',
    }, ctx)).rejects.toThrow(/"Rosemary" \(in name\)/);
    // The agnostic catalog form passes; no bearer needed for an item.
    const ok = await proposeForgeBlueprintTool.handler({
      type: 'item', name: 'Silver Butter Knife', dataJson: JSON.stringify({ description: 'A tarnished silver butter knife.' }), gmNote: 'n',
    }, ctx);
    expect((ok.output as Record<string, unknown>).status).toBe('draft');
  });
});
