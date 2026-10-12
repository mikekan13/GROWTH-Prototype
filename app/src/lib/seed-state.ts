/**
 * Seed state on a sheet (Mike 2026-10-12, "seed first") — pure, client-safe.
 * The seed lives at `Character.data.creation.seed.name`; provenance at
 * `creation.seedPick = { id, name, pickedBy, pickedAt }`. Writers live in
 * services/seed-pick.ts.
 */

export type SeedPickedBy = 'jewl' | 'default' | 'gm';

export interface SeedPickState {
  name: string;
  id: string | null;
  pickedBy: SeedPickedBy | null;
  pickedAt: string | null;
}

/** The one line every portrait gate shows until the seed is set. */
export const SEED_REQUIRED_MESSAGE =
  'Set a seed first — JEWL picks one when genesis starts, or choose one in Appearance.';

/** Tooltip on a locked Appearance ↗ until the seed lands. */
export const SEED_WAIT_TITLE = 'waiting for the seed…';

/** The gate every Appearance / portrait entry point reads. */
export function seedGate(seedName: string | null | undefined): { locked: boolean; title: string | null; message: string | null } {
  return seedName && seedName.trim()
    ? { locked: false, title: null, message: null }
    : { locked: true, title: SEED_WAIT_TITLE, message: SEED_REQUIRED_MESSAGE };
}

/** The genesis log line when the seed lands: which catalog seed, who chose it. */
export function seedLine(seed: { name: string; pickedBy?: string | null }): string {
  const by = seed.pickedBy === 'jewl' ? ' · JEWL chose' : seed.pickedBy === 'gm' ? ' · you chose' : seed.pickedBy === 'default' ? ' · default' : '';
  return `seed → ${seed.name}${by}`;
}

export type SheetJson = Record<string, unknown> & {
  creation?: Record<string, unknown> & {
    seed?: Record<string, unknown> & { name?: unknown };
    seedPick?: Record<string, unknown>;
  };
  backstory?: { backstory?: unknown } | unknown;
  identity?: { name?: unknown } | unknown;
};

export function parseSheet(raw: string | null | undefined): SheetJson {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? (v as SheetJson) : {};
  } catch {
    return {};
  }
}

/** The seed currently on a sheet, or null when none is set. */
export function readSeedPick(raw: string | null | undefined): SeedPickState | null {
  const sheet = parseSheet(raw);
  const name = sheet.creation?.seed?.name;
  if (typeof name !== 'string' || !name.trim()) return null;
  const pick = sheet.creation?.seedPick ?? {};
  const by = pick.pickedBy;
  return {
    name: name.trim(),
    id: typeof pick.id === 'string' ? pick.id : null,
    pickedBy: by === 'jewl' || by === 'default' || by === 'gm' ? by : null,
    pickedAt: typeof pick.pickedAt === 'string' ? pick.pickedAt : null,
  };
}

