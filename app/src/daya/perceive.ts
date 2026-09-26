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
import type { SceneLine, SceneTruth, BiasProfile, VoiceParams } from './renderer-math';
import { currentFacts, type WorldFactRecord } from './world-ledger';
import { senseFlagsFromSheet } from '@/sim/senses/field';
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
}

/** Perceptual attunement to one's own surroundings. Flat for now — [QUESTION for Mike]: which attribute governs it (Focus? Wisdom?). */
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
  senses: { canSee: boolean; canHear: boolean };
}

/** Deterministic composition of the truth the being is standing in. Pure. */
export function composeSceneLines(input: SceneInput): SceneTruth {
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
): Promise<{ truth: SceneTruth; locationId: string | null }> {
  const character = await prisma.character.findUnique({ where: { id: characterId }, select: { data: true } });
  let sheet: { bodyAnatomy?: unknown } | null = null;
  try { sheet = character ? (JSON.parse(character.data) as { bodyAnatomy?: unknown }) : null; } catch { sheet = null; }
  const senses = senseFlagsFromSheet(sheet);

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
          try { description = (JSON.parse(c.data) as { identity?: { physicalDescription?: string } }).identity?.physicalDescription?.slice(0, 200) ?? null; } catch { /* no description */ }
          return { name: c.name, description };
        });
      }
      const itemRows = await prisma.campaignItem.findMany({ where: { campaignId, locationId: loc.id, status: 'ACTIVE' }, select: { name: true }, take: 16 });
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
  return { truth, locationId };
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
): Promise<PerceiveResult> {
  const { truth, locationId } = await composeSceneTruth(characterId, campaignId, stimulus, source);
  const { observer, godlike } = await observerFor(characterId);
  if (godlike) {
    return { prose: sceneTruthText(truth), fidelityLevel: 5, distortions: ['godlike:unmirrored'], locationId, truthLines: truth.lines.length, mirrored: false };
  }
  const view = await render(
    { subject: 'scene', subjectKey: `scene:${locationId ?? 'nowhere'}`, trueData: truth, context: source === 'dialogue' ? 'Someone just spoke to you, here, now.' : 'This is happening around you, here, now.' },
    observer,
    overrides,
  );
  return { prose: view.prose, fidelityLevel: view.fidelityLevel, distortions: view.distortions, locationId, truthLines: truth.lines.length, mirrored: true };
}
