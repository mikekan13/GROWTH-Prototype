/**
 * Terminal Command Parser + Executor
 *
 * Parses /commands from the terminal input. Dice commands return API call intents
 * that the CampaignTerminal component executes server-side. Non-dice commands
 * (spend, restore, session) execute client-side as before.
 *
 * SECURITY: All dice rolling happens server-side via API routes. No RNG on the client.
 * The DiceService, injection registry, and crypto RNG are server-only modules.
 *
 * Commands:
 *   /roll <die> [die...]                              — Quick die roll (server-side)
 *   /roll <skill> dr:<n> effort:<n> attr:<attribute>  — Skill check (server-side, use /check)
 *   /check <skill> dr:<n> effort:<n> attr:<attribute> — Full skill check (server-side)
 *   /deathsave [dr:<n>]                               — Death save (server-side)
 *   /spend <attribute> <amount>                       — Spend from attribute pool (client-side)
 *   /restore <attribute> <amount>                     — Restore to attribute pool (client-side)
 *   /rest short                                        — Short rest (all chars, costs 1 Frequency)
 *   /rest long                                         — Long rest (all chars, full refill)
 *   /session start [name]                             — Start a new game session
 *   /session end                                      — End the current session
 *   /inject list|clear|remove|ensure-success|...      — (Godhead) Manage injections (server-side)
 */

import type { GrowthCharacter } from '@/types/growth';
import type { TerminalPayload, CommandPayload, GameEventPayload } from '@/types/terminal';
import { spendAttribute, restoreAttribute, type AttributeName, type ActionResult } from './character-actions';
import { parseDie } from './dice-utils';

// ── Types ──────────────────────────────────────────────────────────────────

/** Intent for a server-side API call. CampaignTerminal handles execution. */
export interface DiceApiIntent {
  endpoint: string;
  method: 'GET' | 'POST' | 'DELETE';
  body?: Record<string, unknown>;
  /** Effort to spend from character after the roll (deterministic, client-side) */
  effortSpend?: {
    attribute: string;
    amount: number;
  };
  /** Context for building terminal event from API response */
  context: {
    skillName?: string;
    input: string;
  };
}

/** Intent for a server-side rest API call. CampaignTerminal handles execution. */
export interface RestApiIntent {
  type: 'short' | 'long';
  characterIds?: string[];
}

export interface CommandResult {
  /** Updated character data (null if command doesn't modify character) */
  character: GrowthCharacter | null;
  /** Human-readable changes for changelog */
  changes: string[];
  /** Events to send to the terminal */
  events: Array<{ type: string; payload: TerminalPayload }>;
  /** Error message if command failed */
  error?: string;
  /** If set, caller should make this API call instead of posting events directly */
  diceApiCall?: DiceApiIntent;
  /** If set, caller should make the rest API call and refresh all characters */
  restApiCall?: RestApiIntent;
}

// ── Parser ─────────────────────────────────────────────────────────────────

interface ParsedArgs {
  positional: string[];
  named: Record<string, string>;
}

function parseArgs(parts: string[]): ParsedArgs {
  const positional: string[] = [];
  const named: Record<string, string> = {};

  for (const part of parts) {
    if (part.includes(':')) {
      const idx = part.indexOf(':');
      named[part.slice(0, idx).toLowerCase()] = part.slice(idx + 1);
    } else {
      positional.push(part.toLowerCase());
    }
  }

  return { positional, named };
}

// ── Executor ───────────────────────────────────────────────────────────────

/**
 * Execute a terminal command. Returns the result including any character updates,
 * terminal events to emit, or a dice API call intent for server-side execution.
 */
export function executeCommand(
  input: string,
  character: GrowthCharacter | null,
): CommandResult {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) {
    return { character: null, changes: [], events: [], error: 'Not a command' };
  }

  const parts = trimmed.slice(1).split(/\s+/);
  const command = parts[0]?.toLowerCase();
  const rest = parts.slice(1);
  const args = parseArgs(rest);

  switch (command) {
    case 'roll':
      return executeRoll(args, character);
    case 'check':
      return executeCheck(args, character);
    case 'deathsave':
      return executeDeathSave(args, character);
    case 'spend':
      return executeSpend(args, character);
    case 'restore':
      return executeRestore(args, character);
    case 'rest':
      return executeRest(args);
    case 'session':
      return executeSession(args);
    case 'inject':
      return executeInject(args);
    default:
      return {
        character: null,
        changes: [],
        events: [{
          type: 'command',
          payload: { kind: 'command', input: trimmed, result: `Unknown command: /${command}`, success: false } as CommandPayload,
        }],
        error: `Unknown command: /${command}`,
      };
  }
}

// ── /roll ──────────────────────────────────────────────────────────────────

function executeRoll(args: ParsedArgs, character: GrowthCharacter | null): CommandResult {
  // Quick die roll: /roll d20, /roll d6, /roll d8 d6
  const dieArgs = args.positional.filter(p => p.match(/^d\d+$/));
  if (dieArgs.length > 0 && dieArgs.length === args.positional.length) {
    for (const die of dieArgs) {
      if (parseDie(die) === 0) {
        return makeError(`/roll ${die}`, `Invalid die: ${die}`);
      }
    }

    return {
      character: null,
      changes: [],
      events: [],
      diceApiCall: {
        endpoint: '/api/dice/roll',
        method: 'POST',
        body: { dice: dieArgs, context: `Quick roll ${dieArgs.join(' + ')}` },
        context: { input: `/roll ${dieArgs.join(' ')}` },
      },
    };
  }

  // Skill check via /roll: redirect to /check logic (server-side)
  if (!character) {
    return makeError('/roll', 'No character selected for skill check');
  }

  const skillName = args.positional[0];
  if (!skillName) {
    return makeError('/roll', 'Usage: /roll <skill> dr:<n> effort:<n> attr:<attribute> — or /roll <die>');
  }

  const dr = parseInt(args.named.dr || '0');
  const effort = parseInt(args.named.effort || '0');
  const attrName = args.named.attr;

  if (!dr) return makeError(`/roll ${skillName}`, 'Missing dr:<number> — the difficulty rating');
  if (!attrName) return makeError(`/roll ${skillName}`, 'Missing attr:<attribute> — which attribute to spend effort from');

  const skill = character.skills.find(s => s.name.toLowerCase() === skillName.toLowerCase());
  const fateDie = character.creation?.seed?.baseFateDie || 'd6';

  return {
    character: null,
    changes: [],
    events: [],
    diceApiCall: {
      endpoint: '/api/dice/check',
      method: 'POST',
      body: {
        characterId: character.identity?.name || 'unknown',
        skillName: skill?.name || skillName,
        skillLevel: skill?.level || 0,
        fateDie,
        effort,
        effortAttribute: attrName,
        dr,
        flatModifiers: 0,
        isSkilled: !!skill,
      },
      effortSpend: effort > 0 ? { attribute: attrName, amount: effort } : undefined,
      context: { skillName: skill?.name || skillName, input: `/roll ${skillName} dr:${dr} effort:${effort} attr:${attrName}` },
    },
  };
}

// ── /check ─────────────────────────────────────────────────────────────────

function executeCheck(args: ParsedArgs, character: GrowthCharacter | null): CommandResult {
  if (!character) return makeError('/check', 'No character selected');

  const skillName = args.positional[0];
  if (!skillName) return makeError('/check', 'Usage: /check <skill> dr:<n> effort:<n> attr:<attribute>');

  const dr = parseInt(args.named.dr || '0');
  const effort = parseInt(args.named.effort || '0');
  const attrName = args.named.attr;

  if (!dr) return makeError(`/check ${skillName}`, 'Missing dr:<number>');
  if (!attrName) return makeError(`/check ${skillName}`, 'Missing attr:<attribute>');

  const skill = character.skills.find(s => s.name.toLowerCase() === skillName.toLowerCase());
  const fateDie = character.creation?.seed?.baseFateDie || 'd6';

  return {
    character: null,
    changes: [],
    events: [],
    diceApiCall: {
      endpoint: '/api/dice/check',
      method: 'POST',
      body: {
        characterId: character.identity?.name || 'unknown',
        skillName: skill?.name || skillName,
        skillLevel: skill?.level || 0,
        fateDie,
        effort,
        effortAttribute: attrName,
        dr,
        flatModifiers: 0,
        isSkilled: !!skill,
      },
      effortSpend: effort > 0 ? { attribute: attrName, amount: effort } : undefined,
      context: { skillName: skill?.name || skillName, input: `/check ${skillName} dr:${dr} effort:${effort} attr:${attrName}` },
    },
  };
}

// ── /deathsave ────────────────────────────────────────────────────────────

function executeDeathSave(args: ParsedArgs, character: GrowthCharacter | null): CommandResult {
  if (!character) return makeError('/deathsave', 'No character selected');

  const fateDie = character.creation?.seed?.baseFateDie || 'd6';
  const healthLevel = character.attributes?.constitution?.level ?? 1;
  const ladyDeathDr = parseInt(args.named.dr || '10');

  return {
    character: null,
    changes: [],
    events: [],
    diceApiCall: {
      endpoint: '/api/dice/deathsave',
      method: 'POST',
      body: {
        characterId: character.identity?.name || 'unknown',
        fateDie,
        healthLevel,
        dr: ladyDeathDr,
      },
      context: { input: `/deathsave dr:${ladyDeathDr}` },
    },
  };
}

// ── /inject (Godhead only — all calls go to server API) ──────────────────

function executeInject(args: ParsedArgs): CommandResult {
  const action = args.positional[0];

  if (action === 'list') {
    return {
      character: null, changes: [], events: [],
      diceApiCall: {
        endpoint: '/api/dice/inject',
        method: 'GET',
        context: { input: '/inject list' },
      },
    };
  }

  if (action === 'clear') {
    return {
      character: null, changes: [], events: [],
      diceApiCall: {
        endpoint: '/api/dice/inject',
        method: 'DELETE',
        context: { input: '/inject clear' },
      },
    };
  }

  if (action === 'remove' && args.positional[1]) {
    return {
      character: null, changes: [], events: [],
      diceApiCall: {
        endpoint: `/api/dice/inject?id=${encodeURIComponent(args.positional[1])}`,
        method: 'DELETE',
        context: { input: `/inject remove ${args.positional[1]}` },
      },
    };
  }

  if (action === 'ensure-success' || action === 'ensure-failure') {
    const target = args.positional[1] || 'next';
    const filter = target === 'next'
      ? { type: 'next_roll' }
      : args.named.char
        ? { type: 'character', characterId: args.named.char }
        : { type: 'next_roll' };

    const overrideType = action === 'ensure-success' ? 'ensure_success' : 'ensure_failure';

    return {
      character: null, changes: [], events: [],
      diceApiCall: {
        endpoint: '/api/dice/inject',
        method: 'POST',
        body: {
          filter,
          override: { type: overrideType },
          priority: 10,
          oneShot: true,
          reason: `Terminal /inject ${action}`,
        },
        context: { input: `/inject ${action} ${target}` },
      },
    };
  }

  if (action === 'set' && args.positional[1]) {
    const value = parseInt(args.positional[1]);
    if (isNaN(value)) return makeError('/inject set', `Invalid value: ${args.positional[1]}`);

    return {
      character: null, changes: [], events: [],
      diceApiCall: {
        endpoint: '/api/dice/inject',
        method: 'POST',
        body: {
          filter: { type: 'next_roll' },
          override: { type: 'set_values', values: [value, value] },
          priority: 10,
          oneShot: true,
          reason: `Terminal /inject set ${value}`,
        },
        context: { input: `/inject set ${value}` },
      },
    };
  }

  return makeError('/inject', 'Usage: /inject list | clear | remove <id> | ensure-success [next|char:<id>] | ensure-failure [next|char:<id>] | set <value> next');
}

// ── /spend ─────────────────────────────────────────────────────────────────

function executeSpend(args: ParsedArgs, character: GrowthCharacter | null): CommandResult {
  if (!character) return makeError('/spend', 'No character selected');

  const attrName = args.positional[0] as AttributeName | undefined;
  const amount = parseInt(args.positional[1] || '0');

  if (!attrName || !amount) return makeError('/spend', 'Usage: /spend <attribute> <amount>');

  const result: ActionResult = spendAttribute(character, attrName, amount);
  const cmdPayload: CommandPayload = {
    kind: 'command',
    input: `/spend ${attrName} ${amount}`,
    result: result.changes.join('; ') || 'No change',
    success: result.changes.length > 0,
  };

  return {
    character: result.character,
    changes: result.changes,
    events: [{ type: 'command', payload: cmdPayload }],
  };
}

// ── /restore ───────────────────────────────────────────────────────────────

function executeRestore(args: ParsedArgs, character: GrowthCharacter | null): CommandResult {
  if (!character) return makeError('/restore', 'No character selected');

  const attrName = args.positional[0] as AttributeName | undefined;
  const amount = parseInt(args.positional[1] || '0');

  if (!attrName || !amount) return makeError('/restore', 'Usage: /restore <attribute> <amount>');

  const result: ActionResult = restoreAttribute(character, attrName, amount);
  const cmdPayload: CommandPayload = {
    kind: 'command',
    input: `/restore ${attrName} ${amount}`,
    result: result.changes.join('; ') || 'No change',
    success: result.changes.length > 0,
  };

  return {
    character: result.character,
    changes: result.changes,
    events: [{ type: 'command', payload: cmdPayload }],
  };
}

// ── /rest ─────────────────────────────────────────────────────────────────

function executeRest(args: ParsedArgs): CommandResult {
  const restType = args.positional[0];
  if (restType !== 'short' && restType !== 'long') {
    return makeError('/rest', 'Usage: /rest short — or /rest long');
  }

  return {
    character: null,
    changes: [],
    events: [],
    restApiCall: { type: restType },
  };
}

// ── /session ───────────────────────────────────────────────────────────────

function executeSession(args: ParsedArgs): CommandResult {
  const action = args.positional[0];
  if (action === 'start' || action === 'end') {
    const name = action === 'start' ? args.positional.slice(1).join(' ') || undefined : undefined;
    const payload: GameEventPayload = {
      kind: 'game_event',
      eventType: action === 'start' ? 'session_start' : 'session_end',
      description: action === 'start'
        ? `Session started${name ? `: ${name}` : ''}`
        : 'Session ended',
    };

    return {
      character: null,
      changes: [],
      events: [{ type: 'game_event', payload }],
    };
  }

  return makeError('/session', 'Usage: /session start [name] — or /session end');
}

// ── Helpers ────────────────────────────────────────────────────────────────

function makeError(input: string, message: string): CommandResult {
  return {
    character: null,
    changes: [],
    events: [{
      type: 'command',
      payload: { kind: 'command', input, result: message, success: false } as CommandPayload,
    }],
    error: message,
  };
}
