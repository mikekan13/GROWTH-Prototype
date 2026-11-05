/**
 * Puts Michael's hand-built Thorn "Dialed to Eleven" on Kristopher's sheet (WIP-kristopher-design.md, 2026-11-05).
 * Mechanics are DATA (TraitMechanic[]); the engine hooks in lib/character-actions.ts read them.
 *
 *   node --env-file=.env --env-file=.env.local --import tsx ../tmp/add-dialed-to-eleven.ts          — dry run
 *   node --env-file=.env --env-file=.env.local --import tsx ../tmp/add-dialed-to-eleven.ts --apply  — write (backup to data/archive)
 */
import '../app/scripts/_server-only-shim';
import { writeFileSync } from 'node:fs';
import { prisma } from '../app/src/lib/db';

const K = 'cmvcbw49u0001h448qanzbhs3';
const NAME = 'Dialed to Eleven';

const splittingMechanics = [{ kind: 'effort_all_or_nothing' }];
const trait = {
  name: NAME,
  type: 'thorn',
  pillar: 'soul',
  category: 'utility',
  source: 'Michael (hand-built, 2026-11-05)',
  kv: -110,
  lienKV: 110,
  maturityFlags: ['mental-health'],
  description:
    'Every feeling arrives at full volume. Every change to a Soul pool (Willpower, Wisdom, Wit) is doubled, in and out: damage lands doubled, Effort costs the pool double for the normal wager, and anything that restores a Soul pool restores double. When Willpower hits zero there is no middle ground left — Splitting takes hold, and every wager is all or nothing until Willpower is above zero again. The one place the knob works for him: when the point of the check is to move another person, to plead, confront, comfort or confess, Effort costs the normal rate.',
  mechanicalEffect: 'Soul pool changes ×2 (in and out); Willpower 0 → Blossom "Splitting" (Effort all or nothing) until Willpower > 0; Effort at normal cost when the aim is to move another person emotionally',
  mechanics: [
    { kind: 'pool_multiplier', pools: ['willpower', 'wisdom', 'wit'], factor: 2, direction: 'both' },
    {
      kind: 'generate_blossom',
      when: { pool: 'willpower', at: 0 },
      blossom: {
        name: 'Splitting',
        description: 'No middle ground. While this lasts, any Effort wagered is all or nothing: the whole remaining pool, or none.',
        pillar: 'soul',
        mechanics: splittingMechanics,
        expiry: { kind: 'trigger', text: 'Willpower above 0', pool: 'willpower', above: 0 },
      },
    },
  ],
};

(async () => {
  const apply = process.argv.includes('--apply');
  const c = await prisma.character.findUniqueOrThrow({ where: { id: K }, select: { name: true, data: true } });
  const d = JSON.parse(c.data ?? '{}');
  const traits: Array<Record<string, unknown>> = Array.isArray(d.traits) ? d.traits : [];
  const already = traits.findIndex((t) => t.name === NAME);
  console.log(`${c.name}: ${traits.length} traits — ${traits.map((t) => `${t.type}:${t.name}`).join(' | ')}`);
  console.log(already >= 0 ? `"${NAME}" already present at index ${already} — will REPLACE it` : `"${NAME}" not present — will ADD as trait #${traits.length + 1}`);
  console.log(JSON.stringify(trait, null, 2));
  if (!apply) { console.log('\n(dry run; pass --apply to write)'); process.exit(0); }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  writeFileSync(`C:/Projects/GRO.WTH/app/data/archive/kristopher-traits-before-dialed-to-eleven-${stamp}.json`, JSON.stringify({ characterId: K, traits }, null, 2));
  if (already >= 0) traits[already] = trait; else traits.push(trait);
  d.traits = traits;
  await prisma.character.update({ where: { id: K }, data: { data: JSON.stringify(d) } });
  console.log(`\nwritten — ${traits.length} traits now; backup kristopher-traits-before-dialed-to-eleven-${stamp}.json`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
