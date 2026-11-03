import { describe, it, expect, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('./model-client', () => ({ chat: vi.fn() }));
vi.mock('@/ai/network/translator', async () => await vi.importActual('@/ai/network/translator'));
import { orderPrompt, parsePiece } from './orders';
import { composerPrompt, parsePlan } from './composer';
import { newTranslationMap, translateOut, translateBack } from '@/ai/network/translator';

describe('orders — narrow, nameless pieces (SIMULATION-COMPOSER-DESIGN-2026-11-03)', () => {
  it('a perception order carries only senses, surroundings and the event, and asks for JSON', () => {
    const p = orderPrompt({ kind: 'perception', brief: { senses: ['hearing'], surroundings: ['A small apartment, dark.'], event: "Violet's phone rings.", own: false } });
    expect(p.system).toMatch(/only judge perception/);
    expect(p.system).toMatch(/JSON only/);
    expect(p.user).toContain('Senses working: hearing');
    expect(p.user).toContain("What just happened: Violet's phone rings.");
  });
  it('names cross as placeholders and come back', () => {
    const { user } = orderPrompt({ kind: 'voice', brief: { gist: 'Kristopher is calling. I will not answer.', voice: 'Plain.', recent: [] } });
    const map = newTranslationMap();
    const out = translateOut(user, [{ name: 'Kristopher', kind: 'person' }], map).text;
    expect(out).not.toContain('Kristopher');
    expect(out).toContain('Person-A');
    expect(translateBack('{"thought":"Person-A again."}', map)).toContain('Kristopher again.');
  });
  it('parses a valid piece and refuses a malformed one', () => {
    expect(parsePiece('recall', 'sure: {"wakes":[{"i":0,"why":"the bill"}]}')).toEqual({ wakes: [{ i: 0, why: 'the bill' }] });
    expect(parsePiece('mood', '{"feel":"x"}')).toBeNull();
    expect(parsePiece('voice', 'no json here')).toBeNull();
  });
});

describe('the composer — the local plan', () => {
  it('holds the pieces and asks for a gist, an impulse and why', () => {
    const p = composerPrompt(
      { name: 'Violet', identity: 'A writer.', desires: 'Quiet.', innerSoFar: '', held: ['her phone'], facts: ['The door is locked.'], sinceOwn: 'about a minute' },
      { perceived: 'My phone rings.', felt: 'You are tense.', wakes: [{ text: 'About 2 days ago: he came to the door', why: 'it might be him' }] },
    );
    expect(p).toContain('PERCEPTION (what just reached Violet): My phone rings.');
    expect(p).toContain('it might be him');
    expect(p).toMatch(/"impulse": "speak"\|"act"\|"stay"/);
  });
  it('parses a plan and refuses an empty gist', () => {
    expect(parsePlan('{"gist":"It rings. I let it.","impulse":"stay","why":"not ready"}')).toEqual({ gist: 'It rings. I let it.', impulse: 'stay', why: 'not ready' });
    expect(parsePlan('{"gist":"  ","impulse":"stay"}')).toBeNull();
    expect(parsePlan('{"gist":"x","impulse":"shout"}')).toBeNull();
  });
});

import { openingOf } from './composer';
describe('a voice, not a formula (session 2 live, 2026-11-03)', () => {
  it('reads the opening of a thought', () => {
    expect(openingOf('I think I notice the room is doing something.')).toBe('i think i');
    expect(openingOf("  Eight months of nothing.")).toBe('eight months of');
  });
});
