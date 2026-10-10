/**
 * Perception composer — the murky mirror, applied to the world.
 *
 * Mike 2026-09-26: "The GM narrative during play is usually additive.
 * Everything should essentially go through the murky Mirror before being
 * presented to the AI. That is the entire point of the perception engine."
 *
 * The GM's line is one more truth entering the world. A being never reads
 * truth raw: what it lives through is composed from
 *   - the GM's narration (the headline — always survives),
 *   - the place it stands in (Location on the canvas: description,
 *     environment, features; its parent one level up),
 *   - who else is present there (characters located_at the same place),
 *   - what is there (CampaignItems at the location),
 *   - the standing WorldFacts whose subjectKey names the place,
 * filtered by its senses (eyes/ears from anatomy), then rendered through
 * `render()` with the being's own observer (bias, mood, voice) as subject
 * 'scene' — salience decides what blurs, mood/bias color it, the voicer
 * turns the envelope into the being's own noticing.
 *
 * Godlike / omniscient beings get the truth text unrendered (Terminal tier).
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { render, type Observer } from './renderer';
import { computeSceneContent, computeFidelityLevel, rngFor } from './renderer-math';
import type { SceneLine, SceneTruth, BiasProfile, VoiceParams } from './renderer-math';
import { currentFacts, type WorldFactRecord } from './world-ledger';
import { senseProfileFromSheet, type SenseKind } from '@/sim/senses/field';
import type { DayaClientOverrides } from './model-client';
import type { GrowthLocation } from '@/types/location';

export interface PerceiveResult {
  /** What the being actually perceived — the stimulus content to ingest. */
  prose: string;
  fidelityLevel: number;
  distortions: string[];
  locationId: string | null;
  /** How many truth lines were composed (headline excluded). */
  truthLines: number;
  /** false = godlike bypass or no campaign: prose is the raw truth. */
  mirrored: boolean;
  /** The lens this was rendered with — snapshotted on the memory so a later re-render (canon correction) uses the mood of the moment. */
  observer: { mood: { morale: number; stress: number; grief: number }; attunement: number };
  /** 'full' = the whole room was in the envelope; 'new' = only the stimulus and what was new since the being took this place in. */
  standing: 'full' | 'new';
  /** false = the deterministic envelope, no model call (godlike bypass or `voice: false`). */
  voiced: boolean;
}

export interface PerceiveOptions {
  /** Re-render with the lens of another moment (canon corrections). */
  observer?: Partial<PerceiveResult['observer']>;
  /**
   * 'once' (the listening loop, TABLE-RHYTHM-DESIGN §6): the being takes the
   * room in on its first stimulus in a place; after that each stimulus carries
   * only itself and what is NEW there. Default 'always': the whole room every time.
   * 'stimulus': the stimulus alone, no room, and what the being has taken in is left
   * as it was — for re-rendering a memory that was made from one stretch (canon corrections).
   */
  standing?: 'always' | 'once' | 'stimulus';
  /** false = skip the voicing call and return the deterministic envelope (an ask that cannot wait for a full listen). */
  voice?: boolean;
}

/**
 * The base clarity with which a being takes in its surroundings. Flat — [QUESTION for Mike]: which attribute
 * governs it (Focus? Wisdom?). Perception unit 5 (orchestrator D1, 2026-10-09): familiarity does NOT set this
 * — it governs how much a being KNOWS about a thing's aspects, not how clearly its senses take in a room
 * (reality default: you see a new room fine). Scene clarity comes from the senses: each line is dimmed by the
 * effectiveness of the sense that carries it (organ condition, sim/senses/field.ts).
 */
export const SCENE_ATTUNEMENT = 0.8;

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'in', 'on', 'at', 'to', 'fourth', 'floor', 'walkup', 'room', 'street', 'branch']);

/** 'Main Room' → ['main-room', 'main']; "Violet's Apartment — Fourth Floor Walkup" → ['violet-s-apartment-fourth-floor-walkup', 'violet', 'apartment'] */
export function placeKeys(name: string, tags: string[] = []): string[] {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  // "Violet's Apartment": the owner is a person, not a place key — drop possessives before tokenizing.
  const tokens = name.toLowerCase().replace(/\b[a-z0-9]+['’]s\b/g, ' ').split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !STOP.has(t));
  const tagKeys = tags.map((t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
  return [...new Set([slug, ...tokens, ...tagKeys].filter(Boolean))];
}

/** WorldFacts whose subjectKey's first segment names the place. */
export function factsForPlace(facts: WorldFactRecord[], keys: string[]): WorldFactRecord[] {
  const set = new Set(keys);
  return facts.filter((f) => set.has(f.subjectKey.split('.')[0]!.toLowerCase()));
}

export interface SceneInput {
  headline: string | null;
  speech: string[];
  place: { name: string; data: GrowthLocation | null } | null;
  parent: { name: string; data: GrowthLocation | null } | null;
  present: Array<{ name: string; description: string | null }>;
  items: string[];
  facts: WorldFactRecord[];
  parentFacts: WorldFactRecord[];
  senses: { canSee: boolean; canHear: boolean; effectiveness?: Partial<Record<SenseKind, number>> };
}

/**
 * Which sense carries a scene line (perception unit 5). Lines carry no modality
 * of their own, so it is inferred from their kind: speech → hearing; the place,
 * its features, standing facts and things lying around → sight (they are only
 * composed when the being can see); a person present → sight OR hearing, the
 * better of the two (you can tell someone is there by either). 'sense' lines
 * (the "you cannot see" notes) and the headline (the GM's narration) carry none
 * and are not dimmed.
 */
export function lineModality(kind: SceneLine['kind']): SenseKind[] {
  switch (kind) {
    case 'speech': return ['hearing'];
    case 'present': return ['sight', 'hearing'];
    case 'place': case 'fact': case 'item': return ['sight'];
    default: return [];
  }
}

/** Tag each line with the clarity of its sense when that sense is impaired (< 1). Intact lines are left untouched. Pure. */
export function dimBySenses(lines: SceneLine[], effectiveness: Partial<Record<SenseKind, number>> | undefined): SceneLine[] {
  if (!effectiveness) return lines;
  return lines.map((l) => {
    const senses = lineModality(l.kind);
    if (!senses.length) return l;
    const clarity = Math.max(...senses.map((s) => effectiveness[s] ?? 1));
    return clarity < 1 ? { ...l, clarity } : l;
  });
}

/** Deterministic composition of the truth the being is standing in. Pure. */
export function composeSceneLines(input: SceneInput): SceneTruth {
  const truth = composeUndimmed(input);
  return { headline: truth.headline, lines: dimBySenses(truth.lines, input.senses.effectiveness) };
}

function composeUndimmed(input: SceneInput): SceneTruth {
  const lines: SceneLine[] = [];
  const { canSee, canHear } = input.senses;
  if (!canSee && !canHear) lines.push({ text: 'You cannot see or hear. You feel the ground and the air.', salience: 1, kind: 'sense' });
  else if (!canSee) lines.push({ text: 'You cannot see; you go by sound, touch and smell.', salience: 1, kind: 'sense' });
  else if (!canHear) lines.push({ text: 'You cannot hear; the world moves in silence.', salience: 1, kind: 'sense' });

  if (canHear) for (const s of input.speech) lines.push({ text: s, salience: 0.95, kind: 'speech' });

  if (canSee || canHear) {
    for (const p of input.present) {
      lines.push({ text: canSee && p.description ? `${p.name} is here — ${p.description}` : `${p.name} is here.`, salience: 0.9, kind: 'present' });
    }
  }
  if (canSee && input.place) {
    const d = input.place.data;
    lines.push({ text: `You are in ${input.place.name}${d?.description ? ` — ${d.description}` : '.'}`, salience: 0.7, kind: 'place' });
    if (d?.environment) lines.push({ text: d.environment, salience: 0.5, kind: 'place' });
    for (const f of d?.features ?? []) lines.push({ text: `${f.name}: ${f.description}`, salience: f.type === 'hazard' ? 0.8 : 0.45, kind: 'place' });
    if (input.parent) lines.push({ text: `This is part of ${input.parent.name}${input.parent.data?.description ? ` — ${input.parent.data.description}` : '.'}`, salience: 0.3, kind: 'place' });
  }
  if (canSee) {
    for (const f of input.facts) lines.push({ text: f.fact, salience: 0.35, kind: 'fact' });
    for (const f of input.parentFacts) lines.push({ text: f.fact, salience: 0.25, kind: 'fact' });
    if (input.items.length) lines.push({ text: `Around you: ${input.items.join(', ')}.`, salience: 0.3, kind: 'item' });
  }
  return { headline: input.headline, lines };
}

// ── Taking a place in once ───────────────────────────────────────────────────

/** After this long without a stimulus a being takes the room in again. [PLACEHOLDER] */
export const SCENE_RETAKE_MS = 10 * 60_000;
/** How many things lying around a scene lists. */
export const SCENE_ITEM_CAP = 16;

/** Who and what is in the place by name, as far as this being's senses can tell. null = it cannot tell (blind, deaf, nowhere, too many things to list). */
export interface SceneRoll {
  present: string[] | null;
  items: string[] | null;
}

export interface SceneTaken {
  locationId: string | null;
  /** Standing lines already offered to the being here. What the mirror blurred stays blurred — looking closer is what Attend is for. */
  seen: Set<string>;
  /** The people and things that were here the last time it could tell. */
  present: Set<string>;
  items: Set<string>;
  at: number;
}

/**
 * Narrow a freshly gathered scene to what is still news to a being that has
 * already taken this place in: the stimulus itself (headline, speech), any
 * standing line it has not been offered here — someone who just arrived, a
 * thing just placed — and a plain absence line for a person or thing that was
 * here and is gone (a being must not keep talking to someone who walked out).
 * A new place, or a long gap, is the whole room again. Pure.
 */
export function narrowToNew(
  truth: SceneTruth,
  taken: SceneTaken | undefined,
  locationId: string | null,
  now: number,
  roll: SceneRoll = { present: null, items: null },
): { truth: SceneTruth; standing: 'full' | 'new'; taken: SceneTaken } {
  const fresh = !taken || taken.locationId !== locationId || now - taken.at > SCENE_RETAKE_MS;
  const seen = fresh ? new Set<string>() : new Set(taken.seen);
  const lines = fresh ? [...truth.lines] : truth.lines.filter((l) => l.kind === 'speech' || !seen.has(l.text));
  for (const l of truth.lines) if (l.kind !== 'speech') seen.add(l.text);

  if (!fresh) {
    if (roll.present) {
      const here = new Set(roll.present);
      for (const name of taken.present) if (!here.has(name)) lines.push({ text: `${name} is no longer here.`, salience: 0.9, kind: 'present' });
    }
    if (roll.items) {
      const here = new Set(roll.items);
      const gone = [...taken.items].filter((name) => !here.has(name));
      if (gone.length) lines.push({ text: `No longer here: ${gone.join(', ')}.`, salience: 0.45, kind: 'item' });
    }
  }
  // When it cannot tell who or what is here, it keeps what it last knew.
  const present = roll.present ? new Set(roll.present) : fresh ? new Set<string>() : taken.present;
  const items = roll.items ? new Set(roll.items) : fresh ? new Set<string>() : taken.items;
  return { truth: { headline: truth.headline, lines }, standing: fresh ? 'full' : 'new', taken: { locationId, seen, present, items, at: now } };
}

/** The stimulus with none of the standing scene: the narration, or the words spoken. Pure. */
export function stimulusOnly(truth: SceneTruth): SceneTruth {
  return { headline: truth.headline, lines: truth.lines.filter((l) => l.kind === 'speech') };
}

// In-process, per being; a restart just means the room is taken in again.
const takenIn = new Map<string, SceneTaken>();

/** Make a being (or every being) take its place in afresh on the next stimulus. */
export function forgetScene(characterId?: string): void {
  if (characterId) takenIn.delete(characterId);
  else takenIn.clear();
}

function parseLocation(raw: string): GrowthLocation | null {
  try { return JSON.parse(raw) as GrowthLocation; } catch { return null; }
}

async function locationOf(characterId: string): Promise<string | null> {
  const rel = await prisma.entityRelationship.findFirst({ where: { sourceId: characterId, relationshipType: 'located_at' }, select: { targetId: true } });
  return rel?.targetId ?? null;
}

/** Gather the truth the being is standing in. The stimulus is the headline. */
export async function composeSceneTruth(
  characterId: string,
  campaignId: string,
  stimulus: string,
  source: 'perception' | 'dialogue',
): Promise<{ truth: SceneTruth; locationId: string | null; roll: SceneRoll }> {
  const character = await prisma.character.findUnique({ where: { id: characterId }, select: { data: true } });
  let sheet: { bodyAnatomy?: unknown; traits?: unknown } | null = null;
  try { sheet = character ? (JSON.parse(character.data) as { bodyAnatomy?: unknown; traits?: unknown }) : null; } catch { sheet = null; }
  // Sense grants: organs + traits on the sheet, plus the items the being holds (a read failure grants nothing).
  const held = await Promise.resolve().then(() => prisma.campaignItem.findMany({ where: { holderId: characterId, status: 'ACTIVE' }, select: { id: true, name: true, data: true }, take: 100 })).catch(() => []);
  const profile = senseProfileFromSheet(sheet, { items: held });
  const senses = { canSee: profile.effectiveness.sight > 0, canHear: profile.effectiveness.hearing > 0, effectiveness: profile.effectiveness };

  const locationId = await locationOf(characterId);
  let place: SceneInput['place'] = null;
  let parent: SceneInput['parent'] = null;
  let present: SceneInput['present'] = [];
  let items: string[] = [];
  let facts: WorldFactRecord[] = [];
  let parentFacts: WorldFactRecord[] = [];

  if (locationId) {
    const loc = await prisma.location.findUnique({ where: { id: locationId }, select: { id: true, name: true, data: true, campaignId: true } });
    if (loc && loc.campaignId === campaignId) {
      const data = parseLocation(loc.data);
      place = { name: loc.name, data };
      const parentRel = await prisma.entityRelationship.findFirst({ where: { sourceId: loc.id, relationshipType: 'located_at' }, select: { targetId: true } });
      const parentLoc = parentRel ? await prisma.location.findUnique({ where: { id: parentRel.targetId }, select: { name: true, data: true } }) : null;
      if (parentLoc) parent = { name: parentLoc.name, data: parseLocation(parentLoc.data) };

      const here = await prisma.entityRelationship.findMany({ where: { targetId: loc.id, relationshipType: 'located_at', sourceId: { not: characterId } }, select: { sourceId: true } });
      const ids = here.map((h) => h.sourceId);
      if (ids.length) {
        const chars = await prisma.character.findMany({ where: { id: { in: ids }, campaignId }, select: { id: true, name: true, data: true } });
        present = chars.map((c) => {
          let description: string | null = null;
          // What can be seen of them: a free-text description if the sheet carries one (improvised stubs, NPC blocks); the structured physicalDescription otherwise.
          try {
            const d = JSON.parse(c.data) as { identity?: { physicalDescription?: unknown }; _improv?: { description?: string }; _npc?: { description?: string; appearance?: string } };
            const pd = d.identity?.physicalDescription;
            const structured = pd && typeof pd === 'object' ? Object.entries(pd as Record<string, unknown>).filter(([k, v]) => typeof v === 'string' && v && !['underclothing', 'measurements'].includes(k)).map(([, v]) => v as string).join(', ') : typeof pd === 'string' ? pd : '';
            description = (d._improv?.description ?? d._npc?.appearance ?? d._npc?.description ?? structured ?? '').slice(0, 200) || null;
          } catch { /* no description */ }
          return { name: c.name, description };
        });
      }
      const itemRows = await prisma.campaignItem.findMany({ where: { campaignId, locationId: loc.id, status: 'ACTIVE' }, select: { name: true }, take: SCENE_ITEM_CAP });
      items = itemRows.map((i) => i.name);

      const all = await currentFacts(campaignId);
      facts = factsForPlace(all, placeKeys(loc.name, data?.tags ?? [])).slice(0, 30);
      if (parentLoc) {
        const seen = new Set(facts.map((f) => f.id));
        parentFacts = factsForPlace(all, placeKeys(parentLoc.name)).filter((f) => !seen.has(f.id)).slice(0, 12);
      }
    }
  }

  const truth = composeSceneLines({
    headline: source === 'perception' ? stimulus : null,
    speech: source === 'dialogue' ? [stimulus] : [],
    place, parent, present, items, facts, parentFacts, senses,
  });
  const roll = sceneRoll({ placed: place !== null, present: present.map((p) => p.name), items, senses });
  return { truth, locationId, roll };
}

/** The roll call narrowToNew compares against: only what these senses can account for. Pure. */
export function sceneRoll(input: { placed: boolean; present: string[]; items: string[]; senses: { canSee: boolean; canHear: boolean } }): SceneRoll {
  return {
    present: input.placed && (input.senses.canSee || input.senses.canHear) ? input.present : null,
    // At the cap the list is a sample, not the room: something missing from it has not necessarily gone.
    items: input.placed && input.senses.canSee && input.items.length < SCENE_ITEM_CAP ? input.items : null,
  };
}

async function observerFor(characterId: string): Promise<{ observer: Observer; godlike: boolean }> {
  const entity = await prisma.dayaEntity.findUnique({ where: { characterId }, select: { id: true, personaProfile: true, affect: { select: { morale: true, stress: true, grief: true } } } });
  let persona: { bias?: BiasProfile; voice?: VoiceParams; godlike?: boolean; omniscient?: boolean } = {};
  try { persona = entity ? JSON.parse(entity.personaProfile) : {}; } catch { persona = {}; }
  const mood = entity?.affect ? { morale: entity.affect.morale, stress: entity.affect.stress, grief: entity.affect.grief } : { morale: 0, stress: 0, grief: 0 };
  return {
    godlike: persona.godlike === true || persona.omniscient === true,
    observer: { entityId: characterId, attunement: SCENE_ATTUNEMENT, biasProfile: persona.bias ?? {}, mood, voice: persona.voice ?? {} },
  };
}

/** Truth text for the Terminal tier / audit — the envelope unrendered. */
export function sceneTruthText(truth: SceneTruth): string {
  return [truth.headline, ...truth.lines.map((l) => l.text)].filter(Boolean).join('\n');
}

/**
 * The murky mirror for a stimulus: compose the scene the being stands in,
 * then render it through its own observer. Never throws on the model — the
 * renderer falls back to the deterministic envelope.
 */
export async function perceive(
  characterId: string,
  campaignId: string,
  stimulus: string,
  source: 'perception' | 'dialogue',
  overrides: DayaClientOverrides = {},
  opts: PerceiveOptions = {},
): Promise<PerceiveResult> {
  // The scene is gathered fresh every time (a few ms of local reads), so what is in the place is never stale.
  const { truth: whole, locationId, roll } = await composeSceneTruth(characterId, campaignId, stimulus, source);
  const narrowed = opts.standing === 'once' ? narrowToNew(whole, takenIn.get(characterId), locationId, Date.now(), roll) : null;
  const truth = narrowed?.truth ?? (opts.standing === 'stimulus' ? stimulusOnly(whole) : whole);
  const standing = narrowed?.standing ?? (opts.standing === 'stimulus' ? 'new' : 'full');
  const { observer: current, godlike } = await observerFor(characterId);
  // Scene clarity = SCENE_ATTUNEMENT dimmed per line by the senses (composeSceneLines); familiarity of the
  // place does not set it (D1, unit 5) — familiarity will name entities/aspects (later units).
  // Exposure is NOT recorded here (N writes per stimulus per being): units 6+7 record it batched, once per
  // pass per being, from the reach/notice pass (services/perception-reach recordNoticedExposures, flag-gated).
  const observer: Observer = { ...current, ...(opts.observer?.mood ? { mood: opts.observer.mood } : {}), ...(opts.observer?.attunement != null ? { attunement: opts.observer.attunement } : {}) };
  const snapshot = { mood: observer.mood, attunement: observer.attunement };
  const subjectKey = `scene:${locationId ?? 'nowhere'}`;
  const context = source === 'dialogue' ? 'Someone just spoke to you, here, now.' : 'This is happening around you, here, now.';
  const base = { locationId, truthLines: truth.lines.length, observer: snapshot, standing };
  if (godlike) {
    if (narrowed) takenIn.set(characterId, narrowed.taken);
    return { ...base, prose: sceneTruthText(truth), fidelityLevel: 5, distortions: ['godlike:unmirrored'], mirrored: false, voiced: false };
  }
  if (opts.voice === false) {
    // The same envelope render() would hand the voicer, unvoiced. Scene keys carry no revision epoch, so the seed matches.
    const level = computeFidelityLevel('scene', observer.attunement);
    const content = computeSceneContent({ subject: 'scene', subjectKey, trueData: truth, context }, observer.biasProfile, observer.mood, level, rngFor(characterId, subjectKey, 0));
    if (narrowed) takenIn.set(characterId, narrowed.taken);
    // The tilt line is a note to the voicer, not something perceived.
    const prose = content.prose.split('\n').filter((l) => !l.startsWith('Your mood tilts')).join('\n');
    return { ...base, prose, fidelityLevel: level, distortions: [...content.distortions, 'unvoiced'], mirrored: true, voiced: false };
  }
  const view = await render({ subject: 'scene', subjectKey, trueData: truth, context }, observer, overrides);
  if (narrowed) takenIn.set(characterId, narrowed.taken);
  return { ...base, prose: view.prose, fidelityLevel: view.fidelityLevel, distortions: view.distortions, mirrored: true, voiced: true };
}
