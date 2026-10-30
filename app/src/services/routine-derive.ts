/**
 * Deriving a being's routines ONCE from its own words (Claude; ruled by
 * Michael 2026-10-30). The intention engine already finds the sentences — "I
 * order from the same pizza place every day", "I lock the door every time",
 * "Tonight, when he knocks, I'm going to give it to him as the tip". What
 * those words imply the HANDS do is read here, in the world's own op
 * vocabulary (daya/routines.ts RoutineEnd), against what the being holds and
 * who it knows. Never a step the words do not imply; never the walking or the
 * unlocking — the planner derives those from the map every beat.
 *
 * One call per being on the judgment lane, through the wall (fiction). Re-run
 * when the being's intentions change (scripts/derive-routines.ts, or the lazy
 * kick in routine-run when a being with intentions has no routines yet).
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { routedChatText } from '@/ai/network/chat';
import { parseRoutineDrafts, type RoutineDraft } from '@/daya/routines';
import { actorMap } from '@/services/world-apply';

const MAX_TOKENS = 1200;

export function buildRoutineDerivePrompt(a: {
  name: string;
  intentions: Array<{ id: string; description: string; trigger: string | null; cadence: string | null }>;
  memories: string[];
  held: string[];
  people: string[];
  doors: string[];
  /** The world's facts that touch the person's things and dealings (money owed, a standing order). */
  facts?: string[];
}): { system: string; user: string } {
  const system = `You read a person's own words about their days and write down, in a fixed vocabulary, what their hands do when a routine of theirs runs. You add nothing the words and the things do not imply — but you read the things too: what a thing's own description or the world's facts say (a receipt that reads "cash on delivery, not paid"; a standing order) is part of what the routine is for.

A ROUTINE has: a name in the person's own register (short), 2–5 triggers, a cadence (daily | nightly | weekly | always | null), and its ENDS in the order the hands reach them — what is true when the routine has RUN to its end: the thing received, the thing paid for, the door shut again.
ORDER is the hands' order: what is received comes before what is paid; paying comes before a tip or a gift; a door shut or locked comes last. A door opening is not an end unless the words are about the door itself — the body opens it on the way.
TRIGGERS are what the person hears or sees at the MOMENT the routine runs — for a delivery, the knock at the door and the box, never the ordering; for locking up, coming in or going out. Plain sensory words ("knock", "delivery", "pizza box"), never abstractions, never words that would fire on ordinary talk ("home", "inside", "time").
  {"kind":"hold","item":"<thing>"}            the person has the thing in hand (took it, or was handed it)
  {"kind":"gave","item":"<thing>","to":"<person>"}   the thing is in that person's hands
  {"kind":"door","door":"<door or 'the way out'>","state":"open"|"closed"|"locked"}
  {"kind":"at","place":"<room or thing>"}
Use the names from the lists for things and people exactly. Use "the way out" for the door that leaves the home unless a door is named. The person an end names is the one the WORDS name; when the words name a role and no name ("the customer", "the driver", "the caller"), write the role — never pick a name from the list the words do not point to. Do NOT write the walking, the unlocking or the opening as ends unless the words are about the door itself — the body does those on the way. A sentence meant for one night (a trigger, a "tonight") belongs INSIDE the routine it rides on, as an end at the right place (a tip is handed over when paying). Routines that are only a habit of attention with no hands ("I always notice…") are not routines: skip them. Fold a routine the words describe twice into one.

Answer with JSON only: {"routines":[{"name":"…","triggers":["…"],"cadence":"daily","ends":[…],"sourceIntentionIds":["…"]}]}`;
  const user = `The person: ${a.name}.

Their own words that are intentions or habits (id · sentence · trigger · cadence):
${a.intentions.map((i) => `- ${i.id} · ${i.description} · ${i.trigger ?? '—'} · ${i.cadence ?? '—'}`).join('\n') || '(none)'}

The memories those words came from, for context:
${a.memories.map((m) => `- ${m}`).join('\n') || '(none)'}

What they have on them or own, by name (with what each thing says of itself):
${a.held.map((h) => `- ${h}`).join('\n') || '(nothing listed)'}

People they know, by name (with what those people carry, when it bears on the person):
${a.people.map((p) => `- ${p}`).join('\n') || '(nobody listed)'}

Doors of where they live, by name:
${a.doors.map((d) => `- ${d}`).join('\n') || '(none drawn)'}
${a.facts?.length ? `\nWhat the world holds true about their things and dealings:\n${a.facts.map((f) => `- ${f}`).join('\n')}` : ''}`;
  return { system, user };
}

/** Derive and store. Returns the routines written. Replaces every routine of the being that is not RUNNING. */
export async function deriveRoutines(characterId: string): Promise<RoutineDraft[]> {
  const ch = await prisma.character.findUnique({ where: { id: characterId }, select: { id: true, name: true, campaignId: true } });
  if (!ch) throw new Error(`no character ${characterId}`);
  const entity = await prisma.dayaEntity.findUnique({ where: { characterId }, select: { id: true } });
  if (!entity) throw new Error(`${ch.name} has no DAYA entity`);
  const intentions = await prisma.dayaIntention.findMany({ where: { entityId: entity.id, status: 'PENDING', OR: [{ cadence: { not: null } }, { trigger: { not: null } }] }, orderBy: { createdAt: 'asc' } });
  if (!intentions.length) return [];
  const memIds = [...new Set(intentions.map((i) => i.sourceMemoryId).filter((x): x is string => !!x))];
  const memories = memIds.length ? await prisma.dayaMemoryEntry.findMany({ where: { id: { in: memIds } }, select: { content: true } }) : [];
  const describe = (i: { name: string; data: string | null }) => {
    let d: Record<string, unknown> = {};
    try { d = i.data ? JSON.parse(i.data) : {}; } catch { d = {}; }
    const line = [d.description, d.state, d.look].find((x) => typeof x === 'string' && x.trim()) as string | undefined;
    return line ? `${i.name} — ${line.replace(/\s+/g, ' ').slice(0, 160)}` : i.name;
  };
  const held = ch.campaignId ? await prisma.campaignItem.findMany({ where: { campaignId: ch.campaignId, status: 'ACTIVE', holderId: characterId }, select: { name: true, data: true } }) : [];
  const owned = await prisma.entityRelationship.findMany({ where: { sourceId: characterId, relationshipType: 'owns' }, select: { targetId: true } }).catch(() => []);
  const ownedRows = owned.length ? await prisma.campaignItem.findMany({ where: { id: { in: owned.map((o) => o.targetId) }, status: 'ACTIVE' }, select: { name: true, data: true } }) : [];
  const people = ch.campaignId ? await prisma.character.findMany({ where: { campaignId: ch.campaignId, id: { not: characterId }, status: { notIn: ['DEAD', 'RETIRED'] }, entityType: { in: ['NPC', 'PLAYER_CHARACTER'] } }, select: { id: true, name: true } }) : [];
  // What the people carry that names this person or their things (the receipt in the driver's hand): read, never invented.
  const carried = ch.campaignId && people.length ? await prisma.campaignItem.findMany({ where: { campaignId: ch.campaignId, status: 'ACTIVE', holderId: { in: people.map((p) => p.id) } }, select: { name: true, data: true, holderId: true } }) : [];
  const first = ch.name.split(/\s+/)[0].toLowerCase();
  const peopleLines = people.map((p) => {
    const theirs = carried.filter((c) => c.holderId === p.id).filter((c) => `${c.name} ${c.data ?? ''}`.toLowerCase().includes(first) || /order|deliver|receipt|owe|paid|pay/i.test(`${c.name} ${c.data ?? ''}`));
    return theirs.length ? `${p.name} — carries: ${theirs.map(describe).join('; ')}` : p.name;
  });
  const facts = ch.campaignId ? await prisma.worldFact.findMany({ where: { campaignId: ch.campaignId, supersededById: null }, select: { subjectKey: true, fact: true }, take: 400 }).catch(() => []) : [];
  const mine = new Set([...held, ...ownedRows].map((i) => i.name.toLowerCase()));
  const factLines = facts
    .filter((f) => { const t = `${f.subjectKey} ${f.fact}`.toLowerCase(); return t.includes(first) || [...mine].some((n) => n.length > 3 && t.includes(n)) || /owe|paid|unpaid|pay|order|deliver/.test(t); })
    .map((f) => f.fact.replace(/\s+/g, ' ').slice(0, 160))
    .slice(0, 24);
  const map = await actorMap(characterId).catch(() => null);
  const { system, user } = buildRoutineDerivePrompt({
    name: ch.name,
    intentions: intentions.map((i) => ({ id: i.id, description: i.description, trigger: i.trigger, cadence: i.cadence })),
    memories: memories.map((m) => m.content.replace(/\s+/g, ' ').slice(0, 700)),
    held: [...new Map([...held, ...ownedRows].map((i) => [i.name, describe(i)])).values()],
    people: peopleLines,
    doors: (map?.doors ?? []).map((d) => `${d.name} (between ${d.between.join(' and ')})`),
    facts: factLines,
  });
  const res = await routedChatText(
    { caller: 'routine-derive', lane: 'judgment', contentClass: 'fiction', ...(ch.campaignId ? { campaignId: ch.campaignId } : {}) },
    { system, user, maxTokens: MAX_TOKENS, temperature: 0 },
  );
  const drafts = parseRoutineDrafts(extractJson(res.text));
  const known = new Set(intentions.map((i) => i.id));
  const now = ch.campaignId ? (await prisma.campaign.findUnique({ where: { id: ch.campaignId }, select: { currentCycle: true } }))?.currentCycle ?? 0 : 0;
  await prisma.$transaction(async (tx) => {
    await tx.dayaRoutine.deleteMany({ where: { entityId: entity.id, status: { not: 'RUNNING' } } });
    for (const d of drafts) {
      await tx.dayaRoutine.create({
        data: {
          entityId: entity.id, name: d.name, triggers: JSON.stringify(d.triggers), cadence: d.cadence,
          ends: JSON.stringify(d.ends), sourceIntentionIds: JSON.stringify(d.sourceIntentionIds.filter((id) => known.has(id))),
          status: 'READY', lastDoneCycle: null, startedCycle: null,
        },
      });
    }
  });
  console.log(`[routine-derive] ${ch.name}: ${drafts.length} routine(s) at cycle ${now.toFixed(4)} — ${drafts.map((d) => `"${d.name}" [${d.triggers.join(', ')}] ${d.ends.length} ends`).join('; ')}`);
  return drafts;
}

function extractJson(text: string): unknown {
  const t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : t;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  try { return JSON.parse(start >= 0 && end > start ? body.slice(start, end + 1) : body); } catch { return null; }
}
