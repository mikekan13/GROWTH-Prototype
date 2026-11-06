import { describe, it, expect, vi } from 'vitest';
import type { BeingSpeakingPhase } from '@/types/campaign-events';
import { reduceThinking, reduceSpeaking, isCardPending, reconcileCardPayload, mergeKeepingPrinted, THINKING_MAX_MS, type HeldLine, type ThinkingCard } from './beat-state';
import { createGrowthReveal } from './card-reveal';
import { mergeEvents } from './feed-paging';

const U = 'u1', C = 'c1';
const start: BeingSpeakingPhase = { phase: 'start', utteranceId: U, characterId: C, characterName: 'Violet' };
const partial = (text: string): BeingSpeakingPhase => ({ phase: 'partial', utteranceId: U, characterId: C, text, delta: '' });
const final = (text: string, action: 'speak' | 'rest' = 'speak'): BeingSpeakingPhase => ({ phase: 'final', utteranceId: U, characterId: C, action, text, revoiced: false });
const retract: BeingSpeakingPhase = { phase: 'retract', utteranceId: U, characterId: C, reason: 'seal', rule: 'r' };

function run(phases: BeingSpeakingPhase[], warn = vi.fn()) {
  let lines = new Map<string, HeldLine>();
  for (const p of phases) lines = reduceSpeaking(lines, p, 1000, 8000, warn).lines;
  return { lines, warn };
}

describe('speaking lines: final only', () => {
  it('a partial never yields rendered text', () => {
    const { lines } = run([start, partial('He'), partial('Hello there')]);
    const l = lines.get(U)!;
    expect(l.state).toBe('speaking');
    expect(l.text).toBe('');
  });
  it('the final carries the text, once', () => {
    const { lines } = run([start, partial('Hel'), final('Hello there.')]);
    expect(lines.get(U)).toMatchObject({ state: 'final', text: 'Hello there.' });
  });
  it('a retract of a never-shown line is a no-op without a warning', () => {
    const { lines, warn } = run([start, partial('x'), retract, final('Better.')]);
    expect(warn).not.toHaveBeenCalled();
    expect(lines.get(U)!.text).toBe('Better.');
  });
  it('a retract of a shown line warns with the utteranceId and changes nothing', () => {
    const { lines, warn } = run([start, final('Printed.'), retract]);
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0][0])).toContain(U);
    expect(lines.get(U)).toMatchObject({ state: 'final', text: 'Printed.' });
  });
  it('a second final never rewrites a shown line', () => {
    const { lines, warn } = run([start, final('First.'), final('Second.')]);
    expect(lines.get(U)!.text).toBe('First.');
    expect(warn).toHaveBeenCalled();
  });
  it('a rest final prints nothing', () => {
    const r = reduceSpeaking(run([start]).lines, final('', 'rest'), 1, 8000);
    expect(r.lines.size).toBe(0);
    expect(r.schedule).toEqual({ id: U, ms: 0 });
  });
});

describe('thinking cards', () => {
  const listening = (cards: ThinkingCard[], id = C, at = 100) => reduceThinking(cards, { type: 'listening', characterId: id, name: 'Violet', at });
  it('opens on listening and on a speaking start, one card per being', () => {
    let c = listening([]);
    c = reduceThinking(c, { type: 'speaking', phase: start, at: 200 });
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ characterId: C, stage: 'voicing', at: 100 });
    c = listening(c, 'c2');
    expect(c.map(x => x.characterId).sort()).toEqual(['c1', 'c2']);
  });
  it('a partial keeps the card; it carries no text', () => {
    const c = reduceThinking(listening([]), { type: 'speaking', phase: partial('secret words'), at: 1 });
    expect(JSON.stringify(c)).not.toContain('secret words');
  });
  it('the final card replaces it: dissolving, then removed', () => {
    let c = reduceThinking(listening([]), { type: 'card', characterIds: [C] });
    expect(c[0].dissolving).toBe(true);
    c = reduceThinking(c, { type: 'remove', characterId: C });
    expect(c).toHaveLength(0);
  });
  it('a being that ends with nothing dissolves', () => {
    const c = reduceThinking(listening([]), { type: 'done', characterId: C, posted: false });
    expect(c[0].dissolving).toBe(true);
    expect(reduceThinking(listening([]), { type: 'done', characterId: C, posted: true })[0].dissolving).toBeUndefined();
  });
  it('expires after 90 s', () => {
    expect(reduceThinking(listening([], C, 0), { type: 'expire', now: THINKING_MAX_MS - 1 })).toHaveLength(1);
    expect(reduceThinking(listening([], C, 0), { type: 'expire', now: THINKING_MAX_MS })).toHaveLength(0);
  });
});

const seg = (kind: string, text: string) => ({ kind, text });
const row = (id: string, payload: Record<string, unknown>) => ({ id, timestamp: '2026-11-05T10:00:00Z', payload }) as never;

describe('card rows: held until built, append-only', () => {
  it('a row is held until the server settles it (printed once, in its final words), printed when old regardless', () => {
    const p = { kind: 'being_thought', thought: 't' };
    expect(isCardPending(p, 1000)).toBe(true);
    expect(isCardPending(p, THINKING_MAX_MS + 1)).toBe(false);
    // 2026-11-06: segments alone no longer print the card — the act may still be joining; settled does.
    expect(isCardPending({ ...p, segments: [seg('thought', 't')] }, 1)).toBe(true);
    expect(isCardPending({ ...p, segments: [seg('thought', 't')], settled: true }, 1)).toBe(false);
  });
  it('later segments append without changing earlier text', () => {
    const prev = { kind: 'being_thought', segments: [seg('thought', 'I wonder.')] };
    const next = { kind: 'being_thought', segments: [seg('thought', 'I wonder.'), seg('action', 'She opens the door.')] };
    const out = reconcileCardPayload(prev, next) as typeof next;
    expect(out.segments.map(s => s.text)).toEqual(['I wonder.', 'She opens the door.']);
  });
  it('a rewrite of printed text is refused and warned', () => {
    const warn = vi.fn();
    const prev = { kind: 'being_thought', segments: [seg('thought', 'I wonder.')] };
    const next = { kind: 'being_thought', segments: [seg('thought', 'She wondered.')] };
    const out = reconcileCardPayload(prev, next, 'e1', warn) as typeof prev;
    expect(out.segments.map(s => s.text)).toEqual(['I wonder.']);
    expect(warn).toHaveBeenCalled();
  });
  it('mergeEvents keeps printed text when a row is re-pushed', () => {
    const a = row('ev-1', { kind: 'being_thought', segments: [seg('thought', 'One.')] });
    const b = row('ev-1', { kind: 'being_thought', segments: [seg('thought', 'One.'), seg('speech', 'Two.')] });
    const m = mergeEvents([a], [b]);
    expect((m[0].payload as { segments: unknown[] }).segments).toHaveLength(2);
    expect(mergeKeepingPrinted(undefined, b)).toBe(b);
  });
});

describe('growth reveal never takes printed characters back', () => {
  it('history stays whole; a grown card types only the new tail', () => {
    const g = createGrowthReveal();
    expect(g.visible(50, undefined, 0)).toBe(50);
    expect(g.visible(50, undefined, 500)).toBe(50);
    expect(g.visible(80, undefined, 1000)).toBe(50);
    expect(g.visible(80, undefined, 1000 + 18 * 30)).toBe(80);
  });
  it('a card typing when it grows never decreases', () => {
    const g = createGrowthReveal();
    const a = g.visible(100, 0, 900);
    const b = g.visible(200, 0, 900);
    expect(b).toBeGreaterThanOrEqual(a);
  });
});
