/**
 * DAYA memory ingest — persona harness memory layer.
 *
 * Replaces the v0 `tagStimulus` stub in events.ts. Every stimulus (dialogue,
 * perception, adjudication result, gm_intervention, dream product) runs
 * through the meta-memory tagger (a small/cheap model call) which annotates
 * it for the archive, then a residency check decides whether it's written:
 * OOC content is processed in-flight and never persisted (WP6 law).
 *
 * Ingest NEVER throws — recording always happens (the system never forgets;
 * see recall.ts for how retrieval can still fail). A defensively-parsed
 * tagger response falls back to neutral tags rather than blocking the write.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { chat, type DayaChatMessage, type DayaClientOverrides, type DayaTier } from './model-client';
import { buildTaggerPrompt, type TaggerRosterEntry } from './prompts/roles/tagger';
import { RECALL_TUNING } from './recall-tuning';

export type { TaggerRosterEntry };

export interface TaggerClassification {
  contentCategory: 'dialogue' | 'perception' | 'reasoning' | 'world' | 'meta';
  sensitivity: 'sensitive' | 'safe';
  icOoc: 'IC' | 'OOC';
  rationaleTag: string;
}

export interface TaggerResult {
  valence: number;
  arousal: number;
  salience: number;
  entityRefs: string[];
  classification: TaggerClassification;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Neutral tags for when the tagger call/parse fails twice — ingest still records. */
const NEUTRAL_FALLBACK: TaggerResult = {
  valence: 0,
  arousal: 0,
  salience: 0.1,
  entityRefs: [],
  classification: {
    contentCategory: 'perception',
    sensitivity: 'sensitive',
    icOoc: 'IC',
    rationaleTag: 'tagger unavailable, neutral fallback',
  },
};

function isTaggerClassification(v: unknown): v is TaggerClassification {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  return c.icOoc === 'IC' || c.icOoc === 'OOC';
}

/** Defensive JSON parse of the tagger's response. Returns null on any shape mismatch. */
function parseTaggerJson(raw: string): TaggerResult | null {
  try {
    const cleaned = raw.trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    if (
      typeof parsed.valence !== 'number' ||
      typeof parsed.arousal !== 'number' ||
      typeof parsed.salience !== 'number' ||
      !isTaggerClassification(parsed.classification)
    ) {
      return null;
    }
    const cls = parsed.classification;
    const entityRefs = Array.isArray(parsed.entityRefs)
      ? parsed.entityRefs.filter((x): x is string => typeof x === 'string')
      : [];
    return {
      valence: clamp(parsed.valence, -1, 1),
      arousal: clamp(parsed.arousal, 0, 1),
      salience: clamp(parsed.salience, 0, 1),
      entityRefs,
      classification: {
        contentCategory:
          cls.contentCategory === 'dialogue' ||
          cls.contentCategory === 'perception' ||
          cls.contentCategory === 'reasoning' ||
          cls.contentCategory === 'world' ||
          cls.contentCategory === 'meta'
            ? cls.contentCategory
            : 'perception',
        sensitivity: cls.sensitivity === 'safe' ? 'safe' : 'sensitive',
        icOoc: cls.icOoc,
        rationaleTag: typeof cls.rationaleTag === 'string' ? cls.rationaleTag : '',
      },
    };
  } catch {
    return null;
  }
}

/** tier C (haiku-class via DAYA_C_MODEL) when a cloud credential/mock is available, else L1. */
function pickTaggerTier(overrides: DayaClientOverrides): DayaTier {
  if (overrides.anthropicClient || process.env.ANTHROPIC_API_KEY) return 'C';
  return 'L1';
}

/**
 * Calls the tagger role and defensively parses its JSON. Retries once on a
 * bad/unparseable response, then falls back to neutral tags — this function
 * never throws (ingest must never break on a model hiccup).
 */
export async function tagStimulusWithModel(
  content: string,
  source: string,
  roster: TaggerRosterEntry[] = [],
  overrides: DayaClientOverrides = {},
  entityId?: string, // DayaEntity.id — metering FK (WP9 FIX-2); optional so existing callers keep compiling
): Promise<TaggerResult> {
  const tier = pickTaggerTier(overrides);
  const messages: DayaChatMessage[] = [
    { role: 'system', content: buildTaggerPrompt({ roster }) },
    { role: 'user', content: `source: ${source}\ncontent: ${content}` },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await chat(
        { tier, subsystem: 'tagger', entityId, messages, maxTokens: 400, temperature: attempt === 0 ? 0.2 : 0 },
        overrides,
      );
      const parsed = parseTaggerJson(result.text);
      if (parsed) return parsed;
    } catch (err) {
      console.error(`[daya/memory] tagger call failed (attempt ${attempt + 1}/2):`, err);
    }
  }
  return NEUTRAL_FALLBACK;
}

// ── Direct memory writes ────────────────────────────────────────────────

export interface WriteMemoryParams {
  entityId: string; // DayaEntity.id
  narrativeCycle: number;
  source: string;
  content: string;
  valence?: number;
  arousal?: number;
  salience?: number;
  entityRefs?: string[];
  classification?: TaggerClassification | Record<string, unknown>;
  clusterId?: string | null;
  parentMemoryId?: string | null;
}

/**
 * Direct DayaMemoryEntry write — no tagger call. Used by ingestStimulus once
 * tags are known, and reused by recall.ts to self-ingest a failed-recall
 * experience (Ruling 5: the attempt itself is a memory).
 */
export async function writeMemoryEntry(params: WriteMemoryParams): Promise<{ id: string }> {
  const row = await prisma.dayaMemoryEntry.create({
    data: {
      entityId: params.entityId,
      narrativeCycle: params.narrativeCycle,
      source: params.source,
      content: params.content,
      valence: params.valence ?? 0,
      arousal: params.arousal ?? 0,
      salience: params.salience ?? 0,
      entityRefs: JSON.stringify(params.entityRefs ?? []),
      classification: JSON.stringify(params.classification ?? {}),
      clusterId: params.clusterId ?? null,
      parentMemoryId: params.parentMemoryId ?? null,
    },
  });
  return { id: row.id };
}

// ── Full ingest pipeline ────────────────────────────────────────────────

export interface IngestParams {
  entityId: string; // DayaEntity.id
  cycle: number;
  source: string;
  content: string;
  roster?: TaggerRosterEntry[];
  parentMemoryId?: string | null;
}

export interface IngestResult {
  persisted: boolean;
  memoryEntryId?: string;
  tags: TaggerResult;
}

/**
 * Ingest one stimulus: tag it, apply the OOC residency check (OOC is
 * processed but never persisted), and write the memory row when IC.
 * Encode-time salience is amplified by arousal per T0 §B (flashbulb/threat
 * effect) before storage — this is what makes high-arousal moments resist
 * decay more at recall time (recall.ts reads the amplified stored value).
 */
export async function ingestStimulus(
  params: IngestParams,
  overrides: DayaClientOverrides = {},
): Promise<IngestResult> {
  const tags = await tagStimulusWithModel(params.content, params.source, params.roster ?? [], overrides, params.entityId);

  if (tags.classification.icOoc === 'OOC') {
    // Residency check (WP6 law): OOC content is processed in-flight only.
    return { persisted: false, tags };
  }

  const salienceStored = clamp(tags.salience * (1 + RECALL_TUNING.encodeArousalSalienceMul * tags.arousal), 0, 1);

  const row = await writeMemoryEntry({
    entityId: params.entityId,
    narrativeCycle: params.cycle,
    source: params.source,
    content: params.content,
    valence: tags.valence,
    arousal: tags.arousal,
    salience: salienceStored,
    entityRefs: tags.entityRefs,
    classification: tags.classification,
    parentMemoryId: params.parentMemoryId ?? null,
  });

  return { persisted: true, memoryEntryId: row.id, tags };
}
