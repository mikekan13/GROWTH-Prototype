/**
 * Per-lane tool sets + persona core (2026-10-12) — against the REAL tool
 * registry and the real prompt builder. Table chat must fit the local 27B's
 * 32k window with room to answer.
 */
import { describe, it, expect } from 'vitest';
import { buildToolSpecs, requestableTools, toolOffered } from './runtime';
import { getJewlTool, listJewlTools } from './tools';
import { TABLE_CHAT_TOOLS, HEAVY_TOOLS, REQUEST_TOOL } from './tool-profiles';
import { buildJewlSystemPrompt, buildJewlPersonaCore, DEFAULT_REGISTER } from './prompts/system';
import { estimateTokens } from '@/ai/network/local-window';

/** What the local transport actually sends for the tools. */
const toolsJson = (tools: ReturnType<typeof buildToolSpecs>) =>
  JSON.stringify(tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema } })));

describe('TABLE_CHAT tool set', () => {
  const table = buildToolSpecs(undefined, false, undefined, undefined, { kind: 'TABLE_CHAT' });
  const names = table.map(t => t.name);

  it('every light tool exists in the registry', () => {
    for (const n of TABLE_CHAT_TOOLS) expect(getJewlTool(n), n).toBeDefined();
  });

  it('carries the light set + request_tool, and none of the heavy tools', () => {
    expect(names).toContain(REQUEST_TOOL);
    expect(names).toContain('sketch_npc');
    expect(names).toContain('npc_speak');
    for (const h of [...HEAVY_TOOLS, 'edit_character_sheet', 'preview_cast', 'search_catalog']) expect(names).not.toContain(h);
  });

  it('is ≤ 6k estimated tokens (was ≈22k for all 51 tools)', () => {
    expect(estimateTokens(toolsJson(table))).toBeLessThanOrEqual(6_000);
  });

  it('request_tool lists the heavy tools as requestable — and never a table-light or stage-only one', () => {
    const req = requestableTools();
    for (const h of HEAVY_TOOLS) expect(req).toContain(h);
    expect(req).not.toContain('npc_speak');
    expect(req).not.toContain('raise_prod');
    const spec = table.find(t => t.name === REQUEST_TOOL)!;
    expect(spec.description).toContain('create_location');
  });

  it('a granted tool is offered (and executable) only while granted', () => {
    const granted = buildToolSpecs(undefined, false, undefined, undefined, { kind: 'TABLE_CHAT', granted: ['create_location'] });
    expect(granted.map(t => t.name)).toContain('create_location');
    // The base set keeps its order: the cached prefix is unchanged.
    expect(granted.slice(0, table.length).map(t => t.name)).toEqual(names);
    expect(toolOffered('create_location', undefined, false, undefined, undefined, { kind: 'TABLE_CHAT', granted: ['create_location'] })).toBe(true);
    expect(toolOffered('create_location', undefined, false, undefined, undefined, { kind: 'TABLE_CHAT' })).toBe(false);
  });
});

describe('WORK_CYCLE / GENESIS tool sets (as before)', () => {
  it('a work cycle carries the full set minus table-only tools, and no request_tool', () => {
    const work = buildToolSpecs(undefined, true, undefined, undefined, { kind: 'WORK_CYCLE' }).map(t => t.name);
    expect(work).not.toContain('sketch_npc');
    expect(work).not.toContain(REQUEST_TOOL);
    expect(work).toContain('create_location');
    expect(work.length).toBe(listJewlTools().filter(t => !['sketch_npc', 'raise_prod', 'end_prod_round'].includes(t.name)).length);
  });

  it('a genesis prod stage is still restricted to its allow-list', () => {
    const prod = buildToolSpecs(['raise_prod', 'end_prod_round'], true, undefined, undefined, { kind: 'GENESIS' }).map(t => t.name);
    expect(prod.sort()).toEqual(['end_prod_round', 'raise_prod']);
  });
});

describe('heavy tool descriptions', () => {
  it.each(HEAVY_TOOLS)('%s description is ≤ 900 chars (the schema is still enforced by Zod + LIMITS)', (name) => {
    const tool = getJewlTool(name)!;
    expect(tool.description.length).toBeLessThanOrEqual(900);
  });
});

describe('persona core + addenda', () => {
  it('the core (with register) is ≤ 2.5k estimated tokens', () => {
    expect(estimateTokens(buildJewlPersonaCore(DEFAULT_REGISTER))).toBeLessThanOrEqual(2_500);
  });

  it('addenda load only where relevant', () => {
    const table = buildJewlSystemPrompt(DEFAULT_REGISTER, 'TABLE_CHAT');
    const work = buildJewlSystemPrompt(DEFAULT_REGISTER, 'WORK_CYCLE');
    const genesis = buildJewlSystemPrompt(DEFAULT_REGISTER, 'GENESIS');
    expect(table).toContain('request_tool');
    expect(table).not.toContain('CHARACTER GENESIS');
    expect(table).not.toContain('STOCK CATALOG');
    expect(work).toContain('BUILDING (extract, then build)');
    expect(work).not.toContain('CHARACTER GENESIS');
    expect(genesis).toContain('CHARACTER GENESIS');
    expect(genesis).not.toContain('BUILDING (extract, then build)');
    for (const p of [table, work, genesis]) expect(p.startsWith(buildJewlPersonaCore(DEFAULT_REGISTER))).toBe(true);
  });

  it('the system block for a kind is byte-identical across builds (cache stability)', () => {
    expect(buildJewlSystemPrompt(DEFAULT_REGISTER, 'TABLE_CHAT')).toBe(buildJewlSystemPrompt(DEFAULT_REGISTER, 'TABLE_CHAT'));
  });

  it('JEWL_PROMPT_VERSION=v3 still rolls back to the frozen whole prompt', () => {
    const saved = process.env.JEWL_PROMPT_VERSION;
    process.env.JEWL_PROMPT_VERSION = 'v3';
    try {
      expect(buildJewlSystemPrompt(DEFAULT_REGISTER, 'TABLE_CHAT')).toContain('CHARACTER GENESIS');
    } finally {
      if (saved === undefined) delete process.env.JEWL_PROMPT_VERSION; else process.env.JEWL_PROMPT_VERSION = saved;
    }
  });
});
