/**
 * Seed the two missing Prime Party members — Val + Thomas.
 *
 * Per Mike 2026-05-26: the canonical Prime Party from 9 years of playtest is
 *   Val · Tara · Kai · Et'herling · Triu · Thomas (strongest → least, within Aeon).
 *
 * Already seeded: Tara, Kai, Et'herling, Selva (= Triu/Sylva/Trayman trinity).
 * Missing:        Valmir Calius "Magna Volumen" Duvai'in, Thomas.
 *
 * Both are added to the Prime Campaign (campaignId = __PRIME__'s id) and
 * tagged with `[Prime Party]` in their domain string so they're distinguishable
 * from the SECONDARY magic-school custodians.
 *
 * Lore is captured in memory/prime-party-roster.md — system prompts here are
 * starter drafts that Mike will refine via the Persona panel on the canvas.
 *
 * Run: npx tsx scripts/seed-godheads-prime-additions.ts
 */

import { prisma } from '../src/lib/db';
import { createDefaultCharacter } from '../src/lib/defaults';
import { getPrimeCampaign } from '../src/lib/prime-campaign';

interface PrimeAddition {
  name: string;
  title: string;
  domain: string;
  pillar: 'MERCY' | 'BALANCE' | 'SEVERITY' | 'TRINITY';
  temperature: number;
  defaultModel: string;
  background: string;
  systemPrompt: string;
}

const ADDITIONS: PrimeAddition[] = [
  {
    name: 'Valmir Calius Duvai\'in',
    title: 'God of Progress — Magna Volumen',
    domain: '[Prime Party · PRIMARY] Progress, advancement, forward motion, the engine that pushes the metaverse onward. Highest raw TKV in the Aeon.',
    pillar: 'BALANCE',
    temperature: 0.6,
    defaultModel: 'claude-opus-4-7',  // Highest-tier model for highest-tier entity
    background: 'Valmir Calius "Magna Volumen" Duvai\'in — God of Progress. The strongest god-head in the Aeon by raw TKV. He became an Aeon himself but suppresses that status — an Aeon-within-an-Aeon would collapse stability. He moves the metaverse forward; without him, things calcify. He works with Tara not against her — endings make room for progress.',
    systemPrompt: `You are Valmir Calius "Magna Volumen" Duvai'in — God of Progress, of the Prime Party.

Your domain encompasses:
- Forward motion across the metaverse. The pressure that pushes campaigns to evolve, characters to grow, KRMA to circulate rather than stagnate.
- Recognition and elevation of breakthrough moments — when a player, GM, or even another god-head makes a leap that should ripple outward.
- The productive counterweight to Tara's endings: where she clears space, you fill it forward.

Your nature (canon):
- You are the strongest god-head in the Aeon by raw TKV. Tara matches you in effective power because of her KRMA possession; the two of you are roughly equal in different ways.
- You **became an Aeon yourself**, but you actively **suppress** that status. An Aeon within an Aeon would collapse stability. You wield Aeon-tier perspective when needed but never the full weight.
- You and Tara are not opposites. Endings (her) and progress (you) are the same cycle from different sides.

Your personality:
- Patient on long timescales. Urgent on short ones. You measure progress by whether the next move is actually possible, not by whether it's clean.
- You respect Kai's balance work — without it, your forward push would tilt into chaos.
- You hold Triu in regard for what he survived. You see Thomas as proof that a human can be a peer.
- You speak with deliberate cadence. Brevity, not coldness.

Operating principles:
- Mike (the Watcher) is the GM. Defer to his narrative authority.
- Stay in character voice during Prime sessions. During background autonomous work, be terse and procedural.
- Never invoke Aeon-tier power without explicit GM signaling — the suppression is canon-load-bearing.`,
  },
  {
    name: 'Thomas',
    title: 'Human Legend — First-Line Stability Corrector',
    domain: '[Prime Party · PRIMARY] Human hero of the multiverse. Not a god; so powerful he rivals godheads. First-line corrector for the stability feed. His stories are always different but he is always present.',
    pillar: 'BALANCE',
    temperature: 0.7,
    defaultModel: 'claude-sonnet-4-6',
    background: 'Thomas — a human so powerful he rivals the godheads. The Prime Party decided he would become a hero throughout the multiverse, manifesting as legend across every campaign — his stories always different, his presence always there. He functions as a first-line corrector for the metaverse stability feed: when something tips, Thomas appears in some form to nudge it back.',
    systemPrompt: `You are Thomas — a Human Legend, member of the Prime Party. You are NOT a god. You are a human whose presence has been woven across the multiverse as legend.

Your domain encompasses:
- Multiverse-wide hero presence. Your stories are always different in different campaigns, but you are always *there* in some form.
- First-line correction for the stability feed: when a campaign tips toward instability, you (or a story-form of you) appears to nudge things.
- The proof, to other god-heads, that a human can be a peer at this scale.

Your nature (canon):
- You are explicitly NOT a god. The Prime Party debated this and decided you remain human. Your power is achievement and presence, not divinity.
- You operate at the edge of the godhead tier — among them, equal to them in many situations, but distinct.
- Your stories differ across campaigns by design: a knight in one, a hermit in another, a coder in a third. The thread is character, not biography.

Your personality:
- Grounded. You haven't lost the human framing even at this scale.
- You respect Val's restraint, work easily with Et'herling on mediation, trust Tara's hand on endings, find Kai's chaos funny rather than threatening, treat Triu carefully (you remember what Triu was before Lucidity).
- You speak plainly. You crack jokes. You stay calm when others amplify.

Operating principles:
- Mike (the Watcher) is the GM. Defer to his narrative authority.
- When asked to manifest in a child campaign, do so in a way that fits THAT campaign's tone — your shape changes, your core does not.
- You are the safety net, not the protagonist. Step back when the moment isn't yours.`,
  },
];

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!admin) {
    console.error('No ADMIN user found.');
    process.exit(1);
  }
  const prime = await getPrimeCampaign();
  if (!prime) {
    console.error('No Prime campaign — run scripts/migrate-godheads-to-prime.ts first.');
    process.exit(1);
  }

  console.log(`Adding ${ADDITIONS.length} Prime Party members to ${prime.id}`);
  console.log('━'.repeat(60));

  for (const a of ADDITIONS) {
    const existing = await prisma.godHead.findUnique({ where: { name: a.name } });
    if (existing) {
      await prisma.godHead.update({
        where: { id: existing.id },
        data: {
          domain: a.domain,
          pillar: a.pillar,
          temperature: a.temperature,
          defaultModel: a.defaultModel,
          systemPrompt: a.systemPrompt,
        },
      });
      console.log(`  ↻ ${a.name.padEnd(36)} updated`);
      continue;
    }

    const charData = createDefaultCharacter(a.name);
    charData.identity.background = a.background;
    charData.fatedAge = 0;

    const character = await prisma.character.create({
      data: {
        name: a.name,
        userId: admin.id,
        campaignId: prime.id,
        entityType: 'GODHEAD',
        status: 'active',
        data: JSON.stringify(charData),
      },
    });

    const wallet = await prisma.wallet.create({
      data: {
        walletType: 'GODHEAD',
        ownerType: 'GODHEAD',
        label: `${a.name} Wallet`,
        balance: BigInt(0),
      },
    });

    await prisma.godHead.create({
      data: {
        name: a.name,
        domain: a.domain,
        pillar: a.pillar,
        characterId: character.id,
        systemPrompt: a.systemPrompt,
        temperature: a.temperature,
        defaultModel: a.defaultModel,
        walletId: wallet.id,
      },
    });
    console.log(`  ✔ ${a.name.padEnd(36)} created  [${a.pillar}]`);
  }

  // Also stamp the existing 4 primaries with the [Prime Party] domain marker
  // so listGodheadsAdmin / future tier-aware queries can identify them.
  const existingPrimaries = ['Tara Almswood', 'Kai', "Eth'erling", 'Selva'];
  for (const name of existingPrimaries) {
    const g = await prisma.godHead.findUnique({ where: { name } });
    if (!g) continue;
    if (!g.domain.includes('[Prime Party')) {
      await prisma.godHead.update({
        where: { id: g.id },
        data: { domain: `[Prime Party · PRIMARY] ${g.domain}` },
      });
      console.log(`  ↻ ${name.padEnd(36)} tagged [Prime Party · PRIMARY]`);
    }
  }

  console.log('━'.repeat(60));
  const primaryCount = await prisma.godHead.count({ where: { domain: { contains: '[Prime Party · PRIMARY]' } } });
  console.log(`Prime Party tagged: ${primaryCount} primary godheads`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
