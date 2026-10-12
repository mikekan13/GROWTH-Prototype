/** A question is a prod at every genesis stage (2026-10-12) — the fallback detector and the blocked-on-prod reason. */
import { describe, it, expect, vi } from 'vitest';
import {
  findGmQuestion, warnQuestionOutsideProd, prodsBlockedReason, isProdsBlocked, blockedProdIds, PRODS_BLOCKED_REASON,
} from './genesis-question';
import { genesisNeedsYou } from './jewl-work';
import type { GenesisProgress } from '@/services/character-genesis-progress';

describe('findGmQuestion — the fallback detector', () => {
  it('fires on the Violet report that hid "fugue vs bleed" in the Log', () => {
    const report = 'The Terminal just tore. Build was already pressed.\n\nOne question I didn\'t get to ask before the gate closed: '
      + '**when Violet shifts into a written character, is it a fugue (she\'s gone, the alter is present) or a bleed (she\'s still there but overlaid)?** '
      + 'That shapes the thorn\'s core mechanic. Answer when you can.';
    expect(findGmQuestion(report)).toMatch(/fugue .* bleed .*\?$/);
  });

  it('fires on a plain question to "you"', () => {
    expect(findGmQuestion('Drafts are in. Do you want her mother alive?')).toBe('Do you want her mother alive?');
  });

  it('is quiet on reports without a GM question', () => {
    expect(findGmQuestion('Six drafts in the Forge. Who knows what she saw? Not her.')).toBeNull();
    expect(findGmQuestion('Twenty memories sealed. Approve the drafts when ready.')).toBeNull();
    expect(findGmQuestion(null)).toBeNull();
  });

  it('logs [genesis] question-outside-prod', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(warnQuestionOutsideProd('s1', 'Is it a fugue or a bleed, would you say?', 'cycle 2')).not.toBeNull();
    expect(warn.mock.calls[0][0]).toMatch(/^\[genesis\] question-outside-prod session=s1 \(cycle 2\)/);
    warn.mockClear();
    expect(warnQuestionOutsideProd('s1', 'All built.', 'cycle 3')).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('blocked-on-prod reason', () => {
  it('carries the open prod ids', () => {
    const r = prodsBlockedReason(['p1', 'p2']);
    expect(r).toBe(`${PRODS_BLOCKED_REASON} [p1,p2]`);
    expect(isProdsBlocked(r)).toBe(true);
    expect(blockedProdIds(r)).toEqual(['p1', 'p2']);
    expect(isProdsBlocked('5 Forge drafts awaiting GM review')).toBe(false);
    expect(blockedProdIds(PRODS_BLOCKED_REASON)).toEqual([]);
  });
});

describe('Needs-you lists mid-build prods', () => {
  it('an OPEN prod after Build is a Needs-you item with the question', () => {
    const p = {
      state: 'waiting', wait: 'prods', prodding: false, gmSteps: [],
      prods: [
        { id: 'p1', round: 2, order: 1, anchorQuote: 'a', question: 'Fugue or bleed?', why: 'w', kind: 'MECHANICAL_CHECK', status: 'OPEN', answer: null, jewlFill: null, decidedAt: null },
        { id: 'p0', round: 1, order: 1, anchorQuote: 'a', question: 'Old one', why: 'w', kind: 'CREATIVE', status: 'ANSWERED', answer: 'x', jewlFill: null, decidedAt: null },
      ],
    } as unknown as GenesisProgress;
    const items = genesisNeedsYou('s1', 'Violet', p);
    expect(items).toEqual([{ id: 'p1', kind: 'prod', sessionId: 's1', title: 'JEWL asks about Violet', detail: 'Fugue or bleed?' }]);
    expect(items.some(i => /Log/.test(String(i.detail)))).toBe(false);
  });
});
