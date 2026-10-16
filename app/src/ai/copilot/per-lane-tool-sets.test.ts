/**
 * Per-lane tool sets + persona core (2026-10-12) — against the REAL tool
 * registry and the real prompt builder. Table chat must fit the local 27B's
 * 32k window with room to answer.
 */
import { describe, it, expect } from 'vitest';
import { buildToolSpecs, requestableTools, toolOffered } from './runtime';
import { getJewlTool, listJewlTools } from './tools';
import { TABLE_CHAT_TOOLS, TICK_EXTRA_TOOLS, HEAVY_TOOLS, REQUEST_TOOL, isTickSource } from './tool-profiles';
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
    expect(work.length).toBe(listJewlTools().filter(t => !['sketch_npc', 'raise_prod', 'end_prod_round', 'set_starting_age', 'grant_possession', 'seed_npc', 'seed_location', 'author_vine_goal', 'read_life_budget', 'establish_currency', 'grant_cash', 'set_income'].includes(t.name)).length);
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

describe('TICK tool set (system wakes + canvas gestures)', () => {
  const tick = buildToolSpecs(undefined, false, undefined, undefined, { kind: 'TABLE_CHAT', tick: true });
  const names = tick.map(t => t.name);

  it('the TICK sources are autonomous ticks (incl. forge-batch wakes) and canvas gestures only', () => {
    expect(isTickSource('JEWL_AUTONOMOUS_TICK')).toBe(true);
    expect(isTickSource('GM_CANVAS_ACTION')).toBe(true);
    expect(isTickSource('GM_TEXT')).toBe(false);
    expect(isTickSource('JEWL_WORK_CYCLE')).toBe(false);
  });

  it('= the TABLE_CHAT set + place_item, arrange_canvas, read_forge_item (no request_tool round needed)', () => {
    for (const n of TICK_EXTRA_TOOLS) expect(getJewlTool(n), n).toBeDefined();
    for (const n of [...TABLE_CHAT_TOOLS, ...TICK_EXTRA_TOOLS, REQUEST_TOOL]) expect(names).toContain(n);
    for (const h of HEAVY_TOOLS) expect(names).not.toContain(h);
    const plain = buildToolSpecs(undefined, false, undefined, undefined, { kind: 'TABLE_CHAT' }).map(t => t.name);
    for (const n of TICK_EXTRA_TOOLS) expect(plain).not.toContain(n);
  });

  it('tick tools are not requestable on a tick (already offered), but are on plain chat', () => {
    const req = requestableTools(undefined, false, undefined, undefined, true);
    for (const n of TICK_EXTRA_TOOLS) expect(req).not.toContain(n);
    for (const n of TICK_EXTRA_TOOLS) expect(requestableTools()).toContain(n);
  });

  it('a gesture grant still rides on top of the tick set, base first (cache-stable prefix)', () => {
    const granted = buildToolSpecs(undefined, false, undefined, undefined, { kind: 'TABLE_CHAT', tick: true, granted: ['create_location'] });
    expect(granted.map(t => t.name).slice(0, names.length)).toEqual(names);
    expect(granted.map(t => t.name)).toContain('create_location');
  });
});

describe('location tool specs are slim', () => {
  // The JSON schema (≈2.1k chars without descriptions) + the LIMITS line
  // (≈1k) are kept intact, so ~3.2k is the floor; prose is what was cut
  // (create_location was 5,947 chars, update_location 5,562).
  const stripDesc = (o: unknown): unknown => Array.isArray(o) ? o.map(stripDesc)
    : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'description').map(([k, v]) => [k, stripDesc(v)])) : o;
  const all = buildToolSpecs();
  for (const n of ['create_location', 'update_location']) {
    it(`${n}: spec ≤ 4.2k chars, field prose ≤ 800 chars (was ≈2.4k), LIMITS line + schema intact`, () => {
      const s = all.find(t => t.name === n)!;
      expect(s, n).toBeDefined();
      expect(JSON.stringify(s).length).toBeLessThanOrEqual(4_200);
      const fieldProse = JSON.stringify(s.inputSchema).length - JSON.stringify(stripDesc(s.inputSchema)).length;
      expect(fieldProse).toBeLessThanOrEqual(800);
      expect(s.description).toMatch(/\nLIMITS \(hard;.*spec\.zones\[\]\.description ≤2500 chars/);
      expect(JSON.stringify(s.inputSchema)).toContain('"maxLength":2500');
    });
  }
});

describe('genesis completion-stage tools (merge guard, 2026-10-12)', () => {
  const STAGE = ['set_starting_age', 'grant_possession', 'seed_npc', 'seed_location', 'author_vine_goal'];

  it('exist in the registry', () => {
    for (const n of STAGE) expect(getJewlTool(n), n).toBeDefined();
  });

  it('never reach TABLE_CHAT — not offered, not requestable, not on a tick', () => {
    for (const tick of [false, true]) {
      const names = buildToolSpecs(undefined, false, undefined, undefined, { kind: 'TABLE_CHAT', tick }).map(t => t.name);
      const req = requestableTools(undefined, false, undefined, undefined, tick);
      for (const n of STAGE) {
        expect(names, n).not.toContain(n);
        expect(req, n).not.toContain(n);
      }
    }
  });

  it('are absent from ordinary work cycles and offered only when a stage names them', () => {
    const cycle = buildToolSpecs(undefined, true, undefined, undefined, { kind: 'GENESIS' }).map(t => t.name);
    for (const n of STAGE) expect(cycle, n).not.toContain(n);
    const stage = buildToolSpecs(['set_starting_age', 'update_work_session'], true, undefined, undefined, { kind: 'GENESIS' }).map(t => t.name);
    expect(stage).toContain('set_starting_age');
    expect(stage).not.toContain('grant_possession');
  });
});
