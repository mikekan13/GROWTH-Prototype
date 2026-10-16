/**
 * Recursive genesis (Mike 2026-10-16,
 * [[ruling-world-building-recursion-jewl-swarm-personality-2026-10-16]]):
 * "when it gets to the people building part (since they are an entity) it has
 * to essentially do the same thing for that person".
 *
 * When JEWL seeds a person during a character's WORLD stage (seed_npc →
 * genesis-seeds.ts seedNpc, an NPC shell), that person gets her own genesis,
 * BOUNDED BY TIER: a SKETCH (one model call fills the shell with a valid,
 * priced sheet — sketch-genesis.ts in place) and then the completion walk
 * (genesis-complete.ts completeCharacter) as a BACKGROUND work session in
 * SAIL mode — JEWL fills in the rest and notes his assumptions; no question
 * rounds to a table that is not building her.
 *
 * Bounds:
 *   - depth: `_seed.genesisDepth` on the sheet. A seated character is depth
 *     0; her seeds are depth 1 and get a genesis; THEIR seeds (depth 2) do
 *     not — the world stops recursing where the table stops caring.
 *   - never while the parent's genesis is still at PRODDING (the GM has not
 *     pressed Build; nothing of hers is settled yet);
 *   - the player gates (APPEARANCE / PORTRAIT) are skipped — nobody sits at
 *     the designer for a spawned NPC;
 *   - per campaign: Campaign.aiSettings.recursiveGenesis (default ON).
 *
 * The link: Character.seededFromId (already) + `_seed.spawnedFrom` /
 * `_seed.spawnedGenesis` on the child's sheet, and the child session's goal
 * suffix "(spawned from Violet's genesis · parent <id>)".
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { getCampaignAISettings } from '@/ai/campaign-ai';
import { recursiveGenesisEnabled } from '@/ai/types';
import { PRODDING_STAGE } from './genesis-prods';

/** Seeds of a seed get no genesis of their own. */
export const SPAWN_MAX_DEPTH = 1;

export interface SeedMeta {
  genesisDepth?: number;
  spawnedFrom?: { characterId: string; name: string; sessionId: string | null };
  spawnedGenesis?: { sessionId: string | null; openedAt: string; stages: string[] };
  relation?: string;
  valence?: number;
  openThread?: string | null;
  unresolved?: boolean;
  fromCharacterId?: string;
  [k: string]: unknown;
}

/** `_seed` of a sheet, if any. Pure. */
export function readSeedMeta(data: string | null | undefined): SeedMeta | null {
  if (!data) return null;
  try {
    const sheet = JSON.parse(data) as { _seed?: unknown };
    return sheet._seed && typeof sheet._seed === 'object' ? (sheet._seed as SeedMeta) : null;
  } catch {
    return null;
  }
}

/** How deep in the seeding tree a character sits. A seated character = 0. Pure. */
export function seedDepth(data: string | null | undefined): number {
  const meta = readSeedMeta(data);
  const d = meta?.genesisDepth;
  return typeof d === 'number' && d >= 0 ? d : (meta ? 1 : 0);
}

/**
 * Should a freshly seeded person get her own genesis now? Pure — the
 * decision, with its reason when not.
 */
export function shouldSpawnSeedGenesis(input: {
  enabled: boolean;
  created: boolean;
  childTier: string | null | undefined;
  parentDepth: number;
  parentStage: string | null | undefined;
  parentStatus?: string | null;
}): { spawn: boolean; reason?: string } {
  if (!input.enabled) return { spawn: false, reason: 'recursive genesis is off for this campaign' };
  if (!input.created) return { spawn: false, reason: 'the person already existed' };
  if (input.childTier !== 'SEED') return { spawn: false, reason: 'not a seed shell' };
  if (input.parentDepth >= SPAWN_MAX_DEPTH) return { spawn: false, reason: `depth ${input.parentDepth + 1} — seeds of a seed get no genesis` };
  if (input.parentStage === PRODDING_STAGE) return { spawn: false, reason: "the parent's genesis is still at PRODDING" };
  if (input.parentStatus === 'cancelled') return { spawn: false, reason: "the parent's genesis was cancelled" };
  return { spawn: true };
}

/** What the sketch is told about the person — the seed's facts, nothing invented. Pure. */
export function seedSketchText(seed: {
  name: string;
  bearerName: string;
  relation?: string;
  valence?: number;
  note?: string | null;
  openThread?: string | null;
}): string {
  const parts = [`${seed.name}${seed.relation ? `, ${seed.relation} of ${seed.bearerName}` : ` — a person in ${seed.bearerName}'s life`}.`];
  if (typeof seed.valence === 'number') {
    parts.push(seed.valence >= 0.5 ? `${seed.bearerName} holds them dear.` : seed.valence <= -0.5 ? `${seed.bearerName} holds them with hostility or pain.` : `${seed.bearerName} holds them with mixed feeling.`);
  }
  if (seed.note?.trim()) parts.push(seed.note.trim());
  if (seed.openThread?.trim()) parts.push(`Unresolved between them (keep it open, do not answer it): ${seed.openThread.trim()}`);
  return parts.join(' ');
}

async function stampSeed(characterId: string, patch: Partial<SeedMeta>): Promise<void> {
  const row = await prisma.character.findUnique({ where: { id: characterId }, select: { data: true } });
  if (!row) return;
  let sheet: Record<string, unknown> = {};
  try { sheet = JSON.parse(row.data) as Record<string, unknown>; } catch { sheet = {}; }
  const seed = (sheet._seed && typeof sheet._seed === 'object') ? (sheet._seed as SeedMeta) : {};
  sheet._seed = { ...seed, ...patch };
  await prisma.character.update({ where: { id: characterId }, data: { data: JSON.stringify(sheet) } });
}

/**
 * Give a seeded person her own genesis: sketch the shell, then open the
 * completion walk in SAIL mode in the background. Never throws — a refusal
 * (settings, depth, wallet, a sketch withheld) is logged on the parent's
 * session and the shell stays a shell for the Watcher to deepen by hand.
 */
export async function spawnSeedGenesis(opts: {
  campaignId: string;
  npcId: string;
  created: boolean;
  parent: { characterId: string; name: string; sessionId: string | null };
}): Promise<{ spawned: boolean; sessionId?: string | null; reason?: string }> {
  const { campaignId, npcId } = opts;
  const noteParent = async (note: string) => {
    if (!opts.parent.sessionId) return;
    try {
      const { updateWorkSession } = await import('./daya-work-session');
      await updateWorkSession({ sessionId: opts.parent.sessionId, progressNote: note });
    } catch { /* the parent may have closed */ }
  };
  try {
    const [settings, child, parentRow, parentSession, campaign] = await Promise.all([
      getCampaignAISettings(campaignId),
      prisma.character.findUnique({ where: { id: npcId }, select: { id: true, name: true, data: true, genesisTier: true, campaignId: true } }),
      prisma.character.findUnique({ where: { id: opts.parent.characterId }, select: { data: true, name: true } }),
      opts.parent.sessionId ? prisma.dayaWorkSession.findUnique({ where: { id: opts.parent.sessionId }, select: { stage: true, status: true } }) : Promise.resolve(null),
      prisma.campaign.findUnique({ where: { id: campaignId }, select: { gmUserId: true } }),
    ]);
    if (!child || child.campaignId !== campaignId || !campaign) return { spawned: false, reason: 'seed not found' };
    const parentDepth = seedDepth(parentRow?.data);
    const verdict = shouldSpawnSeedGenesis({
      enabled: recursiveGenesisEnabled(settings),
      created: opts.created,
      childTier: child.genesisTier,
      parentDepth,
      parentStage: parentSession?.stage ?? null,
      parentStatus: parentSession?.status ?? null,
    });
    if (!verdict.spawn) return { spawned: false, reason: verdict.reason };

    const seed = readSeedMeta(child.data) ?? {};
    const spawnedFrom = { characterId: opts.parent.characterId, name: parentRow?.name ?? opts.parent.name, sessionId: opts.parent.sessionId };
    await stampSeed(npcId, { genesisDepth: parentDepth + 1, spawnedFrom });

    const gm = { id: campaign.gmUserId, role: 'WATCHER' };
    let backstoryNote: string | null = null;
    try { backstoryNote = (JSON.parse(child.data) as { backstory?: { notes?: string } }).backstory?.notes ?? null; } catch { backstoryNote = null; }
    const seedText = seedSketchText({
      name: child.name, bearerName: spawnedFrom.name, relation: seed.relation, valence: seed.valence,
      note: backstoryNote, openThread: seed.openThread ?? null,
    });
    const { sketchNpc } = await import('./sketch-genesis');
    const sketch = await sketchNpc({ campaignId, watcherId: gm.id, watcherRole: gm.role, seedText, tier: 'SKETCH', characterId: npcId });

    const { completeCharacter } = await import('./genesis-complete');
    const walk = await completeCharacter(npcId, gm, { mode: 'sail', skipGates: true, spawnedFrom });
    await stampSeed(npcId, { spawnedGenesis: { sessionId: walk.sessionId, openedAt: new Date().toISOString(), stages: [...walk.stages] } });
    await noteParent(`[swarm] ${child.name}'s own genesis opened (sketch ${sketch.tkv} KRMA; sail, depth ${parentDepth + 1}${walk.opened ? `: ${walk.stages.join(' → ')}` : ' — nothing left to walk'})`);
    return { spawned: true, sessionId: walk.sessionId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[genesis-spawn] ${npcId}: no genesis of her own — ${msg.slice(0, 200)}`);
    await noteParent(`[swarm] ${opts.parent.name}'s seed got no genesis of her own — ${msg.slice(0, 160)}`);
    return { spawned: false, reason: msg };
  }
}

/** Fire-and-forget from seed_npc: the parent's cycle never waits on the child. */
export function spawnSeedGenesisLater(opts: Parameters<typeof spawnSeedGenesis>[0]): void {
  setImmediate(() => {
    void spawnSeedGenesis(opts).catch(err => {
      console.error('[genesis-spawn] crashed:', err);
    });
  });
}
