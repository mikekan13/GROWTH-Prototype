/**
 * Trim-not-reject at the JEWL tool boundary (perf pass 2026-10-12).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

vi.mock('@/lib/db', () => ({ prisma: {} }));
vi.mock('@/services/godhead-dispatcher', () => ({ emit: vi.fn() }));
vi.mock('@/services/maturity', () => ({ recomputeCampaignAdultOnlySafe: vi.fn() }));
vi.mock('../jewl-identity', () => ({ getJewlGodHead: vi.fn() }));

import { coerceToolInput, coerceToSchema, trimAtSentence, parseDurationString, describeLimits } from './coerce';
import { proposeForgeBlueprintTool } from './forge-blueprint';
import { validateForgeData } from '@/services/forge-schemas';

const sentence = 'The ferryman keeps his coin in his cheek. ';

describe('trimAtSentence', () => {
  it('leaves short text alone', () => {
    expect(trimAtSentence('short.', 10)).toBe('short.');
  });
  it('cuts at the last sentence end within the limit and ellipsises', () => {
    const s = sentence.repeat(30);
    const out = trimAtSentence(s, 600);
    expect(out.length).toBeLessThanOrEqual(600);
    expect(out.endsWith('cheek.…')).toBe(true);
  });
  it('falls back to a word boundary when no sentence ends late enough', () => {
    const out = trimAtSentence('word '.repeat(50), 40);
    expect(out.length).toBeLessThanOrEqual(40);
    expect(out.endsWith('word…')).toBe(true);
  });
});

describe('parseDurationString', () => {
  it.each([
    ['3 rounds', { amount: 3, unit: 'rounds' }],
    ['1 hour', { amount: 1, unit: 'hours' }],
    ['2d', { amount: 2, unit: 'days' }],
    ['one day', { amount: 1, unit: 'days' }],
  ])('%s', (s, want) => expect(parseDurationString(s)).toEqual(want));
  it('refuses prose', () => {
    expect(parseDurationString('until she forgives him')).toBeNull();
  });
});

describe('propose_forge_blueprint at the boundary', () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  beforeEach(() => log.mockClear());

  const base = {
    type: 'nectar',
    name: 'Ferryman\'s Coin',
    dataJson: JSON.stringify({ description: 'A coin.', pillar: 'spirit' }),
    gmNote: 'ok',
  };

  it('an over-long gmNote is trimmed and then accepted by the schema', () => {
    const input = { ...base, gmNote: sentence.repeat(25) }; // ~1050 chars
    expect(proposeForgeBlueprintTool.inputSchema.safeParse(input).success).toBe(false);
    const { value, coerced } = coerceToolInput(proposeForgeBlueprintTool, input);
    expect(coerced).toEqual(['gmNote']);
    const parsed = proposeForgeBlueprintTool.inputSchema.parse(value) as { gmNote: string };
    expect(parsed.gmNote.length).toBeLessThanOrEqual(600);
    expect(parsed.gmNote.endsWith('…')).toBe(true);
    expect(log).toHaveBeenCalledWith('[tools] coerced propose_forge_blueprint.gmNote');
  });

  it('a duration string inside the body is coerced to {amount, unit}; an over-long description trimmed', () => {
    const body = {
      description: sentence.repeat(15), // ~630 > 500
      pillar: 'spirit',
      effects: [{ kind: 'triggered', name: 'Toll', trigger: 'a debt is named aloud', duration: '3 rounds' }],
    };
    const input = { ...base, dataJson: JSON.stringify(body) };
    expect(() => validateForgeData('nectar', body)).toThrow();
    const { value, coerced } = coerceToolInput(proposeForgeBlueprintTool, input);
    expect(coerced).toEqual(expect.arrayContaining(['dataJson.description', 'dataJson.effects.0.duration']));
    const fixed = JSON.parse((value as { dataJson: string }).dataJson);
    expect(fixed.effects[0].duration).toEqual({ amount: 3, unit: 'rounds' });
    expect(() => validateForgeData('nectar', fixed)).not.toThrow();
  });

  it('a body sent as an object is stringified', () => {
    const { value, coerced } = coerceToolInput(proposeForgeBlueprintTool, { ...base, dataJson: { description: 'x', pillar: 'body' } });
    expect(coerced).toContain('dataJson');
    expect(typeof (value as { dataJson: unknown }).dataJson).toBe('string');
  });

  it('garbage still rejects: untouched input, schema refuses it', () => {
    for (const bad of [
      { ...base, type: 'location' },          // not a forge type
      { ...base, gmNote: '' },                // min(1) is not a length repair
      { ...base, name: 'N'.repeat(150) },     // identifiers are never trimmed
      { ...base, dataJson: '{not json' },     // unusable body
    ]) {
      const { value, coerced } = coerceToolInput(proposeForgeBlueprintTool, bad);
      expect(coerced).toEqual([]);
      expect(value).toBe(bad);
    }
    const prose = { ...base, dataJson: JSON.stringify({ description: 'x', pillar: 'soul', effects: [{ kind: 'triggered', name: 'T', trigger: 't', duration: 'until dawn breaks over the hills' }] }) };
    const { value } = coerceToolInput(proposeForgeBlueprintTool, prose);
    expect(() => validateForgeData('nectar', JSON.parse((value as { dataJson: string }).dataJson))).toThrow();
  });
});

describe('coerceToSchema', () => {
  it('never truncates arrays', () => {
    const s = z.object({ tags: z.array(z.string()).max(2) });
    const input = { tags: ['a', 'b', 'c'] };
    expect(coerceToSchema(s, input)).toEqual({ value: input, coerced: [] });
  });
});

describe('describeLimits', () => {
  it('states every string/array limit in the schema', () => {
    const line = describeLimits(z.toJSONSchema(proposeForgeBlueprintTool.inputSchema) as Record<string, unknown>);
    expect(line).toContain('name ≤100 chars');
    expect(line).toContain('gmNote ≤600 chars');
    expect(line).toContain('chainNote ≤600 chars');
  });
  it('is empty for a schema with no limits', () => {
    expect(describeLimits(z.toJSONSchema(z.object({ a: z.string() })) as Record<string, unknown>)).toBe('');
  });
});
