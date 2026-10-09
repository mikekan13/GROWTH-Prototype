import { describe, it, expect, vi } from 'vitest';
import { DOMAINS } from '@/daya/domains';
import { MAGIC_SCHOOLS } from '@/types/growth';
import {
  ASPECT_KINDS, HEAD_DOMAIN_KEYS, aspectKey, parseAspectKey, aspectDomains, abilityDomains, materialDomains,
  schoolToDomain, itemAbilityIds, listAspects,
} from './aspects';
import type { GrowthWorldItem } from '@/types/item';

// Materials carry no domain tags in the starter catalog yet — give two a few for the tests.
vi.mock('@/lib/materials', () => ({
  getMaterial: (n: string) => ({
    Moonsilver: { name: 'Moonsilver', domains: ['divination', 'restoration'] },
    Bloodiron: { name: 'Bloodiron', domains: ['dissolution', 'force', 'nonsense'] },
    Steel: { name: 'Steel' },
  } as Record<string, { name: string; domains?: string[] }>)[n],
}));

describe('head-domain tags', () => {
  it('HEAD_DOMAIN_KEYS are exactly the ten in daya/domains.ts and the ten schools', () => {
    expect([...HEAD_DOMAIN_KEYS].sort()).toEqual(DOMAINS.map((d) => d.key).sort());
    expect([...HEAD_DOMAIN_KEYS].sort()).toEqual(Object.keys(MAGIC_SCHOOLS).map((s) => s.toLowerCase()).sort());
  });

  it('tags every aspect kind with a non-empty set of head domains, no repeats', () => {
    for (const k of ASPECT_KINDS) {
      expect(k.domains.length).toBeGreaterThan(0);
      expect(new Set(k.domains).size).toBe(k.domains.length);
      for (const d of k.domains) expect(HEAD_DOMAIN_KEYS).toContain(d);
    }
    expect(new Set(ASPECT_KINDS.map((k) => k.key)).size).toBe(ASPECT_KINDS.length);
  });

  it("follows Mike's 2026-10-09 picks", () => {
    expect(aspectDomains('history')).toEqual(['divination']);
    expect(aspectDomains('thoughts')).toEqual(['enchantment']);
    expect(aspectDomains('material')).toEqual(['alteration']);
    expect(aspectDomains('hardness')).toEqual(['abjuration']);
    expect(aspectDomains('damage')).toEqual(['force']);
    expect(aspectDomains('value')).toEqual(['fortune']);
    expect(aspectDomains('nope')).toEqual([]);
  });

  it('maps school names to head domains', () => {
    expect(schoolToDomain('Force')).toBe('force');
    expect(schoolToDomain(' RESTORATION ')).toBe('restoration');
    expect(schoolToDomain('Pyromancy')).toBeNull();
    expect(schoolToDomain(undefined)).toBeNull();
  });
});

describe('ability tags: Fortune + its school', () => {
  it('a fire (Force) enchantment = Force + Fortune', () => {
    expect(abilityDomains({ name: 'Ember Bite', description: '', school: 'Force' })).toEqual({ domains: ['fortune', 'force'], schoolKnown: true });
  });
  it('no readable school → Fortune only, flagged', () => {
    expect(abilityDomains({ name: 'Oathbound', description: '' })).toEqual({ domains: ['fortune'], schoolKnown: false });
    expect(abilityDomains({ name: 'X', description: '', school: 'Pyromancy' })).toEqual({ domains: ['fortune'], schoolKnown: false });
    expect(abilityDomains({ name: 'Y', description: '', school: 'Fortune' }).domains).toEqual(['fortune']);
  });
  it('resolves an ability aspect key against the item', () => {
    const item: GrowthWorldItem = {
      description: '',
      itemAbilities: [{ name: 'Ember Bite', description: '', school: 'Force' }, { name: 'Oathbound', description: '' }],
    };
    expect(aspectDomains('ability:ember-bite', item)).toEqual(['fortune', 'force']);
    expect(aspectDomains('ability:oathbound', JSON.stringify(item))).toEqual(['fortune']);
    expect(aspectDomains('ability:missing', item)).toEqual(['fortune']);
    expect(aspectDomains('ability:ember-bite')).toEqual(['fortune']);
  });
});

describe('material tags', () => {
  it("adds each material's own tags to Alteration, ignoring junk tags", () => {
    expect(materialDomains(['Moonsilver', 'Bloodiron', 'Steel', 'Unknown', null])).toEqual(['divination', 'restoration', 'dissolution', 'force']);
    const item: GrowthWorldItem = { description: '', primaryMaterial: 'Steel', subordinateMaterials: ['Moonsilver'] };
    expect(aspectDomains('material', item)).toEqual(['alteration', 'divination', 'restoration']);
    expect(aspectDomains('material', { description: '', primaryMaterial: 'Steel' })).toEqual(['alteration']);
    // other aspects never pick up material tags
    expect(aspectDomains('hardness', item)).toEqual(['abjuration']);
  });
});

describe('aspect keys', () => {
  it('round-trips instance keys', () => {
    expect(aspectKey('damage')).toBe('damage');
    expect(aspectKey('ability', 'ember-bite')).toBe('ability:ember-bite');
    expect(parseAspectKey('ability:ember-bite')).toEqual({ kind: 'ability', instanceId: 'ember-bite' });
    expect(parseAspectKey('history')).toEqual({ kind: 'history', instanceId: null });
  });

  it('gives item abilities stable, unique ids from their names', () => {
    expect(itemAbilityIds([
      { name: 'Ember Bite', description: '' },
      { name: 'Ember bite!', description: '' },
      { name: '', description: '' },
    ])).toEqual(['ember-bite', 'ember-bite-2', 'ability-3']);
    expect(itemAbilityIds(undefined)).toEqual([]);
  });
});

describe('listAspects', () => {
  it('a bare item has only the intrinsic aspects', () => {
    expect(listAspects({ description: 'a white candlestick' })).toEqual(['identity', 'appearance', 'value', 'history']);
  });

  it('reads an enchanted sword field by field, one aspect per ability', () => {
    const sword: GrowthWorldItem = {
      description: 'an old longsword',
      primaryMaterial: 'Steel',
      baseResist: 18,
      weightLbs: 3,
      condition: 2,
      properties: ['Sharp'],
      quality: 7,
      rarity: 8,
      value: 400,
      damage: { piercing: 2, slashing: 6, heat: 0, decay: 0, cold: 0, bashing: 1, energy: 0 },
      itemAbilities: [{ name: 'Ember Bite', description: 'the edge burns' }, { name: 'Oathbound', description: '' }],
    };
    expect(listAspects(sword)).toEqual([
      'identity', 'appearance', 'weight', 'damage', 'hardness', 'material', 'properties',
      'quality', 'condition', 'rarity', 'value', 'history', 'ability:ember-bite', 'ability:oathbound',
    ]);
  });

  it('honours deprecated aliases and treats condition 0 as present', () => {
    const a = listAspects({ description: '', material: 'Iron', resistance: 4, weightLevel: 2, weaponProperties: ['Blunt'], condition: 0 });
    expect(a).toEqual(expect.arrayContaining(['material', 'hardness', 'weight', 'properties', 'condition']));
  });

  it('reads raw CampaignItem.data JSON and survives junk', () => {
    expect(listAspects(JSON.stringify({ description: 'x', quality: 3 }))).toContain('quality');
    expect(listAspects('not json')).toEqual(['identity', 'appearance', 'value', 'history']);
    expect(listAspects(null)).toEqual(['identity', 'appearance', 'value', 'history']);
    expect(listAspects('[1,2]')).toEqual(['identity', 'appearance', 'value', 'history']);
  });
});
