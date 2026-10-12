import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { assertNoTableContent, scrubForCloud, WITHHELD } from '../table-guard';
import { route, WallViolationError } from '../route';
import { historyForLane, toolResultForLane, messageTexts } from '@/ai/copilot/cloud-history';

const at = new Date('2026-10-12T10:00:00Z');
const ambientRaw = { role: 'user', username: '[ambient]', content: 'grab me a soda — Ruth, where is the key?', createdAt: at, contentClass: 'table', icText: null, actions: JSON.stringify({ source: 'TABLE_AMBIENT' }) };
const ambientSplit = { ...ambientRaw, contentClass: 'fiction', icText: 'Ruth, where is the key?' };
const legacyAmbient = { role: 'user', username: '[ambient]', content: 'brb pizza', createdAt: at, contentClass: null, icText: null, actions: null };
const typed = { role: 'user', username: 'mike', content: 'The door creaks open.', createdAt: at, contentClass: 'fiction', icText: null, actions: null };
const reply = { role: 'assistant', username: null, content: 'Ruth shrugs.', createdAt: at, contentClass: null, icText: null, actions: null };

let savedLocal: string | undefined;
beforeEach(() => { savedLocal = process.env.AI_LOCAL_BASE_URL; delete process.env.AI_LOCAL_BASE_URL; });
afterEach(() => { if (savedLocal === undefined) delete process.env.AI_LOCAL_BASE_URL; else process.env.AI_LOCAL_BASE_URL = savedLocal; });

describe('an ambient row never reaches a cloud lane', () => {
  it('the cloud history drops raw and legacy ambient rows', () => {
    const h = historyForLane([ambientRaw, legacyAmbient, typed, reply], true);
    const text = h.lines.map((l) => l.text).join('\n');
    expect(text).not.toContain('soda');
    expect(text).not.toContain('pizza');
    expect(text).not.toContain('[ambient]');
    expect(text).toContain('The door creaks open.');
    expect(text).toContain('Ruth shrugs.');
    expect(h.sawNonFiction).toBe(true);
  });

  it('inside the wall the local lane sees everything as written', () => {
    const h = historyForLane([ambientRaw, typed], false);
    expect(h.lines[0].text).toContain('[[ambient]]: grab me a soda');
  });

  it('assertNoTableContent refuses a table row or a marked text', () => {
    expect(() => assertNoTableContent([ambientRaw], 't')).toThrow(WallViolationError);
    expect(() => assertNoTableContent([legacyAmbient], 't')).toThrow(WallViolationError);
    expect(() => assertNoTableContent(['[2026] [ambient]: hi'], 't')).toThrow(WallViolationError);
    expect(() => assertNoTableContent([JSON.stringify({ source: 'TABLE_AMBIENT' })], 't')).toThrow(WallViolationError);
    expect(() => assertNoTableContent(['The door creaks open.', typed], 't')).not.toThrow();
  });

  it('route() checks a cloud-bound payload and refuses table content', () => {
    expect(() => route({ caller: 't', lane: 'judgment', contentClass: 'fiction' }, ['[ambient]: brb'])).toThrow(WallViolationError);
    expect(route({ caller: 't', lane: 'judgment', contentClass: 'fiction' }, ['Ruth opens the door.']).crossesWall).toBe(true);
  });

  it('the logged refusal names the caller, never the text', () => {
    const logged: string[] = [];
    const warn = console.warn;
    console.warn = (...a: unknown[]) => { logged.push(a.join(' ')); };
    try {
      expect(() => assertNoTableContent(['[ambient]: my phone number is 555'], 'caller-x')).toThrow();
    } finally { console.warn = warn; }
    expect(logged.join('\n')).toContain('caller-x');
    expect(logged.join('\n')).not.toContain('555');
  });
});

describe('a mixed utterance crosses only as its icText', () => {
  it('the cloud history carries the in-character words under a neutral tag', () => {
    const h = historyForLane([ambientSplit], true);
    expect(h.lines).toHaveLength(1);
    expect(h.lines[0].text).toContain('Ruth, where is the key?');
    expect(h.lines[0].text).not.toContain('soda');
    expect(h.lines[0].text).not.toContain('[ambient]');
    expect(() => assertNoTableContent(h.lines.map((l) => l.text), 't')).not.toThrow();
  });
});

describe('a tool result containing a table row is scrubbed', () => {
  const output = {
    recent: [
      { id: 'a', role: 'user', username: '[ambient]', content: 'brb pizza', contentClass: 'table' },
      { id: 'b', role: 'user', username: '[ambient]', content: 'soda — Ruth, where is the key?', contentClass: 'fiction', icText: 'Ruth, where is the key?' },
      { id: 'c', role: 'user', username: '[ui]', content: 'mike: opened inventory', contentClass: null },
      { id: 'd', role: 'assistant', username: null, content: 'Ruth shrugs.' },
    ],
    note: 'heard: [ambient] brb',
    name: 'Ruth',
  };

  it('drops table/real rows, swaps content for icText, withholds marked strings', () => {
    const s = scrubForCloud(output);
    expect(s.recent.map((r) => r.id)).toEqual(['b', 'd']);
    expect(s.recent[0].content).toBe('Ruth, where is the key?');
    expect(s.note).toBe(WITHHELD);
    expect(s.name).toBe('Ruth');
  });

  it('the runtime choke point scrubs on a cloud lane and passes through local', () => {
    const raw = JSON.stringify(output);
    const cloud = toolResultForLane(raw, true);
    expect(cloud).not.toContain('pizza');
    expect(cloud).not.toContain('soda');
    expect(cloud).not.toContain('opened inventory');
    expect(() => assertNoTableContent(messageTexts([{ content: [{ type: 'tool_result', content: cloud }] }]), 't')).not.toThrow();
    expect(toolResultForLane(raw, false)).toBe(raw);
    expect(toolResultForLane('plain [ambient] text', true)).toBe(WITHHELD);
  });
});
