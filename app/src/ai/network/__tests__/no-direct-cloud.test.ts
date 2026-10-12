/**
 * The wall is the only door (Mike 2026-10-12): no module reaches a cloud model
 * except through ai/network (route() + the wall). This lint scans src/** for
 * direct Anthropic usage outside the transports. The indirect Claude doors
 * route themselves: DAYA's model-client sends every Claude-backed tier
 * through routedChatText, and ClaudeProvider is a face over it — both
 * require a content class.
 *
 * There is no pending list and no allow-list beyond the transports
 * themselves: any new direct use fails, and any caller of the tool-use
 * transport must let route() decide its lane.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(__dirname, '../../..');

/** Direct cloud usage. */
const PATTERNS: Array<[string, RegExp]> = [
  ['anthropicChatText', /\banthropicChatText\b/],
  ['@anthropic-ai/sdk', /@anthropic-ai\/sdk/],
  ['api.anthropic.com', /api\.anthropic\.com/],
  ['getAnthropicClient', /\bgetAnthropicClient\b/],
];

/** The transports themselves — the door's own hinges. */
const ALLOWED = [
  'ai/network/',
  'ai/providers/claude-tools.ts', // the tool-use transport (see TOOL_TRANSPORT below)
];

/** The tool-use transport may only be called by a file that lets route()
 *  decide the lane (and so the wall). */
const TOOL_TRANSPORT = /\bcallClaudeWithTools\b/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'generated' || name === '__tests__') continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

function relOf(file: string): string {
  return path.relative(SRC, file).split(path.sep).join('/');
}

function isAllowed(rel: string): boolean {
  return ALLOWED.some((a) => (a.endsWith('/') ? rel.startsWith(a) : rel === a));
}

function violators(): string[] {
  const hits: string[] = [];
  for (const file of walk(SRC)) {
    const rel = relOf(file);
    if (isAllowed(rel)) continue;
    const text = readFileSync(file, 'utf8');
    if (PATTERNS.some(([, re]) => re.test(text))) hits.push(rel);
  }
  return hits.sort();
}

function toolTransportCallersWithoutRoute(): string[] {
  const hits: string[] = [];
  for (const file of walk(SRC)) {
    const rel = relOf(file);
    if (isAllowed(rel)) continue;
    const text = readFileSync(file, 'utf8');
    // An import line or a comment is not a call.
    const calls = text.split(/\r?\n/).some((l) => TOOL_TRANSPORT.test(l) && !/^\s*(import\b|\*|\/\/|\})/.test(l));
    if (calls && !/\broute\(/.test(text)) hits.push(rel);
  }
  return hits.sort();
}

describe('the wall is the only door to cloud', () => {
  it('nothing outside the transports reaches a cloud model (no pending list)', () => {
    expect(violators()).toEqual([]);
  });

  it('every caller of the tool-use transport lets route() decide', () => {
    expect(toolTransportCallersWithoutRoute()).toEqual([]);
  });

  it('the ambient classifier never reaches a cloud model (it runs local)', () => {
    expect(violators()).not.toContain('ai/copilot/classifier.ts');
  });
});
