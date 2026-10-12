/**
 * JEWL system-prompt builder (T18).
 *
 * - Versioned: JEWL_PROMPT_VERSION env selects v1–v4 (default v4: core +
 *   per-dispatch-kind addenda, 2026-10-12). Rollback
 *   is flipping the env var — old versions are frozen files.
 * - Register (Law 8, INV-117): campaign tone flag + account age band are
 *   INJECTED here, never baked into the prompt text. Until T36 wires real
 *   account-age data, callers pass safe defaults (all-ages / unknown).
 * - Rupture wrapper (Law 10, INV-118): tool failures are marked so JEWL
 *   surfaces them in-world as Demiurge-ruptures instead of apologizing out
 *   of character.
 */

import { SYSTEM_PROMPT_V1 } from './v1';
import { SYSTEM_PROMPT_V2 } from './v2';
import { SYSTEM_PROMPT_V3 } from './v3';
import { SYSTEM_PROMPT_V4_CORE, V4_ADDENDA, type PersonaKind } from './v4';

export type { PersonaKind } from './v4';

export type CampaignTone = 'adult' | 'all-ages';
export type AccountAgeBand = 'adult' | 'minor' | 'unknown';

export interface RegisterInputs {
  campaignTone: CampaignTone;
  accountAgeBand: AccountAgeBand;
}

/** Safe defaults until T36 lands account-age plumbing: keep it clean. */
export const DEFAULT_REGISTER: RegisterInputs = {
  campaignTone: 'all-ages',
  accountAgeBand: 'unknown',
};

const VERSIONS: Record<string, string> = {
  v1: SYSTEM_PROMPT_V1,
  v2: SYSTEM_PROMPT_V2,
  v3: SYSTEM_PROMPT_V3,
  // v4 = core + per-kind addenda (2026-10-12); its FULL form for callers
  // that name no kind.
  v4: `${SYSTEM_PROMPT_V4_CORE}${V4_ADDENDA.FULL}`,
};

export function activePromptVersion(): string {
  const v = process.env.JEWL_PROMPT_VERSION ?? 'v4';
  return VERSIONS[v] ? v : 'v4';
}

function registerBlock(reg: RegisterInputs): string {
  const lines = [
    '=== REGISTER (runtime-injected — Law 8) ===',
    `Campaign tone flag: ${reg.campaignTone}.`,
    `Account age band: ${reg.accountAgeBand}.`,
  ];
  if (reg.campaignTone === 'adult' && reg.accountAgeBand === 'adult') {
    lines.push(
      'Full register available: edge, innuendo, and sharper jabs are in-bounds when they fit the person and the moment.',
    );
  } else {
    lines.push(
      'Keep it clean: no innuendo, no profanity, no adult edges. The bite stays — sharpness never required crudeness. When in doubt, the cleaner line.',
    );
  }
  return lines.join('\n');
}

/**
 * Build JEWL's system prompt for a dispatch.
 * Order: versioned personality core → runtime register block.
 * (The Prime build-state preamble and context blocks are appended by the
 * runtime — they are per-dispatch, not personality.)
 */
export function buildJewlSystemPrompt(register: RegisterInputs = DEFAULT_REGISTER, kind: PersonaKind = 'FULL'): string {
  const version = activePromptVersion();
  // Older versions are frozen whole-prompts: the rollback ignores the kind.
  if (version !== 'v4') return `${VERSIONS[version]}\n\n${registerBlock(register)}`;
  // v4: core → register → the kind's addendum. Pure in (kind, register), so
  // the system block is byte-identical across rounds of a kind (caching).
  return `${buildJewlPersonaCore(register)}${V4_ADDENDA[kind]}`;
}

/** The v4 persona CORE with its register block (≤2.5k est. tokens — tested). */
export function buildJewlPersonaCore(register: RegisterInputs = DEFAULT_REGISTER): string {
  return `${SYSTEM_PROMPT_V4_CORE}\n\n${registerBlock(register)}`;
}

/**
 * Wrap a real tool failure so the model surfaces it in-world (INV-118).
 * The marker is what the v2 prompt's "BUGS ARE CANON" section keys on.
 */
export function formatToolErrorAsRupture(errorMessage: string): string {
  return (
    `TERMINAL RUPTURE — real technical failure. Raw fault: ${errorMessage}\n` +
    `Surface this in-world as a Demiurge-rupture (a tear in the Terminal, beyond your power, being worked by Val). ` +
    `Name it honestly, in-voice. Never apologize out of character. Work around it or flag it to the GM, then continue.`
  );
}
