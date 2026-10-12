/**
 * Seed first, instantly (Mike 2026-10-12): "appearance requires a seed and
 * this should be something JEWL can set fairly quickly… the character image
 * creation shouldn't be available until that (almost instant)."
 *
 * On genesis submit JEWL picks the character's seed BEFORE the session opens:
 *   - a seed already set → no-op;
 *   - the campaign-visible catalog (stock + campaign) holds ONE seed → set it,
 *     no model call;
 *   - several → ONE tiny call on the local lane (fiction, 4 s cap) reading
 *     the name + the first ~1,500 chars of backstory; anything but a clean
 *     answer falls back to the stock Human.
 * The GM can override on the Appearance panel (`seedPickedBy: 'gm'`). An
 * override after genesis started only WARNS that the sheet may need a
 * rebuild — nothing is rebuilt automatically.
 *
 * Storage: the seed lives where the sheet already reads it —
 * `Character.data.creation.seed.{name,description}` — plus
 * `creation.seedPick = { id, name, pickedBy, pickedAt }` for provenance. No
 * migration: `selectedSeed` has always been JSON on the sheet. Mechanics
 * (augments, Fate Die, body) still land only through assignMechanics.
 *
 * Portrait creation is gated on the seed (assertSeedSetForPortrait).
 */
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { NotFoundError, SeedRequiredError, ValidationError } from '@/lib/errors';
import { broadcastEvent } from '@/lib/campaign-stream';
import { routedChatText } from '@/ai/network';
import { requireCampaignGM } from './campaign-access';
import { parseSheet, readSeedPick, SEED_REQUIRED_MESSAGE, type SeedPickedBy, type SeedPickState, type SheetJson } from '@/lib/seed-state';

export { readSeedPick, SEED_REQUIRED_MESSAGE, type SeedPickedBy, type SeedPickState };

export interface CatalogSeed {
  id: string;
  name: string;
  /** True = a stock (global catalog) row not yet pulled into the campaign. */
  stock: boolean;
  data: Record<string, unknown>;
}

export const SEED_PICK_TIMEOUT_MS = 4000;
export const SEED_PICK_BACKSTORY_CHARS = 1500;

/** Stock (global) + campaign published seeds; a campaign copy of a stock
 *  seed (or one with the same name) replaces the stock row. Human first. */
export async function listCatalogSeeds(campaignId: string): Promise<CatalogSeed[]> {
  const rows = await prisma.forgeItem.findMany({
    where: {
      type: 'seed',
      OR: [
        { campaignId, status: 'published' },
        { isGlobal: true, status: { in: ['published', 'global'] } },
      ],
    },
    select: { id: true, name: true, data: true, isGlobal: true, campaignId: true, sourceGlobalId: true },
    orderBy: { name: 'asc' },
  });
  const campaignRows = rows.filter(r => !r.isGlobal && r.campaignId === campaignId);
  const pulled = new Set(campaignRows.map(r => r.sourceGlobalId).filter(Boolean) as string[]);
  const names = new Set(campaignRows.map(r => r.name.trim().toLowerCase()));
  const stockRows = rows.filter(r => r.isGlobal && !pulled.has(r.id) && !names.has(r.name.trim().toLowerCase()));
  const out: CatalogSeed[] = [...campaignRows, ...stockRows].map(r => ({
    id: r.id,
    name: r.name,
    stock: r.isGlobal,
    data: (() => { try { return JSON.parse(r.data) as Record<string, unknown>; } catch { return {}; } })(),
  }));
  return out.sort((a, b) => (isHuman(b) ? 1 : 0) - (isHuman(a) ? 1 : 0) || a.name.localeCompare(b.name));
}

function isHuman(s: { name: string }): boolean {
  return s.name.trim().toLowerCase() === 'human';
}

/** The fallback seed: the stock Human, else the first listed. */
export function fallbackSeed(seeds: CatalogSeed[]): CatalogSeed | null {
  return seeds.find(isHuman) ?? seeds[0] ?? null;
}

/** Parse the model's answer: a seed id (or exact name) from the list, else null. */
export function parseSeedAnswer(text: string, seeds: CatalogSeed[]): CatalogSeed | null {
  const t = text.trim();
  if (!t) return null;
  let candidate = t;
  const json = t.match(/\{[\s\S]*\}/);
  if (json) {
    try {
      const v = JSON.parse(json[0]) as { seedId?: unknown; id?: unknown };
      const id = v.seedId ?? v.id;
      if (typeof id === 'string') candidate = id;
    } catch { /* fall through to the raw text */ }
  }
  candidate = candidate.replace(/^["'`\s]+|["'`\s.]+$/g, '');
  return seeds.find(s => s.id === candidate)
    ?? seeds.find(s => s.name.toLowerCase() === candidate.toLowerCase())
    ?? null;
}

/** The ONE tiny local-lane call. Throws on timeout / transport error. */
async function askJewlForSeed(opts: {
  campaignId: string;
  name: string;
  backstory: string;
  seeds: CatalogSeed[];
}): Promise<string> {
  const list = opts.seeds
    .map(s => `${s.id} — ${s.name}${typeof s.data.description === 'string' ? `: ${s.data.description.slice(0, 160)}` : ''}`)
    .join('\n');
  const call = routedChatText(
    { caller: 'seed-pick', lane: 'local', contentClass: 'fiction', campaignId: opts.campaignId },
    {
      system: 'You choose the seed (the being-type / lineage template) a character is built on. Answer with the seed id only.',
      user:
        `CHARACTER: ${opts.name}\n\nBACKSTORY (start):\n${opts.backstory.slice(0, SEED_PICK_BACKSTORY_CHARS)}\n\n` +
        `SEEDS (id — name: description):\n${list}\n\n` +
        'Which seed is this character? Reply with ONLY the id from the list.',
      maxTokens: 40,
      temperature: 0,
      timeoutMs: SEED_PICK_TIMEOUT_MS,
    },
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cap = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('seed pick timed out')), SEED_PICK_TIMEOUT_MS);
  });
  try {
    const res = await Promise.race([call, cap]);
    return res.text;
  } finally {
    if (timer) clearTimeout(timer);
    call.catch(() => { /* a late failure after the cap is already handled */ });
  }
}

async function writeSeed(
  character: { id: string; name: string; campaignId: string; data: string },
  seed: CatalogSeed,
  pickedBy: SeedPickedBy,
): Promise<SeedPickState> {
  const sheet = parseSheet(character.data);
  const creation = (sheet.creation ?? {}) as NonNullable<SheetJson['creation']>;
  const prevSeed = (creation.seed ?? {}) as Record<string, unknown>;
  const pickedAt = new Date().toISOString();
  const nextSeed: Record<string, unknown> = { ...prevSeed, name: seed.name };
  if (typeof seed.data.description === 'string') nextSeed.description = seed.data.description;
  else delete nextSeed.description;
  if (!nextSeed.baseFateDie) nextSeed.baseFateDie = (seed.data.baseFateDie as string | undefined) ?? 'd6';
  const next: SheetJson = {
    ...sheet,
    creation: { ...creation, seed: nextSeed, seedPick: { id: seed.id, name: seed.name, pickedBy, pickedAt } },
  };
  await prisma.character.update({ where: { id: character.id }, data: { data: JSON.stringify(next) } });
  broadcastEvent(character.campaignId, {
    kind: 'character_update',
    characterId: character.id,
    characterName: character.name,
    fields: ['creation.seed'],
  });
  return { name: seed.name, id: seed.id, pickedBy, pickedAt };
}

async function loadCharacter(characterId: string) {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: { id: true, name: true, campaignId: true, data: true },
  });
  if (!character) throw new NotFoundError('Character not found');
  if (!character.campaignId) {
    throw new ValidationError('Character has no campaign — seeds come from a campaign catalog.');
  }
  return { ...character, campaignId: character.campaignId };
}

export interface PickSeedResult {
  seed: SeedPickState | null;
  /** True when this call wrote the seed (false = already set / no catalog). */
  changed: boolean;
  /** True when a model call was made. */
  modelCalled: boolean;
  ms: number;
}

/**
 * JEWL picks the seed — awaited FIRST on genesis submit. Never throws for a
 * model failure (falls back to Human); never overwrites a seed already set.
 * `actor` is the submitter (genesis route already enforced Watcher+).
 * `opts.preferred` = the seed name the GM had chosen in the form (wins, as 'gm').
 */
export async function pickSeedForCharacter(
  characterId: string,
  _actor: { id: string; role: string },
  opts: { backstory?: string; name?: string; preferred?: string } = {},
): Promise<PickSeedResult> {
  const t0 = Date.now();
  const character = await loadCharacter(characterId);
  const existing = readSeedPick(character.data);
  if (existing) return { seed: existing, changed: false, modelCalled: false, ms: Date.now() - t0 };

  const seeds = await listCatalogSeeds(character.campaignId);
  if (seeds.length === 0) {
    console.warn(`[genesis] seed pick skipped — campaign ${character.campaignId} has no seeds in its catalog`);
    return { seed: null, changed: false, modelCalled: false, ms: Date.now() - t0 };
  }

  const preferred = opts.preferred?.trim()
    ? seeds.find(s => s.name.toLowerCase() === opts.preferred!.trim().toLowerCase())
    : undefined;
  if (preferred) {
    const seed = await writeSeed(character, preferred, 'gm');
    return { seed, changed: true, modelCalled: false, ms: Date.now() - t0 };
  }

  if (seeds.length === 1) {
    const seed = await writeSeed(character, seeds[0], 'default');
    return { seed, changed: true, modelCalled: false, ms: Date.now() - t0 };
  }

  const sheet = parseSheet(character.data);
  const storedBackstory = (sheet.backstory as { backstory?: unknown } | undefined)?.backstory;
  const backstory = opts.backstory ?? (typeof storedBackstory === 'string' ? storedBackstory : '');
  const name = opts.name?.trim() || character.name;
  let chosen: CatalogSeed | null = null;
  try {
    const text = await askJewlForSeed({ campaignId: character.campaignId, name, backstory, seeds });
    chosen = parseSeedAnswer(text, seeds);
    if (!chosen) console.warn('[genesis] seed pick answer unparseable — falling back to Human');
  } catch (e) {
    console.warn(`[genesis] seed pick call failed (${e instanceof Error ? e.message : 'error'}) — falling back to Human`);
  }
  const seed = chosen
    ? await writeSeed(character, chosen, 'jewl')
    : await writeSeed(character, fallbackSeed(seeds)!, 'default');
  return { seed, changed: true, modelCalled: true, ms: Date.now() - t0 };
}

// ── GM override + reads (Appearance panel) ────────────────────────────────

const setSeedSchema = z.object({ seedId: z.string().min(1).max(200) });

export interface SeedPanelView {
  seed: SeedPickState | null;
  options: CatalogSeed[];
  /** A genesis session exists for this character — an override may need a sheet rebuild. */
  genesisStarted: boolean;
}

async function genesisStarted(campaignId: string, characterId: string): Promise<boolean> {
  const s = await prisma.dayaWorkSession.findFirst({
    where: { campaignId, goal: { contains: `[${characterId}]` } },
    select: { id: true },
  });
  return !!s;
}

/** Seed + catalog options for the Appearance panel. Campaign GM / ADMIN. */
export async function getSeedPanel(characterId: string, user: { id: string; role: string }): Promise<SeedPanelView> {
  const character = await loadCharacter(characterId);
  await requireCampaignGM(character.campaignId, user);
  const [options, started] = await Promise.all([
    listCatalogSeeds(character.campaignId),
    genesisStarted(character.campaignId, character.id),
  ]);
  return { seed: readSeedPick(character.data), options, genesisStarted: started };
}

/** GM override: write the chosen seed (`seedPickedBy: 'gm'`). Never rebuilds the sheet. */
export async function setSeedByGm(
  characterId: string,
  input: unknown,
  user: { id: string; role: string },
): Promise<SeedPanelView & { rebuildWarning: string | null }> {
  const { seedId } = setSeedSchema.parse(input);
  const character = await loadCharacter(characterId);
  await requireCampaignGM(character.campaignId, user);
  const options = await listCatalogSeeds(character.campaignId);
  const seed = options.find(s => s.id === seedId);
  if (!seed) throw new ValidationError('That seed is not in this campaign’s catalog.');
  const started = await genesisStarted(character.campaignId, character.id);
  const written = await writeSeed(character, seed, 'gm');
  return {
    seed: written,
    options,
    genesisStarted: started,
    rebuildWarning: started ? 'Genesis already started — the sheet may need a rebuild for the new seed.' : null,
  };
}

// ── Portrait gate ─────────────────────────────────────────────────────────

/** Is a seed set? The inline creation payload's seed (chosen on the form)
 *  counts; otherwise characterId → the stored sheet. */
export async function hasSeedForPortrait(opts: {
  characterId?: string | null;
  inlineSeedName?: string | null;
}): Promise<boolean> {
  if (opts.inlineSeedName?.trim()) return true;
  if (opts.characterId) {
    const row = await prisma.character.findUnique({ where: { id: opts.characterId }, select: { data: true } });
    if (!row) throw new NotFoundError('Character not found');
    return readSeedPick(row.data) !== null;
  }
  return !!opts.inlineSeedName?.trim();
}

/** Throws SeedRequiredError (409) until the seed is set. */
export async function assertSeedSetForPortrait(opts: {
  characterId?: string | null;
  inlineSeedName?: string | null;
}): Promise<void> {
  if (!(await hasSeedForPortrait(opts))) throw new SeedRequiredError(SEED_REQUIRED_MESSAGE);
}
