/**
 * The wall is the only door (Mike 2026-10-12): no module reaches a cloud model
 * except through ai/network (route() + the wall). This lint scans src/** for
 * direct Anthropic usage and for the indirect Claude-tier doors (daya
 * model-client tier 'C', the godhead text provider) outside the transports.
 *
 * KNOWN_PENDING holds the callers not yet moved behind route() (unit 6). The
 * test fails when a NEW file appears, and when a listed file no longer
 * violates — so the list only ever shrinks, and stays honest.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(__dirname, '../../..');

/** Direct cloud usage, and the indirect Claude-tier doors. */
const PATTERNS: Array<[string, RegExp]> = [
  ['anthropicChatText', /\banthropicChatText\b/],
  ['@anthropic-ai/sdk', /@anthropic-ai\/sdk/],
  ['api.anthropic.com', /api\.anthropic\.com/],
  ['getAnthropicClient', /\bgetAnthropicClient\b/],
  ["model-client tier 'C'", /tier:\s*'C'/],
  ['godhead provider (Claude)', /\bgetGodheadProvider\s*\(/],
  ['ClaudeProvider', /\bnew\s+ClaudeProvider\s*\(/],
];

/** The transports themselves — the door's own hinges. */
const ALLOWED = [
  'ai/network/',
  'ai/providers/claude.ts',       // text provider over the network transport
  'ai/providers/claude-tools.ts', // tool-use transport; runtime reaches it only via route()
  'ai/providers/index.ts',        // provider factory
];

/** Unit 6: still calling the cloud outside route(). Shrink, never grow. */
const KNOWN_PENDING = [
  'ai/copilot/create-dialog.ts',
  'ai/copilot/form-suggest.ts',
  'ai/portraits/style-profile.ts',
  'app/api/references/describe/route.ts',
  'daya/adjudicator.ts',
  'daya/clamp.ts',
  'daya/jewl-action.ts',
  'daya/mechanics/skill-fit.ts',
  'daya/model-client.ts',
  'daya/recall.ts',
  'godhead/agent.ts',
  'services/bridge.ts',
  'services/entity-quick-gen.ts',
  'services/goal-custodian.ts',
  'services/reconciliation.ts',
  'services/terminal-recall.ts',
].sort();

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'generated' || name === '__tests__') continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

function violators(): string[] {
  const hits: string[] = [];
  for (const file of walk(SRC)) {
    const rel = path.relative(SRC, file).split(path.sep).join('/');
    if (ALLOWED.some((a) => (a.endsWith('/') ? rel.startsWith(a) : rel === a))) continue;
    const text = readFileSync(file, 'utf8');
    if (PATTERNS.some(([, re]) => re.test(text))) hits.push(rel);
  }
  return hits.sort();
}

describe('the wall is the only door to cloud', () => {
  const found = violators();

  it('no NEW file reaches a cloud model outside ai/network', () => {
    expect(found.filter((f) => !KNOWN_PENDING.includes(f))).toEqual([]);
  });

  it('every KNOWN_PENDING file still violates (drop it from the list once fixed)', () => {
    expect(KNOWN_PENDING.filter((f) => !found.includes(f))).toEqual([]);
  });

  it('the ambient classifier is not a pending caller (it runs local)', () => {
    expect(KNOWN_PENDING).not.toContain('ai/copilot/classifier.ts');
    expect(found).not.toContain('ai/copilot/classifier.ts');
  });
});
