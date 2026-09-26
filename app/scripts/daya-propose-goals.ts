/**
 * Propose goals for a DAYA-wrapped character from what the being already
 * is — its persona (identity narrative, voice notes) and its seed memories —
 * and write them as ACTIVE Goal rows (readiness pass 2026-09-26: goals are
 * the heaviest rung of recall after survival; a being with no goals has no
 * vines and nothing to climb).
 *
 * The proposal is made by the C tier. The character's own words are never
 * printed unless --show is passed — blind-play firewall: Mike never wants
 * Violet's story volunteered to him.
 *
 * Usage: npx tsx scripts/daya-propose-goals.ts <characterId> [--apply] [--show] [--max 4]
 *   default is a dry run (counts only). --apply writes the goals.
 */
import './_server-only-shim';
import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { prisma } from '../src/lib/db';
import { chat } from '../src/daya/model-client';
import { MAX_ACTIVE_GOALS } from '../src/services/goal';

const args = process.argv.slice(2);
const characterId = args.find((a) => !a.startsWith('--'));
const apply = args.includes('--apply');
const show = args.includes('--show');
const maxIdx = args.indexOf('--max');
const maxNew = maxIdx >= 0 ? Number(args[maxIdx + 1]) : 4;

if (!characterId) { console.error('usage: daya-propose-goals.ts <characterId> [--apply] [--show] [--max n]'); process.exit(1); }

interface Proposed { description: string; priority: number; why: string }

(async () => {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: { id: true, name: true, campaignId: true, entityType: true, daya: { select: { id: true, personaProfile: true } } },
  });
  if (!character) { console.error('character not found'); process.exit(1); }
  if (!character.daya) { console.error(`${character.name} has no DAYA entity — nothing to propose from`); process.exit(1); }

  const existing = await prisma.goal.findMany({ where: { characterId, status: 'ACTIVE' }, select: { description: true, priority: true } });
  const room = Math.max(0, Math.min(maxNew, MAX_ACTIVE_GOALS - existing.length));
  console.log(`${character.name} (${character.entityType}): ${existing.length} active goals; room for ${room}`);
  if (room === 0) { await prisma.$disconnect(); return; }

  let persona: { identityNarrative?: string; voiceNotes?: string } = {};
  try { persona = JSON.parse(character.daya.personaProfile); } catch { /* empty persona */ }
  const seeds = await prisma.dayaMemoryEntry.findMany({
    where: { entityId: character.daya.id, source: 'seed' },
    orderBy: { salience: 'desc' },
    take: 40,
    select: { content: true, salience: true },
  });
  console.log(`persona: narrative ${persona.identityNarrative?.length ?? 0} chars, voice ${persona.voiceNotes?.length ?? 0} chars; ${seeds.length} seed memories`);

  const res = await chat({
    tier: 'C', subsystem: 'goal-proposal', entityId: character.daya.id,
    messages: [
      { role: 'system', content: `You propose the ACTIVE goals of a tabletop character for the GM, from the character's own identity and memories. Goals are what the character is actually trying to do or protect right now — concrete, first-person-actionable, in plain language ("Find who took the ledger", "Keep Ruth from finding out"). Not themes, not traits. Priority 1 = most urgent … 5 = background. Respond with ONLY a JSON array of at most ${room} objects: [{"description": string (≤120 chars), "priority": 1-5, "why": one short sentence citing the memory or narrative line it rests on}]. Do not repeat any of the existing goals.` },
      { role: 'user', content: `CHARACTER: ${character.name}\n\nIDENTITY NARRATIVE:\n${persona.identityNarrative ?? '(none)'}\n\nVOICE NOTES:\n${persona.voiceNotes ?? '(none)'}\n\nSEED MEMORIES (most salient first):\n${seeds.map((s, i) => `${i + 1}. ${s.content}`).join('\n')}\n\nEXISTING ACTIVE GOALS:\n${existing.length ? existing.map((g) => `- (p${g.priority}) ${g.description}`).join('\n') : '(none)'}` },
    ],
    maxTokens: 900, temperature: 0.4,
  });

  const match = res.text.match(/\[[\s\S]*\]/);
  if (!match) { console.error('model returned no JSON array'); if (show) console.error(res.text); process.exit(1); }
  let proposed: Proposed[] = [];
  try { proposed = JSON.parse(match[0]); } catch (err) { console.error('bad JSON from model', err); process.exit(1); }
  proposed = proposed
    .filter((p) => p && typeof p.description === 'string' && p.description.trim().length >= 3)
    .map((p) => ({ description: p.description.trim().slice(0, 500), priority: Math.min(5, Math.max(1, Math.round(Number(p.priority) || 3))), why: String(p.why ?? '') }))
    .slice(0, room);

  console.log(`proposed ${proposed.length} goals (priorities: ${proposed.map((p) => p.priority).join(', ')})`);
  if (show) for (const p of proposed) console.log(`  p${p.priority} ${p.description}\n     why: ${p.why}`);

  if (apply) {
    for (const p of proposed) {
      await prisma.goal.create({
        data: { characterId, campaignId: character.campaignId, description: p.description, priority: p.priority, status: 'ACTIVE' },
      });
    }
    console.log(`wrote ${proposed.length} ACTIVE goals for ${character.name}`);
  } else {
    console.log('dry run — pass --apply to write them');
  }
  await prisma.$disconnect();
  process.exit(0);
})().catch((err) => { console.error(err); process.exit(1); });
