import { describe, it, expect } from 'vitest';
import { DOMAINS } from '@/daya/domains';
import {
  ASPECT_KINDS, KNOWLEDGE_DOMAINS, aspectKey, parseAspectKey, domainOfAspect, itemAbilityIds, listAspects, knowledgeDomain,
} from './aspects';
import type { GrowthWorldItem } from '@/types/item';

describe('domain tree', () => {
  it('hangs every knowledge sub-domain under one of the ten head domains', () => {
    const heads = new Set(DOMAINS.map((d) => d.key));
    for (const sub of KNOWLEDGE_DOMAINS) expect(heads.has(sub.parent)).toBe(true);
  });

  it('never repeats a head domain as a sub-domain (no parallel top-level list)', () => {
    const heads = new Set(DOMAINS.map((d) => d.key));
    for (const sub of KNOWLEDGE_DOMAINS) expect(heads.has(sub.key)).toBe(false);
    expect(new Set(KNOWLEDGE_DOMAINS.map((d) => d.key)).size).toBe(KNOWLEDGE_DOMAINS.length);
  });

  it('tags every aspect kind with a known sub-domain', () => {
    for (const k of ASPECT_KINDS) expect(knowledgeDomain(k.domain)).toBeDefined();
    expect(new Set(ASPECT_KINDS.map((k) => k.key)).size).toBe(ASPECT_KINDS.length);
  });

  it('resolves an aspect key to its sub-domain and head domain', () => {
    expect(domainOfAspect('damage')).toMatchObject({ sub: { key: 'weapons' }, head: { key: 'force' } });
    expect(domainOfAspect('ability:flame-tongue')).toMatchObject({ sub: { key: 'arcana' } });
    expect(domainOfAspect('value')?.head.key).toBe('fortune');
    expect(domainOfAspect('nope')).toBeNull();
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
