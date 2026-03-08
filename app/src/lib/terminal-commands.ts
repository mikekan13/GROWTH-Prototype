/**
 * Terminal Command Parser + Executor
 *
 * Parses /commands from the terminal input and executes them using the same
 * character-actions.ts functions that UI buttons use. Plain text (no / prefix)
 * is treated as a chat message.
 *
 * Commands:
 *   /roll <skill> dr:<n> effort:<n> attr:<attribute>  — Skill check
 *   /roll <die>                                       — Quick die roll (d4/d6/d8/d12/d20)
 *   /spend <attribute> <amount>                       — Spend from attribute pool
 *   /restore <attribute> <amount>                     — Restore to attribute pool
 *   /session start [name]                             — Start a new game session
 *   /session end                                      — End the current session
 */

import type { GrowthCharacter } from '@/types/growth';
import type { TerminalPayload, DiceRollPayload, CommandPayload, GameEventPayload } from '@/types/terminal';
import { performSkillCheck, spendAttribute, restoreAttribute, type AttributeName, type ActionResult, type SkillCheckActionResult } from './character-actions';
import { rollDie, parseDie, rollFateDie } from './dice';
import type { FateDie } from '@/types/growth';

// ── Types ──────────────────────────────────────────────────────────────────

export interface CommandResult {
  /** Updated character data (null if command doesn't modify character) */
  character: GrowthCharacter | null;
  /** Human-readable changes for changelog */
  changes: string[];
  /** Events to send to the terminal */
  events: Array<{ type: string; payload: TerminalPayload }>;
  /** Error message if command failed */
  error?: string;
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
 * Execute a terminal command. Returns the result including any character updates
 * and terminal events to emit.
 */
export function executeCommand(
  input: string,
  character: GrowthCharacter | null,
): CommandResult {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) {
    // Not a command — should be handled as chat by the caller
    return { character: null, changes: [], events: [], error: 'Not a command' };
  }

  const parts = trimmed.slice(1).split(/\s+/);
  const command = parts[0]?.toLowerCase();
  const rest = parts.slice(1);
  const args = parseArgs(rest);

  switch (command) {
    case 'roll':
      return executeRoll(args, character);
    case 'spend':
      return executeSpend(args, character);
    case 'restore':
      return executeRestore(args, character);
    case 'session':
      return executeSession(args);
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
  // Quick die roll: /roll d20, /roll d6
  if (args.positional.length === 1 && args.positional[0].match(/^d\d+$/)) {
    const die = args.positional[0];
    const sides = parseDie(die);
    if (sides === 0) {
      return makeError(`/roll ${die}`, `Invalid die: ${die}`);
    }
    const value = rollDie(sides);
    const fateDie = character?.creation?.seed?.baseFateDie || 'd6';

    const payload: DiceRollPayload = {
      kind: 'dice_roll',
      context: `Quick roll ${die}`,
      fateDie: { die, value },
      total: value,
      isSkilled: false,
    };

    return {
      character: null,
      changes: [],
      events: [{ type: 'dice_roll', payload }],
    };
  }

  // Skill check: /roll <skill> dr:<n> effort:<n> attr:<attribute>
  if (!character) {
    return makeError('/roll', 'No character selected for skill check');
  }

  const skillName = args.positional[0];
  if (!skillName) {
    return makeError('/roll', 'Usage: /roll <skill> dr:<n> effort:<n> attr:<attribute> — or /roll <die>');
  }

  const dr = parseInt(args.named.dr || '0');
  const effort = parseInt(args.named.effort || '0');
  const attrName = args.named.attr as AttributeName | undefined;

  if (!dr) {
    return makeError(`/roll ${skillName}`, 'Missing dr:<number> — the difficulty rating');
  }
  if (!attrName) {
    return makeError(`/roll ${skillName}`, 'Missing attr:<attribute> — which attribute to spend effort from');
  }

  const result: SkillCheckActionResult = performSkillCheck(character, {
    skillName,
    effortAttribute: attrName,
    effortAmount: effort,
    dr,
  });

  const roll = result.roll;
  const payload: DiceRollPayload = {
    kind: 'dice_roll',
    context: `${skillName} check vs DR ${dr}`,
    skillName,
    skillLevel: character.skills.find(s => s.name.toLowerCase() === skillName.toLowerCase())?.level,
    skillDie: roll.skillDie,
    fateDie: roll.fateDie,
    effort,
    effortAttribute: attrName,
    total: roll.total,
    dr,
    success: roll.success,
    margin: roll.margin,
    isSkilled: roll.isSkilled,
  };

  return {
    character: result.character,
    changes: result.changes,
    events: [{ type: 'dice_roll', payload }],
  };
}

// ── /spend ─────────────────────────────────────────────────────────────────

function executeSpend(args: ParsedArgs, character: GrowthCharacter | null): CommandResult {
  if (!character) {
    return makeError('/spend', 'No character selected');
  }

  const attrName = args.positional[0] as AttributeName | undefined;
  const amount = parseInt(args.positional[1] || '0');

  if (!attrName || !amount) {
    return makeError('/spend', 'Usage: /spend <attribute> <amount>');
  }

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
  if (!character) {
    return makeError('/restore', 'No character selected');
  }

  const attrName = args.positional[0] as AttributeName | undefined;
  const amount = parseInt(args.positional[1] || '0');

  if (!attrName || !amount) {
    return makeError('/restore', 'Usage: /restore <attribute> <amount>');
  }

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

// ── /session ───────────────────────────────────────────────────────────────

function executeSession(args: ParsedArgs): CommandResult {
  const action = args.positional[0];
  if (action === 'start' || action === 'end') {
    // Session commands are handled server-side by the caller
    // We return a game_event payload that the terminal component will
    // intercept and call the session API
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
