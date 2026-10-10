/**
 * Skill → head-domain relevance cache (perception build unit 3).
 *
 * Mike 2026-10-09 (DOMAIN TAGGING): skills stay freeform
 * (Starting_Skills_Module.md:16); "the engine scores skill→domain relevance
 * once (small model), caches it, GM can override." Inspection uses the
 * best-matching skill; none → raw Wisdom.
 *
 * - Scores live in SkillDomainRelevance, one row per (scope, skill, domain).
 *   Model scores are GLOBAL (scope '*') — a skill name means the same thing
 *   in every campaign. A GM override is scoped to that GM's campaign (scope =
 *   campaignId); ADMIN may also override globally.
 * - Resolution per domain: campaign GM row → global GM row → global model row.
 * - The model only ever CREATES missing rows (upsert with an empty update) —
 *   it never overwrites a score, GM or model.
 * - Scoring runs on the 'classify' lane through ai/network route() (Haiku
 *   today, the local small model when that lane is pointed at it). The prompt
 *   is sized for a 27B-class model: ten fixed lines, one number each.
 */
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ValidationError } from '@/lib/errors';
import { requireCampaignGM } from '@/services/campaign-access';
import { DOMAINS, classifyDomains } from '@/daya/domains';
import { route, anthropicChatText, openAiCompatChat, recordAiCall } from '@/ai/network';
import { ASPECT_KINDS, HEAD_DOMAIN_KEYS, aspectDomains, isHeadDomain, type HeadDomainKey } from '@/sim/perception/aspects';
import type { GrowthWorldItem } from '@/types/item';

// ── Vocabulary + tuning ───────────────────────────────────────────────────

export const GLOBAL_SCOPE = '*';
export type RelevanceSource = 'model' | 'gm';
export type DomainScores = Record<HeadDomainKey, number>;

export interface DomainRelevance {
  relevance: number;
  /** 'none' = not scored yet (the model call failed) — read as 0, retried next time. */
  source: RelevanceSource | 'none';
}
export type SkillRelevance = Record<HeadDomainKey, DomainRelevance>;

/**
 * TUNING — placeholder. A skill below this relevance to every one of an
 * aspect's domains is not "relevant": inspection falls back to raw Wisdom.
 */
export const SKILL_RELEVANCE_TUNING = { minRelevant: 0.3 } as const;

/** 'Sword  Smithing ' → 'sword smithing'. */
export function normalizeSkillName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// ── Scorers ───────────────────────────────────────────────────────────────

/** Scores one skill against the ten head domains. Omitted domains count as 0. */
export type SkillDomainScorer = (skillName: string, ctx: { campaignId?: string }) => Promise<Partial<DomainScores>>;

/**
 * Deterministic stand-in for tests (and offline dev): the keyword classifier
 * of daya/domains.ts — best match 0.8, other matches 0.5, the rest 0.
 */
export const stubScorer: SkillDomainScorer = async (skillName) => {
  const { all } = classifyDomains(skillName);
  const out: Partial<DomainScores> = {};
  all.forEach((k, i) => { if (isHeadDomain(k)) out[k] = i === 0 ? 0.8 : 0.5; });
  return out;
};

/** One line per head domain: its school parallel, keywords, and the aspects of things it covers. */
export function domainGlossary(): string {
  return HEAD_DOMAIN_KEYS.map((key) => {
    const d = DOMAINS.find((x) => x.key === key);
    const aspects = ASPECT_KINDS.filter((k) => (k.domains as readonly string[]).includes(key)).map((k) => k.label.toLowerCase());
    const parts = [d?.keywords.slice(0, 10).join(', ')];
    if (aspects.length) parts.push(`knowing about a thing: ${aspects.join(', ')}`);
    return `${key}: ${parts.filter(Boolean).join('; ')}`;
  }).join('\n');
}

export function buildScorerPrompt(skillName: string): { system: string; user: string } {
  const system = [
    'You rate how much a tabletop RPG skill helps a character understand things in each of ten knowledge domains.',
    'The ten domains (name: what belongs to it):',
    domainGlossary(),
    '',
    'Rate each domain from 0 to 1: 0 = no help, 0.5 = some help, 1 = this skill is exactly that knowledge.',
    'Most skills score high in one or two domains and 0 in the rest.',
    'OUTPUT FORMAT: exactly ten lines, one per domain, in the order above, "domain: number". Nothing else.',
    'Example for the skill "swordsmanship":',
    ...HEAD_DOMAIN_KEYS.map((k) => `${k}: ${k === 'force' ? '1' : k === 'abjuration' ? '0.5' : '0'}`),
  ].join('\n');
  return { system, user: `Skill: "${skillName}"` };
}

/** Lenient parse of "domain: number" lines. Unknown domains and junk are skipped. */
export function parseScorerOutput(text: string): Partial<DomainScores> {
  const out: Partial<DomainScores> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.trim().toLowerCase().match(/^[-*\s]*([a-z]+)\s*[:=]\s*([0-9]*\.?[0-9]+)/);
    if (m && isHeadDomain(m[1]) && out[m[1]] === undefined) out[m[1]] = clamp01(Number(m[2]));
  }
  return out;
}

/** The small-model scorer: one short call on the classify lane. Throws when nothing parses. */
export const modelScorer: SkillDomainScorer = async (skillName, { campaignId }) => {
  const lane = route({ caller: 'skill-relevance', lane: 'classify', campaignId, privacy: 'safe' });
  const { system, user } = buildScorerPrompt(skillName);
  const opts = { maxTokens: 120, temperature: 0 };
  let res: { text: string; model: string; usage: Parameters<typeof recordAiCall>[0]['usage'] };
  if (lane.provider === 'anthropic') {
    res = await anthropicChatText({ model: lane.model, system, cacheSystem: true, messages: [{ role: 'user', content: user }], ...opts });
  } else if (lane.provider === 'openai-compat' && lane.baseUrl) {
    res = await openAiCompatChat({
      baseUrl: lane.baseUrl, apiKey: lane.apiKey, model: lane.model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }], ...opts,
    });
  } else {
    throw new Error(`skill-relevance: unsupported provider ${lane.provider}`);
  }
  recordAiCall({ lane: lane.lane, provider: lane.provider, model: res.model, caller: 'skill-relevance', campaignId, usage: res.usage });
  const scores = parseScorerOutput(res.text);
  if (Object.keys(scores).length === 0) throw new Error(`skill-relevance: unparseable scorer output for "${skillName}"`);
  return scores;
};

// ── Resolution (pure) ─────────────────────────────────────────────────────

export interface RelevanceRow { scope: string; skillName: string; domain: string; relevance: number; source: string }

/** campaign GM → global GM → global model; anything else → unscored. Pure. */
export function resolveRelevance(rows: RelevanceRow[], campaignId?: string | null): SkillRelevance {
  const pick = (domain: string): DomainRelevance => {
    const at = (scope: string, source: string) => rows.find((r) => r.scope === scope && r.domain === domain && r.source === source);
    const row = (campaignId ? at(campaignId, 'gm') : undefined) ?? at(GLOBAL_SCOPE, 'gm') ?? at(GLOBAL_SCOPE, 'model');
    return row ? { relevance: clamp01(row.relevance), source: row.source as RelevanceSource } : { relevance: 0, source: 'none' };
  };
  return Object.fromEntries(HEAD_DOMAIN_KEYS.map((k) => [k, pick(k)])) as SkillRelevance;
}

export interface SkillChoice { skill: string; level: number; relevance: number; domain: HeadDomainKey }

/**
 * The character's best skill for an aspect whose tag set is `domains`: the
 * skill's relevance to the aspect = its max relevance across those domains.
 * Best = highest relevance, then highest level. Below
 * SKILL_RELEVANCE_TUNING.minRelevant → null (raw Wisdom). Pure.
 */
export function pickBestSkill(
  skills: Array<{ name: string; level: number }>,
  domains: readonly HeadDomainKey[],
  relevanceOf: (skillName: string) => SkillRelevance | undefined,
): SkillChoice | null {
  let best: SkillChoice | null = null;
  for (const s of skills) {
    const rel = relevanceOf(s.name);
    if (!rel) continue;
    for (const d of domains) {
      const r = rel[d].relevance;
      if (r < SKILL_RELEVANCE_TUNING.minRelevant) continue;
      if (!best || r > best.relevance || (r === best.relevance && s.level > best.level)) {
        best = { skill: s.name, level: s.level, relevance: r, domain: d };
      }
    }
  }
  return best;
}

// ── Store ─────────────────────────────────────────────────────────────────

export interface RelevanceOptions {
  campaignId?: string | null;
  /** Scorer for missing domains (default: the small model). */
  scorer?: SkillDomainScorer;
}

const ROW_SELECT = { scope: true, skillName: true, domain: true, relevance: true, source: true } as const;

/**
 * Relevance of one skill to all ten head domains. Domains with no global
 * score are scored ONCE by the scorer and cached (create-only, never
 * overwriting). A scorer failure leaves them unscored (source 'none') for
 * the next call to retry.
 */
export async function getRelevance(skillName: string, opts: RelevanceOptions = {}): Promise<SkillRelevance> {
  const name = normalizeSkillName(skillName);
  if (!name) throw new ValidationError('skillName is required');
  const scopes = opts.campaignId ? [GLOBAL_SCOPE, opts.campaignId] : [GLOBAL_SCOPE];
  const load = () => prisma.skillDomainRelevance.findMany({ where: { skillName: name, scope: { in: scopes } }, select: ROW_SELECT });
  let rows = await load();

  const globalDomains = new Set(rows.filter((r) => r.scope === GLOBAL_SCOPE).map((r) => r.domain));
  const missing = HEAD_DOMAIN_KEYS.filter((k) => !globalDomains.has(k));
  if (missing.length) {
    let scores: Partial<DomainScores> | null = null;
    try {
      scores = await (opts.scorer ?? modelScorer)(name, { campaignId: opts.campaignId ?? undefined });
    } catch (e) {
      console.warn('[skill-relevance] scoring failed:', (e as Error).message);
    }
    if (scores) {
      await prisma.$transaction(missing.map((domain) => prisma.skillDomainRelevance.upsert({
        where: { scope_skillName_domain: { scope: GLOBAL_SCOPE, skillName: name, domain } },
        create: { scope: GLOBAL_SCOPE, skillName: name, domain, relevance: clamp01(scores![domain] ?? 0), source: 'model' },
        update: {}, // never overwrite — a GM override (or an earlier score) stands
      })));
      rows = await load();
    }
  }
  return resolveRelevance(rows, opts.campaignId);
}

/**
 * The character's best skill for one aspect (unit 2's tag set for the key;
 * pass the item data so instance tags — material, ability school — count).
 */
export async function bestSkillForAspect(
  characterSkills: Array<{ name: string; level: number }>,
  aspectKey: string,
  opts: RelevanceOptions & { subject?: GrowthWorldItem | string | null } = {},
): Promise<SkillChoice | null> {
  const domains = aspectDomains(aspectKey, opts.subject ?? undefined);
  if (!domains.length) return null;
  const rel = new Map<string, SkillRelevance>();
  for (const s of characterSkills) {
    const n = normalizeSkillName(s.name ?? '');
    if (n && !rel.has(n)) rel.set(n, await getRelevance(n, opts));
  }
  return pickBestSkill(characterSkills, domains, (name) => rel.get(normalizeSkillName(name)));
}

export const setOverrideSchema = z.object({
  skillName: z.string().trim().min(1).max(200),
  domain: z.string().refine(isHeadDomain, { message: 'domain must be one of the ten head domains' }),
  /** null clears the override (the model's score shows again). */
  relevance: z.number().min(0).max(1).nullable(),
});
export type SetOverrideInput = z.input<typeof setOverrideSchema>;

/**
 * GM override for one skill × domain. campaignId = that campaign's scope;
 * null = global (callers gate that to ADMIN). Returns the resolved relevance.
 */
export async function setOverride(campaignId: string | null, input: SetOverrideInput): Promise<SkillRelevance> {
  const r = setOverrideSchema.safeParse(input);
  if (!r.success) throw new ValidationError(r.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; '));
  const skillName = normalizeSkillName(r.data.skillName);
  const scope = campaignId ?? GLOBAL_SCOPE;
  const where = { scope_skillName_domain: { scope, skillName, domain: r.data.domain } };
  if (r.data.relevance === null) {
    // Clear only a GM row; a global model score is not the GM's to delete.
    await prisma.skillDomainRelevance.deleteMany({ where: { scope, skillName, domain: r.data.domain, source: 'gm' } });
  } else if (scope === GLOBAL_SCOPE) {
    // A global row may be the model's — the override replaces it (source gm).
    await prisma.skillDomainRelevance.upsert({
      where,
      create: { scope, skillName, domain: r.data.domain, relevance: r.data.relevance, source: 'gm' },
      update: { relevance: r.data.relevance, source: 'gm' },
    });
  } else {
    await prisma.skillDomainRelevance.upsert({
      where,
      create: { scope, campaignId, skillName, domain: r.data.domain, relevance: r.data.relevance, source: 'gm' },
      update: { relevance: r.data.relevance, source: 'gm' },
    });
  }
  const rows = await prisma.skillDomainRelevance.findMany({
    where: { skillName, scope: { in: campaignId ? [GLOBAL_SCOPE, campaignId] : [GLOBAL_SCOPE] } },
    select: ROW_SELECT,
  });
  return resolveRelevance(rows, campaignId);
}

// ── Campaign view (GM) ────────────────────────────────────────────────────

export interface CampaignSkillRelevance {
  skillName: string;
  /** Characters in the campaign carrying this skill (by normalized name). */
  characters: Array<{ id: string; name: string; level: number }>;
  domains: SkillRelevance;
}

/** Freeform skills out of Character.data (GrowthCharacter.skills). Junk → []. */
export function skillsFromCharacterData(data: string | null | undefined): Array<{ name: string; level: number }> {
  try {
    const parsed = JSON.parse(data ?? '') as { skills?: unknown };
    if (!Array.isArray(parsed?.skills)) return [];
    return parsed.skills
      .filter((s): s is { name: string; level?: unknown } => !!s && typeof (s as { name?: unknown }).name === 'string')
      .map((s) => ({ name: s.name, level: typeof s.level === 'number' ? s.level : 0 }));
  } catch {
    return [];
  }
}

/** Every skill on the campaign's characters, with domain scores (scoring missing ones). GM/ADMIN only. */
export async function listCampaignSkillRelevance(
  campaignId: string,
  user: { id: string; role: string },
  opts: Pick<RelevanceOptions, 'scorer'> = {},
): Promise<CampaignSkillRelevance[]> {
  await requireCampaignGM(campaignId, user);
  const chars = await prisma.character.findMany({ where: { campaignId }, select: { id: true, name: true, data: true }, orderBy: { name: 'asc' } });
  const bySkill = new Map<string, CampaignSkillRelevance['characters']>();
  for (const c of chars) {
    for (const s of skillsFromCharacterData(c.data)) {
      const n = normalizeSkillName(s.name);
      if (!n) continue;
      const list = bySkill.get(n) ?? [];
      list.push({ id: c.id, name: c.name, level: s.level });
      bySkill.set(n, list);
    }
  }
  const out: CampaignSkillRelevance[] = [];
  for (const [skillName, characters] of [...bySkill].sort((a, b) => a[0].localeCompare(b[0]))) {
    out.push({ skillName, characters, domains: await getRelevance(skillName, { campaignId, scorer: opts.scorer }) });
  }
  return out;
}

/** GM override through the campaign gate. */
export async function setCampaignOverride(campaignId: string, user: { id: string; role: string }, input: SetOverrideInput): Promise<SkillRelevance> {
  await requireCampaignGM(campaignId, user);
  return setOverride(campaignId, input);
}
