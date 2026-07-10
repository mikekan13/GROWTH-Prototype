/**
 * Seed test Seed/Root/Branch ForgeItems so character creation can run end-to-end.
 *
 * Creates (idempotent — skipped if same name+type already exists in the campaign):
 *
 *   Seed:
 *     - Human          (d6 fate die, 80yr lifespan, baseResist 4)
 *
 *   Roots (4):
 *     - Wanderer       (well-traveled — survival/navigation/streetwise)
 *     - Highborn       (raised in privilege — etiquette/finance/diplomacy)
 *     - Scholar        (book-learned — research/lore/medicine)
 *     - Tradesperson   (craft apprenticeship — craft/appraise/labor)
 *
 *   Branches (8 — 2 per root):
 *     - Wanderer      → First Blood    (martial life event)
 *     - Wanderer      → Lost Years     (wilderness survival arc)
 *     - Highborn      → Court Intrigue (political polish)
 *     - Highborn      → Disinherited   (fall from grace)
 *     - Scholar       → Field Research (academic + practical)
 *     - Scholar       → Heretical Text (forbidden knowledge)
 *     - Tradesperson  → Master Crafter (guild apprenticeship completed)
 *     - Tradesperson  → Black Market   (off-the-books work)
 *
 * Run: npx tsx scripts/seed-test-srb.ts
 */

import { config } from 'dotenv';
config();

import { prisma } from '../src/lib/db';
import { PRIME_CAMPAIGN_NAME } from '../src/lib/prime-campaign';

type AttrBlock = {
  clout: number; celerity: number; constitution: number;
  focus: number; flow: number;
  willpower: number; wisdom: number; wit: number;
};

const ZERO_ATTRS: AttrBlock = {
  clout: 0, celerity: 0, constitution: 0,
  focus: 0, flow: 0,
  willpower: 0, wisdom: 0, wit: 0,
};

async function upsertForgeItem(
  campaignId: string,
  createdBy: string,
  type: 'seed' | 'root' | 'branch',
  name: string,
  data: Record<string, unknown>,
) {
  const existing = await prisma.forgeItem.findFirst({
    where: { campaignId, type, name },
  });
  if (existing) {
    if (existing.status !== 'published') {
      await prisma.forgeItem.update({
        where: { id: existing.id },
        data: { status: 'published', data: JSON.stringify(data) },
      });
      console.log(`↑ ${type} "${name}" promoted to published + data refreshed`);
    } else {
      console.log(`= ${type} "${name}" already published`);
    }
    return existing;
  }
  const created = await prisma.forgeItem.create({
    data: {
      name,
      type,
      status: 'published',
      campaignId,
      data: JSON.stringify(data),
      createdBy,
    },
  });
  console.log(`+ Created ${type} "${name}" (id: ${created.id})`);
  return created;
}

async function main() {
  const campaignName = process.env.SEED_CAMPAIGN_NAME;
  const campaign = await prisma.campaign.findFirst({
    where: campaignName ? { name: campaignName } : { name: { not: PRIME_CAMPAIGN_NAME } },
    orderBy: { createdAt: 'asc' },
    include: { gmUser: true },
  });
  if (!campaign) {
    console.log('No non-Prime campaigns found. Run seed-test-data.ts first.');
    return;
  }
  console.log(`Campaign: ${campaign.name} (${campaign.id})\n`);

  // ── Seed: Human ───────────────────────────────────────────────────────
  await upsertForgeItem(campaign.id, campaign.gmUserId, 'seed', 'Human', {
    description:
      'The default humanoid baseline — adaptable, mortal, with a knack for invention. ' +
      'No racial gifts, no inherent thorns; the canvas on which every story can be painted.',
    baseFateDie: 'd6',
    frequency: 6,
    fatedAge: 80,
    baseResist: 4,
    attributes: { ...ZERO_ATTRS },
    skills: [],
    nectars: ['Adaptable'],
    thorns: [],
  });

  // ── Roots ─────────────────────────────────────────────────────────────
  await upsertForgeItem(campaign.id, campaign.gmUserId, 'root', 'Wanderer', {
    description:
      'You came of age on the road — never a fixed roof, never a guaranteed meal. ' +
      'You learned the world by walking it.',
    frequency: 0,
    ageAdded: 16,
    attributes: { ...ZERO_ATTRS, celerity: 2, constitution: 2, focus: 1, flow: 1, willpower: 1, wisdom: 1, wit: 1 },
    skills: [
      { name: 'Survival', level: 4, governors: ['constitution'] },
      { name: 'Navigation', level: 4, governors: ['wit'] },
      { name: 'Streetwise', level: 4, governors: ['wit'] },
    ],
    nectars: [],
    thorns: [],
    seedRequirement: '',
  });

  await upsertForgeItem(campaign.id, campaign.gmUserId, 'root', 'Highborn', {
    description:
      'Born into wealth and obligation — silk on the skin, expectation on the shoulders. ' +
      'You learned the rules of the salon before you learned the rules of the street.',
    frequency: 0,
    ageAdded: 16,
    attributes: { ...ZERO_ATTRS, clout: 1, focus: 2, willpower: 2, wisdom: 2, wit: 1 },
    skills: [
      { name: 'Etiquette', level: 4, governors: ['wisdom'] },
      { name: 'Finance', level: 4, governors: ['wit'] },
      { name: 'Diplomacy', level: 4, governors: ['willpower'] },
    ],
    nectars: ['Bearing'],
    thorns: [],
    seedRequirement: '',
  });

  await upsertForgeItem(campaign.id, campaign.gmUserId, 'root', 'Scholar', {
    description:
      'You spent your formative years among books, mentors, and arguments held in candle-lit halls. ' +
      'The world makes sense as a system to be parsed.',
    frequency: 0,
    ageAdded: 16,
    attributes: { ...ZERO_ATTRS, focus: 3, willpower: 1, wisdom: 2, wit: 3 },
    skills: [
      { name: 'Research', level: 4, governors: ['wit'] },
      { name: 'Lore', level: 4, governors: ['wisdom'] },
      { name: 'Medicine', level: 4, governors: ['focus'] },
    ],
    nectars: [],
    thorns: ['Bookish'],
    seedRequirement: '',
  });

  await upsertForgeItem(campaign.id, campaign.gmUserId, 'root', 'Tradesperson', {
    description:
      'You learned an honest craft — long hours, sore hands, the satisfaction of the made thing. ' +
      'Guild dues paid, master\'s mark earned.',
    frequency: 0,
    ageAdded: 18,
    attributes: { ...ZERO_ATTRS, clout: 2, celerity: 1, constitution: 2, focus: 2, wit: 2 },
    skills: [
      { name: 'Craft', level: 4, governors: ['focus'] },
      { name: 'Appraise', level: 4, governors: ['wit'] },
      { name: 'Labor', level: 4, governors: ['constitution'] },
    ],
    nectars: ['Steady Hands'],
    thorns: [],
    seedRequirement: '',
  });

  // ── Branches ──────────────────────────────────────────────────────────
  await upsertForgeItem(campaign.id, campaign.gmUserId, 'branch', 'First Blood', {
    description:
      'You drew steel and felt it return wet. The first kill — sanctioned or not — left a mark you carry.',
    frequency: 0,
    ageAdded: 2,
    attributes: { ...ZERO_ATTRS, clout: 2, celerity: 1, constitution: 1, focus: 1, willpower: 1 },
    skills: [
      { name: 'Melee Combat', level: 4, governors: ['clout'] },
      { name: 'Intimidation', level: 4, governors: ['clout'] },
    ],
    nectars: [],
    thorns: ['Haunted'],
    requirements: 'Root: Wanderer',
  });

  await upsertForgeItem(campaign.id, campaign.gmUserId, 'branch', 'Lost Years', {
    description:
      'A long stretch off the maps — months, maybe more — where civilization was a story you told yourself. ' +
      'You came back with hard eyes.',
    frequency: 0,
    ageAdded: 3,
    attributes: { ...ZERO_ATTRS, celerity: 1, constitution: 2, focus: 1, wisdom: 1, wit: 1 },
    skills: [
      { name: 'Stealth', level: 4, governors: ['celerity'] },
      { name: 'Hunting', level: 4, governors: ['focus'] },
    ],
    nectars: ['Hardened'],
    thorns: [],
    requirements: 'Root: Wanderer',
  });

  await upsertForgeItem(campaign.id, campaign.gmUserId, 'branch', 'Court Intrigue', {
    description:
      'You navigated a season of court politics — alliances kept, secrets traded, knives kept sheathed by the slimmest margin.',
    frequency: 0,
    ageAdded: 2,
    attributes: { ...ZERO_ATTRS, focus: 1, willpower: 2, wisdom: 2, wit: 2 },
    skills: [
      { name: 'Deception', level: 4, governors: ['wit'] },
      { name: 'Insight', level: 4, governors: ['wisdom'] },
    ],
    nectars: ['Silver Tongue'],
    thorns: [],
    requirements: 'Root: Highborn',
  });

  await upsertForgeItem(campaign.id, campaign.gmUserId, 'branch', 'Disinherited', {
    description:
      'The family doors closed. Title revoked, allowance cut, name still ringing in your ears. You learned to do without.',
    frequency: 0,
    ageAdded: 3,
    attributes: { ...ZERO_ATTRS, celerity: 1, constitution: 1, focus: 1, willpower: 2, wit: 1 },
    skills: [
      { name: 'Streetwise', level: 4, governors: ['wit'] },
      { name: 'Disguise', level: 4, governors: ['celerity'] },
    ],
    nectars: [],
    thorns: ['Bitter'],
    requirements: 'Root: Highborn',
  });

  await upsertForgeItem(campaign.id, campaign.gmUserId, 'branch', 'Field Research', {
    description:
      'You took the work out of the library — to the marsh, the ruin, the bedside. The hands learned what the page could only describe.',
    frequency: 0,
    ageAdded: 3,
    attributes: { ...ZERO_ATTRS, constitution: 1, focus: 2, wisdom: 1, wit: 2 },
    skills: [
      { name: 'Investigation', level: 4, governors: ['wit'] },
      { name: 'Herbalism', level: 4, governors: ['focus'] },
    ],
    nectars: ['Methodical'],
    thorns: [],
    requirements: 'Root: Scholar',
  });

  await upsertForgeItem(campaign.id, campaign.gmUserId, 'branch', 'Heretical Text', {
    description:
      'You read what you shouldn\'t have. The seal was broken, the page turned. Some things, once known, cannot be put back.',
    frequency: 0,
    ageAdded: 2,
    attributes: { ...ZERO_ATTRS, focus: 2, willpower: 2, wisdom: 2 },
    skills: [
      { name: 'Forbidden Lore', level: 4, governors: ['willpower'] },
      { name: 'Cipher', level: 4, governors: ['focus'] },
    ],
    nectars: ['Forbidden Insight'],
    thorns: ['Marked'],
    requirements: 'Root: Scholar',
  });

  await upsertForgeItem(campaign.id, campaign.gmUserId, 'branch', 'Master Crafter', {
    description:
      'The guild placed the master\'s mark on your work. Apprentices defer to your eye; commissions arrive unsolicited.',
    frequency: 0,
    ageAdded: 4,
    attributes: { ...ZERO_ATTRS, clout: 1, focus: 3, willpower: 1, wit: 1 },
    skills: [
      { name: 'Master Craft', level: 4, governors: ['focus'] },
      { name: 'Teach', level: 4, governors: ['wisdom'] },
    ],
    nectars: ['Reputable'],
    thorns: [],
    requirements: 'Root: Tradesperson',
  });

  await upsertForgeItem(campaign.id, campaign.gmUserId, 'branch', 'Black Market', {
    description:
      'You learned which goods don\'t pass through the front gate, which buyers don\'t ask questions, and which lies hold up to a customs inspection.',
    frequency: 0,
    ageAdded: 3,
    attributes: { ...ZERO_ATTRS, celerity: 1, focus: 1, willpower: 1, wit: 2 },
    skills: [
      { name: 'Smuggling', level: 4, governors: ['celerity'] },
      { name: 'Forgery', level: 4, governors: ['focus'] },
    ],
    nectars: [],
    thorns: ['Wanted'],
    requirements: 'Root: Tradesperson',
  });

  console.log('\nDone. Seeds + 4 roots + 8 branches published in the campaign Forge.');
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
