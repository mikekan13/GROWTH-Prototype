/** Sheet audit (2026-10-12): block-link shaping/dedupe, the age rule, completion read, local-name-first render. */
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  shapeBlockLinks,
  computeDisplayAge,
  formatAge,
  readCompletion,
  cleanArchetypeName,
  type RawBlockLinkRow,
  type CharacterSheetFacts,
} from './character-sheet-facts';
import { BlockRow, OriginSection, resolveBlocks } from '@/components/character/CharacterGenesisSections';

const fi = (id: string, type: string, name: string, status = 'published', data: Record<string, unknown> = {}, kv: bigint | null = null) =>
  ({ id, type, name, status, data: JSON.stringify(data), karmicValue: kv });
const link = (id: string, forge: ReturnType<typeof fi>, over: Partial<RawBlockLinkRow> = {}): RawBlockLinkRow => ({
  id, forgeItemId: forge.id, localName: null, story: `story ${id}`, history: '[]', createdAt: `2026-10-12T12:0${id.length}:00Z`, forgeItem: forge, ...over,
});

describe('shapeBlockLinks', () => {
  it('dedupes by forgeItemId (first wins)', () => {
    const seed = fi('f1', 'seed', 'Human');
    const out = shapeBlockLinks([link('a', seed), link('b', seed, { localName: 'dupe' })]);
    expect(out).toHaveLength(1);
    expect(out[0].linkId).toBe('a');
  });

  it("hides a superseded draft of the same archetype (Violet's duplicate root)", () => {
    const draft = fi('r1', 'root', 'Grandparent Household [w:y0d7]', 'superseded', {}, BigInt(49));
    const live = fi('r2', 'root', 'Grandparent Household', 'published', { ageAdded: 18 }, BigInt(61));
    const out = shapeBlockLinks([link('a', draft), link('bb', live, { localName: "Rosemary's House" })]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ forgeItemId: 'r2', displayName: "Rosemary's House", archetypeName: 'Grandparent Household', kv: 61, ageAdded: 18 });
  });

  it('keeps a dead archetype when it is the only one of its kind (nothing vanishes)', () => {
    const out = shapeBlockLinks([link('a', fi('r1', 'root', 'Lone Root', 'superseded'))]);
    expect(out).toHaveLength(1);
  });

  it('reads rule text, declared KV fallback, maturity flags; orders seed→root→branch→thorn', () => {
    const thorn = fi('t1', 'thorn', 'Written Self', 'published', { mechanicalEffect: 'gains confused', declaredKv: -10, maturityFlags: ['mental-health', 3] });
    const branch = fi('b1', 'branch', 'Violated Trust');
    const seed = fi('s1', 'seed', 'Human', 'published', {}, BigInt(225));
    const out = shapeBlockLinks([link('a', thorn), link('bb', branch, { localName: 'The Key' }), link('ccc', seed)]);
    expect(out.map(b => b.kind)).toEqual(['seed', 'branch', 'thorn']);
    expect(out[2]).toMatchObject({ ruleText: 'gains confused', kv: -10, maturityFlags: ['mental-health'], displayName: 'Written Self', localName: null });
    expect(out[0].kv).toBe(225);
  });

  it('skips links whose ForgeItem is gone; strips workspace tags', () => {
    expect(shapeBlockLinks([{ ...link('a', fi('x', 'root', 'X')), forgeItem: null }])).toEqual([]);
    expect(cleanArchetypeName('Grandparent Household [w:y0d7]')).toBe('Grandparent Household');
  });
});

describe('age rule (currentCycle − birthCycle → identity.age → "—", never 0)', () => {
  it('uses the clock when birthCycle exists', () => {
    expect(computeDisplayAge({ birthCycle: -25, fatedAge: 80 }, 0)).toEqual({ value: 25, source: 'cycle', fatedAge: 80 });
    expect(computeDisplayAge({ birthCycle: 10.5 }, 40)).toMatchObject({ value: 29, source: 'cycle' });
  });
  it('falls back to legacy identity.age', () => {
    expect(computeDisplayAge({ identity: { age: 31 } }, 0)).toMatchObject({ value: 31, source: 'identity' });
    expect(computeDisplayAge({ identity: { age: '19' } }, null)).toMatchObject({ value: 19, source: 'identity' });
    expect(computeDisplayAge({ birthCycle: 3, identity: { age: 31 } }, null)).toMatchObject({ value: 31, source: 'identity' });
  });
  it('is unknown (—) rather than 0 when nothing is recorded — Violet', () => {
    const violet = { identity: { name: 'Violet' }, fatedAge: 80 };
    const age = computeDisplayAge(violet, 0);
    expect(age).toEqual({ value: null, source: null, fatedAge: 80 });
    expect(formatAge(age)).toBe('—');
    expect(formatAge(computeDisplayAge({ identity: { age: 0 } }, 0))).toBe('—');
    expect(formatAge(null)).toBe('—');
  });
});

describe('readCompletion (defensive — the field is another lane’s)', () => {
  it('absent / complete → null', () => {
    expect(readCompletion(undefined)).toBeNull();
    expect(readCompletion('complete')).toBeNull();
    expect(readCompletion({ complete: true })).toBeNull();
  });
  it('awaiting image in any shape', () => {
    expect(readCompletion('AWAITING_IMAGE')).toEqual({ awaitingImage: true, label: 'awaiting image' });
    expect(readCompletion({ missing: ['portrait'] })).toEqual({ awaitingImage: true, label: 'awaiting image' });
    expect(readCompletion({ awaitingImage: true, label: 'awaiting image' })).toEqual({ awaitingImage: true, label: 'awaiting image' });
  });
});

describe('local name over archetype (narrative paint)', () => {
  const live = fi('r2', 'root', 'Grandparent Household', 'published', {}, BigInt(61));
  const [painted] = shapeBlockLinks([link('a', live, { localName: "Rosemary's House" })]);

  it('shows the local name first and the archetype beneath', () => {
    const html = renderToStaticMarkup(createElement(BlockRow, { block: painted }));
    const local = html.indexOf('Rosemary&#x27;s House');
    const arche = html.indexOf('archetype: Grandparent Household');
    expect(local).toBeGreaterThan(-1);
    expect(arche).toBeGreaterThan(local);
    expect(html).toContain('+61 KV');
  });

  it('an unpainted block shows only the archetype name (no "archetype:" line)', () => {
    const [plain] = shapeBlockLinks([link('a', fi('t', 'thorn', 'Sealed Threshold', 'published', { maturityFlags: ['sexual-violence'] }, BigInt(-18)))]);
    const html = renderToStaticMarkup(createElement(BlockRow, { block: plain, showRule: true }));
    expect(html).toContain('Sealed Threshold');
    expect(html).not.toContain('archetype:');
    expect(html).toContain('⚠ sexual-violence');
    expect(html).toContain('-18 KV');
  });

  it('links win over the legacy sheet; legacy shows only when no links exist', () => {
    const facts = { blocks: [painted], age: { value: null, source: null, fatedAge: 80 }, tkv: 0, memories: { count: 0, lastAt: null }, vines: [] } as CharacterSheetFacts;
    const sheet = { creation: { seed: { name: 'Human' }, root: { name: 'Old Root' } } };
    const withLinks = renderToStaticMarkup(createElement(OriginSection, { blocks: resolveBlocks({ ...facts, blocks: [...facts.blocks] }, sheet) }));
    expect(withLinks).toContain('Rosemary&#x27;s House');
    expect(withLinks).not.toContain('Old Root');
    const legacy = renderToStaticMarkup(createElement(OriginSection, { blocks: resolveBlocks({ ...facts, blocks: [] }, sheet) }));
    expect(legacy).toContain('Old Root');
    expect(legacy).toContain('branches: none yet');
  });
});
