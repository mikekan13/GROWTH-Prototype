/**
 * Provenance ledger (2026-09-20, docs/research/growth-provenance-ledger-briefing).
 *
 * One manifest per creative act, recorded at write-time where it is nearly
 * free. Creator kind follows the IPTC digital-source-type split (human | ai |
 * composite). Ingredients form the creation DAG; memoryRefs bridge an AI
 * being's act to its memory ledger. Rights bits are recorded from birth —
 * the AI-training bit comes from consent, never assumed.
 *
 * Recording is fire-and-forget by default: a ledger failure must never fail
 * the creative act it describes (the act already happened).
 */
import 'server-only';
import { createHash } from 'crypto';
import { prisma } from '@/lib/db';
import { getUserTrainingConsent, resolveTrainingConsent } from '@/services/consent';

export type CreatorKind = 'human' | 'ai' | 'composite';
export type AssetType = 'forge_item' | 'campaign_item' | 'character' | 'portrait' | 'encounter_round' | 'text';

export interface Rights {
  /** May this asset enter entity memory consolidation / a fine-tune corpus? Derived from consent at creation. */
  aiTraining: boolean;
  /** Unset (null) until a rights policy exists — recorded so it can be filled, never assumed. */
  remix: boolean | null;
  commercial: boolean | null;
}

export interface RecordProvenanceInput {
  assetType: AssetType;
  assetId: string;
  campaignId?: string | null;
  creatorUserId?: string | null;
  creatorEntityId?: string | null;
  creatorKind: CreatorKind;
  tool?: string | null;
  ingredients?: string[];
  memoryRefs?: string[];
  /** Content to hash for the manifest (string or serializable). */
  content?: unknown;
  /** Override the derived rights (tests / explicit policy). */
  rights?: Partial<Rights>;
}

/** Pure: derive rights from the creator's/campaign's consent state. */
export function deriveRights(consent: { creatorConsented: boolean; campaignConsented: boolean }, kind: CreatorKind): Rights {
  // A human act needs its author's consent; an AI act needs the table's (campaign) consent,
  // because its ingredients are the table's content; composite needs both.
  const aiTraining = kind === 'human' ? consent.creatorConsented
    : kind === 'ai' ? consent.campaignConsented
    : consent.creatorConsented && consent.campaignConsented;
  return { aiTraining, remix: null, commercial: null };
}

export function ingredientRef(assetType: AssetType | string, assetId: string): string {
  return `${assetType}:${assetId}`;
}

export function contentHashOf(content: unknown): string | null {
  if (content === undefined || content === null) return null;
  const s = typeof content === 'string' ? content : JSON.stringify(content);
  return createHash('sha256').update(s).digest('hex');
}

export async function recordProvenance(input: RecordProvenanceInput) {
  const creatorConsented = input.creatorUserId ? await getUserTrainingConsent(input.creatorUserId) : false;
  const campaignConsented = (await resolveTrainingConsent(input.campaignId)).training;
  const rights: Rights = { ...deriveRights({ creatorConsented, campaignConsented }, input.creatorKind), ...input.rights };
  return prisma.provenance.create({
    data: {
      assetType: input.assetType,
      assetId: input.assetId,
      campaignId: input.campaignId ?? null,
      creatorUserId: input.creatorUserId ?? null,
      creatorEntityId: input.creatorEntityId ?? null,
      creatorKind: input.creatorKind,
      tool: input.tool ?? null,
      ingredients: JSON.stringify(input.ingredients ?? []),
      memoryRefs: JSON.stringify(input.memoryRefs ?? []),
      rights: JSON.stringify(rights),
      contentHash: contentHashOf(input.content),
    },
  });
}

/** Fire-and-forget: never throws, never blocks the creative act. */
export function recordProvenanceSafe(input: RecordProvenanceInput): void {
  recordProvenance(input).catch(err => {
    console.error('[provenance] record failed:', err);
  });
}

export async function listProvenance(assetType: string, assetId: string) {
  const rows = await prisma.provenance.findMany({ where: { assetType, assetId }, orderBy: { createdAt: 'asc' } });
  return rows.map(r => ({
    ...r,
    ingredients: JSON.parse(r.ingredients) as string[],
    memoryRefs: JSON.parse(r.memoryRefs) as string[],
    rights: JSON.parse(r.rights) as Rights,
  }));
}
