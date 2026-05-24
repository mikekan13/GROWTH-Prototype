/**
 * Seed Beta Content — minimum viable canonical content library so a new GM
 * can open a campaign and pull from a published library without authoring
 * everything from scratch.
 *
 * Adds to the global catalog (campaignId=null, isGlobal=true, published):
 *   - Seeds (4): Elven, Dwarven, Halfling, Cambion
 *   - Roots (2 — additional to seed-test-srb.ts's 4): Wayfarer, Devoted
 *   - Nectars (12): mix across body/spirit/soul, with rollModifiers + prose
 *   - Thorns (12): mix across body/spirit/soul, mostly negative rollModifiers
 *   - Items (4): Iron Longsword, Wooden Shield, Lantern, Healing Draught
 *
 * Design guardrails:
 *   - Per memory `nectar-thorn-rule-text-bearer-agnostic`: rule text uses
 *     "the bearer" — never a seed name.
 *   - Per memory `exploits-must-be-easy-to-track`: binary triggers, no
 *     mid-combat percentages.
 *   - Per memory `negatives-only-in-thorns-liens`: Thorns may carry small
 *     numeric penalties (rollModifiers flat < 0). No "rebate" mechanics.
 *   - Per memory `weight-system-stripped-actual-lbs`: items use actual lbs.
 *   - Per memory `skill-tiers-start-at-d4`: nothing grants skills above d4
 *     at creation.
 *
 * Status: published as beta-draft. Flag-block-rework flow can later refine
 * any of these without touching existing characters' KV.
 *
 * Idempotent — skips items already present in global catalog by (type, name).
 *
 * Run: npx tsx scripts/seed-beta-content.ts
 */

import { config } from 'dotenv';
config();

import { prisma } from '../src/lib/db';

// ── KV helpers (mirror lib/kv-calculator constants) ─────────────────────

const KV_PER_ATTR_AUG = 1;
const FATE_DIE_KV: Record<string, number> = { d4: 5, d6: 10, d8: 20, d12: 40, d20: 80 };
const KV_PER_BODY_RESIST = 2;

function seedKV(opts: { baseResist: number; baseFateDie: keyof typeof FATE_DIE_KV; attrSum: number }): number {
  return opts.attrSum * KV_PER_ATTR_AUG
    + opts.baseResist * KV_PER_BODY_RESIST
    + (FATE_DIE_KV[opts.baseFateDie] ?? 10);
}

// ── Upsert helper ────────────────────────────────────────────────────────

async function upsertGlobalItem(opts: {
  type: string;
  name: string;
  data: Record<string, unknown>;
  karmicValue?: bigint;
  adminId: string;
}): Promise<{ id: string; status: 'created' | 'existed' }> {
  const existing = await prisma.forgeItem.findFirst({
    where: { campaignId: null, type: opts.type, name: opts.name },
    select: { id: true },
  });
  if (existing) return { id: existing.id, status: 'existed' };

  const item = await prisma.forgeItem.create({
    data: {
      type: opts.type,
      name: opts.name,
      data: JSON.stringify(opts.data),
      status: 'published',
      campaignId: null,
      isGlobal: true,
      createdBy: opts.adminId,
      authorUserId: opts.adminId,
      karmicValue: opts.karmicValue,
    },
    select: { id: true },
  });
  return { id: item.id, status: 'created' };
}

// ── Seed data ────────────────────────────────────────────────────────────

interface SeedTemplate {
  name: string;
  description: string;
  baseFateDie: 'd4' | 'd6' | 'd8' | 'd12' | 'd20';
  frequency: number;
  fatedAge: number;
  baseResist: number;
  attributes: {
    clout: number; celerity: number; constitution: number;
    focus: number; flow: number;
    willpower: number; wisdom: number; wit: number;
  };
  /** Names of seed-paired Nectars (also created below). Bearer-agnostic text. */
  seedNectars: string[];
  /** Names of seed-paired Thorns. */
  seedThorns: string[];
  betaDraft: true;
}

const SEEDS: SeedTemplate[] = [
  {
    name: 'Elven',
    description: 'Long-lived stewards of the slow-burning world. Time moves differently for them; patience is a weapon and a vice.',
    baseFateDie: 'd8',
    frequency: 5,
    fatedAge: 500,
    baseResist: 3,
    attributes: { clout: 0, celerity: 2, constitution: 0, focus: 1, flow: 2, willpower: 0, wisdom: 3, wit: 1 },
    seedNectars: ['Centuries of Watch'],
    seedThorns: ['Time Drift'],
    betaDraft: true,
  },
  {
    name: 'Dwarven',
    description: 'Mountain-bred — kin to stone, kiln, and the long memory of grudges. Slow to bend, harder to break.',
    baseFateDie: 'd6',
    frequency: 4,
    fatedAge: 250,
    baseResist: 5,
    attributes: { clout: 2, celerity: 0, constitution: 3, focus: 1, flow: 0, willpower: 2, wisdom: 1, wit: 0 },
    seedNectars: ['Stoneheart'],
    seedThorns: ['Grudge-Bound'],
    betaDraft: true,
  },
  {
    name: 'Halfling',
    description: 'Small in stature, vast in conviction. Slip through narrow places — both literal and figurative.',
    baseFateDie: 'd6',
    frequency: 4,
    fatedAge: 110,
    baseResist: 2,
    attributes: { clout: -1, celerity: 3, constitution: 1, focus: 0, flow: 1, willpower: 1, wisdom: 1, wit: 2 },
    seedNectars: ['Underfoot'],
    seedThorns: ['Reach Failed'],
    betaDraft: true,
  },
  {
    name: 'Cambion',
    description: 'Half-Et\'herling, half-mortal. Born straddling two worlds, beholden to neither — and trusted by neither.',
    baseFateDie: 'd8',
    frequency: 6,
    fatedAge: 200,
    baseResist: 2,
    attributes: { clout: 1, celerity: 1, constitution: 0, focus: 2, flow: 0, willpower: 2, wisdom: 0, wit: 2 },
    seedNectars: ['Otherborn'],
    seedThorns: ['Unbelonging'],
    betaDraft: true,
  },
];

// ── Roots (2 additional to seed-test-srb.ts's 4) ─────────────────────────

interface RootTemplate {
  name: string;
  description: string;
  attributeBoosts: Record<string, number>;
  startingSkills: Array<{ name: string; level: number; governors: string[]; description?: string }>;
  betaDraft: true;
}

const ROOTS: RootTemplate[] = [
  {
    name: 'Wayfarer',
    description: 'Walked the open roads. Knows the language of inns, the patience of long horizons, the cost of a thin coat in the wind.',
    attributeBoosts: { celerity: 1, constitution: 1, wisdom: 1 },
    startingSkills: [
      { name: 'Survival', level: 2, governors: ['constitution', 'wisdom'], description: 'Find food, water, shelter in the wild.' },
      { name: 'Streetwise', level: 1, governors: ['wit', 'wisdom'], description: 'Read a town\'s tempo before the second drink lands.' },
      { name: 'Horsemanship', level: 1, governors: ['celerity', 'willpower'] },
    ],
    betaDraft: true,
  },
  {
    name: 'Devoted',
    description: 'Trained in a shrine, monastery, or order. Discipline of body and mind under a vow that still holds — for now.',
    attributeBoosts: { willpower: 1, wisdom: 1, focus: 1 },
    startingSkills: [
      { name: 'Meditation', level: 2, governors: ['willpower', 'focus'], description: 'Recover composure under duress; quiet the mind.' },
      { name: 'Theology', level: 2, governors: ['wisdom', 'wit'], description: 'Doctrine, lore of the divine, the names of saints and devils.' },
      { name: 'Resolve', level: 1, governors: ['willpower'], description: 'Hold a position against pressure, persuasion, or pain.' },
    ],
    betaDraft: true,
  },
];

// ── Nectars (12 standalone + 4 seed-paired) ─────────────────────────────

interface TraitTemplate {
  name: string;
  type: 'nectar' | 'thorn';
  pillar: 'body' | 'spirit' | 'soul';
  description: string;
  mechanicalEffect: string;
  category: 'combat' | 'learning' | 'magic' | 'social' | 'utility' | 'supernatural' | 'supertech' | 'natural';
  rollModifiers?: Array<{ flat: number; skillNamePattern?: string; governorAttribute?: string; label?: string }>;
  betaDraft: true;
}

const NECTARS: TraitTemplate[] = [
  // Seed-paired
  {
    name: 'Centuries of Watch',
    type: 'nectar',
    pillar: 'soul',
    category: 'learning',
    description: 'The bearer has watched empires rise and fall and learned not to flinch.',
    mechanicalEffect: 'Once per session, declare a contested check resolved before dice are rolled — the bearer takes the average result. Cannot be used on death-saves.',
    rollModifiers: [{ flat: 1, governorAttribute: 'wisdom', label: 'Centuries of Watch' }],
    betaDraft: true,
  },
  {
    name: 'Stoneheart',
    type: 'nectar',
    pillar: 'body',
    category: 'combat',
    description: 'The bearer\'s ribs remember every blow that didn\'t finish them.',
    mechanicalEffect: 'The bearer ignores the first depleted Constitution condition each scene. Body Resist +1 against blunt damage.',
    rollModifiers: [{ flat: 1, governorAttribute: 'constitution', label: 'Stoneheart' }],
    betaDraft: true,
  },
  {
    name: 'Underfoot',
    type: 'nectar',
    pillar: 'body',
    category: 'utility',
    description: 'The bearer slips through spaces larger creatures cannot.',
    mechanicalEffect: 'Squeeze through any gap a head could fit through without a check. Stealth checks against larger creatures gain +2.',
    rollModifiers: [{ flat: 2, skillNamePattern: 'stealth', label: 'Underfoot' }],
    betaDraft: true,
  },
  {
    name: 'Otherborn',
    type: 'nectar',
    pillar: 'spirit',
    category: 'supernatural',
    description: 'Reality bends a little around the bearer\'s edges — those who look too long see something other.',
    mechanicalEffect: 'Once per scene, force a re-roll on any check that targeted the bearer\'s identity, mind, or recognition. The new result stands.',
    rollModifiers: [{ flat: 1, governorAttribute: 'focus', label: 'Otherborn' }],
    betaDraft: true,
  },
  // Standalone
  {
    name: 'Iron Wind',
    type: 'nectar',
    pillar: 'body',
    category: 'combat',
    description: 'The bearer\'s arm carries weight beyond the bone.',
    mechanicalEffect: 'Melee weapon hits deal +1 damage on rolls that beat DR by 5 or more.',
    rollModifiers: [{ flat: 1, governorAttribute: 'clout', label: 'Iron Wind' }],
    betaDraft: true,
  },
  {
    name: 'Quicksilver',
    type: 'nectar',
    pillar: 'body',
    category: 'combat',
    description: 'Faster than the situation deserves.',
    mechanicalEffect: 'Once per scene, the bearer may act before initiative order is established.',
    rollModifiers: [{ flat: 2, governorAttribute: 'celerity', label: 'Quicksilver' }],
    betaDraft: true,
  },
  {
    name: 'Quiet Mind',
    type: 'nectar',
    pillar: 'spirit',
    category: 'magic',
    description: 'The bearer does not flinch when the world hums wrong.',
    mechanicalEffect: 'Casting checks ignore the first Wit-depleted condition each scene. Resist fear by 1 step.',
    rollModifiers: [{ flat: 1, governorAttribute: 'focus', label: 'Quiet Mind' }],
    betaDraft: true,
  },
  {
    name: 'Open Hand',
    type: 'nectar',
    pillar: 'spirit',
    category: 'magic',
    description: 'Mercy magic flows easier through the bearer.',
    mechanicalEffect: 'Restoration spells cast by the bearer recover +1 point of the targeted pillar.',
    rollModifiers: [{ flat: 1, skillNamePattern: 'mercy', label: 'Open Hand' }],
    betaDraft: true,
  },
  {
    name: 'Cold Reading',
    type: 'nectar',
    pillar: 'soul',
    category: 'social',
    description: 'Faces and voices give the bearer more than they intend.',
    mechanicalEffect: 'Insight checks vs. deception gain +2. Once per scene, ask the GM "is this person lying?" — the GM answers truthfully.',
    rollModifiers: [
      { flat: 2, skillNamePattern: 'insight', label: 'Cold Reading' },
      { flat: 2, skillNamePattern: 'sense motive', label: 'Cold Reading' },
    ],
    betaDraft: true,
  },
  {
    name: 'Quick Tongue',
    type: 'nectar',
    pillar: 'soul',
    category: 'social',
    description: 'Words arrive before the bearer thinks them — usually the right ones.',
    mechanicalEffect: 'Persuasion checks under time pressure (combat, chase, ticking deadline) ignore that pressure\'s penalty.',
    rollModifiers: [{ flat: 1, skillNamePattern: 'persuasion', label: 'Quick Tongue' }],
    betaDraft: true,
  },
  {
    name: 'Hearth Memory',
    type: 'nectar',
    pillar: 'soul',
    category: 'learning',
    description: 'The bearer recalls perfectly any place they have slept the night.',
    mechanicalEffect: 'Once per scene, ask the GM one detail about a place the bearer has spent a night — the GM answers truthfully.',
    betaDraft: true,
  },
  {
    name: 'Bone-Reader',
    type: 'nectar',
    pillar: 'spirit',
    category: 'supernatural',
    description: 'The dead murmur to the bearer if asked politely.',
    mechanicalEffect: 'Ten minutes alone with a corpse: the bearer learns one true thing about its final hour. Cost: 1 Frequency (deplete).',
    rollModifiers: [{ flat: 1, governorAttribute: 'flow', label: 'Bone-Reader' }],
    betaDraft: true,
  },
  {
    name: 'Hard Footing',
    type: 'nectar',
    pillar: 'body',
    category: 'natural',
    description: 'The bearer keeps their feet where others slip.',
    mechanicalEffect: 'Cannot be involuntarily moved (knocked prone, pushed, swept) without a contested check at +3 in the bearer\'s favor.',
    rollModifiers: [{ flat: 1, governorAttribute: 'constitution', label: 'Hard Footing' }],
    betaDraft: true,
  },
  {
    name: 'Spectacle',
    type: 'nectar',
    pillar: 'soul',
    category: 'social',
    description: 'The bearer commands the room without trying.',
    mechanicalEffect: 'When the bearer enters a scene, every NPC present must orient on them for at least one round before acting on prior intent.',
    rollModifiers: [{ flat: 1, governorAttribute: 'wit', label: 'Spectacle' }],
    betaDraft: true,
  },
  {
    name: 'Keen Hand',
    type: 'nectar',
    pillar: 'body',
    category: 'utility',
    description: 'The bearer\'s fingers know what the bearer\'s eyes haven\'t seen yet.',
    mechanicalEffect: 'Sleight-of-hand and lockpicking checks ignore time-pressure penalties.',
    rollModifiers: [
      { flat: 1, skillNamePattern: 'sleight', label: 'Keen Hand' },
      { flat: 1, skillNamePattern: 'lockpick', label: 'Keen Hand' },
    ],
    betaDraft: true,
  },
  {
    name: "Witness's Eye",
    type: 'nectar',
    pillar: 'soul',
    category: 'learning',
    description: 'The bearer remembers what they\'ve seen, exactly.',
    mechanicalEffect: 'Perfectly recall any scene the bearer was present for. Once per session, ask the GM "what was on the table?" or similar.',
    rollModifiers: [{ flat: 2, skillNamePattern: 'investigation', label: "Witness's Eye" }],
    betaDraft: true,
  },
];

// ── Thorns (12 standalone + 4 seed-paired) ──────────────────────────────

const THORNS: TraitTemplate[] = [
  // Seed-paired
  {
    name: 'Time Drift',
    type: 'thorn',
    pillar: 'soul',
    category: 'natural',
    description: 'The bearer measures urgency in seasons. Their tempo is wrong for fast company.',
    mechanicalEffect: 'On the first round of any combat encounter, the bearer acts last regardless of initiative.',
    rollModifiers: [{ flat: -1, skillNamePattern: 'initiative', label: 'Time Drift' }],
    betaDraft: true,
  },
  {
    name: 'Grudge-Bound',
    type: 'thorn',
    pillar: 'soul',
    category: 'social',
    description: 'The bearer keeps the ledger of wrongs in detail and at length.',
    mechanicalEffect: 'When dealing with an NPC who has previously wronged the bearer, all social checks suffer -2 until the wrong is settled.',
    rollModifiers: [{ flat: -2, skillNamePattern: 'persuasion', label: 'Grudge-Bound' }],
    betaDraft: true,
  },
  {
    name: 'Reach Failed',
    type: 'thorn',
    pillar: 'body',
    category: 'utility',
    description: 'High shelves, tall foes, long counters — the bearer pays the price.',
    mechanicalEffect: 'Reach-related actions (high shelves, tall mounts, two-handed weapons sized for larger frames) cost 1 extra Effort.',
    rollModifiers: [{ flat: -1, governorAttribute: 'clout', label: 'Reach Failed' }],
    betaDraft: true,
  },
  {
    name: 'Unbelonging',
    type: 'thorn',
    pillar: 'soul',
    category: 'social',
    description: 'Crowds make space around the bearer without thinking about it.',
    mechanicalEffect: 'First social check against any NPC the bearer has never met suffers -2.',
    rollModifiers: [{ flat: -2, skillNamePattern: 'persuasion', label: 'Unbelonging' }],
    betaDraft: true,
  },
  // Standalone
  {
    name: 'Glass Knees',
    type: 'thorn',
    pillar: 'body',
    category: 'natural',
    description: 'The bearer\'s joints have a memory of damage.',
    mechanicalEffect: 'Athletics checks involving sprinting, jumping, or climbing under stress suffer -1. After any combat, lose 1 Celerity current pool until rest.',
    rollModifiers: [{ flat: -1, skillNamePattern: 'athletics', label: 'Glass Knees' }],
    betaDraft: true,
  },
  {
    name: 'Bad Sleeper',
    type: 'thorn',
    pillar: 'spirit',
    category: 'natural',
    description: 'Rest does not come easily; the world stays loud inside the bearer\'s head.',
    mechanicalEffect: 'Long Rest restores 1 less Frequency than usual. Insight checks the morning after combat suffer -1.',
    rollModifiers: [{ flat: -1, governorAttribute: 'focus', label: 'Bad Sleeper' }],
    betaDraft: true,
  },
  {
    name: 'Cold Tongue',
    type: 'thorn',
    pillar: 'soul',
    category: 'social',
    description: 'Words don\'t arrive in time — and when they do, they arrive sharp.',
    mechanicalEffect: 'In any social scene where the bearer hasn\'t spoken first, subsequent Persuasion checks suffer -1.',
    rollModifiers: [{ flat: -1, skillNamePattern: 'persuasion', label: 'Cold Tongue' }],
    betaDraft: true,
  },
  {
    name: 'Loud Step',
    type: 'thorn',
    pillar: 'body',
    category: 'utility',
    description: 'The bearer cannot move quietly. Heels announce them.',
    mechanicalEffect: 'Stealth checks suffer -2. Bonus: Allies always know exactly where the bearer is.',
    rollModifiers: [{ flat: -2, skillNamePattern: 'stealth', label: 'Loud Step' }],
    betaDraft: true,
  },
  {
    name: 'Vow Bound',
    type: 'thorn',
    pillar: 'soul',
    category: 'social',
    description: 'The bearer holds an oath the world has not released them from.',
    mechanicalEffect: 'GM and player establish the vow at character creation. Violating it triggers a Willpower depletion equal to the vow\'s gravity (GM call).',
    betaDraft: true,
  },
  {
    name: 'Iron Stomach',
    type: 'thorn',
    pillar: 'body',
    category: 'natural',
    description: 'The bearer can eat anything — and frequently must.',
    mechanicalEffect: 'The bearer must eat twice the normal ration each day or suffer -1 Constitution current at next sunrise.',
    betaDraft: true,
  },
  {
    name: 'Hollow Wallet',
    type: 'thorn',
    pillar: 'spirit',
    category: 'social',
    description: 'Coin will not stay in the bearer\'s hands.',
    mechanicalEffect: 'At the start of each session, the bearer loses half of any liquid currency carried (GM\'s narrative explanation required).',
    betaDraft: true,
  },
  {
    name: 'Blind Spot',
    type: 'thorn',
    pillar: 'soul',
    category: 'natural',
    description: 'One category of person, place, or thing is invisible to the bearer\'s good judgement.',
    mechanicalEffect: 'Establish a category at character creation (e.g. children, beggars, scholars). Insight/perception checks against that category suffer -2.',
    rollModifiers: [{ flat: -2, governorAttribute: 'wisdom', label: 'Blind Spot' }],
    betaDraft: true,
  },
  {
    name: 'Owed',
    type: 'thorn',
    pillar: 'spirit',
    category: 'social',
    description: 'Someone, somewhere, is owed something. The bearer feels it always.',
    mechanicalEffect: 'GM and player establish the debt at character creation. Once per session, the GM may have the creditor (or their agent) interrupt a plan.',
    betaDraft: true,
  },
  {
    name: 'Open Book',
    type: 'thorn',
    pillar: 'soul',
    category: 'social',
    description: 'The bearer\'s emotions show on their face before they think them.',
    mechanicalEffect: 'Deception checks suffer -2. Insight checks made against the bearer succeed automatically on a non-critical roll.',
    rollModifiers: [{ flat: -2, skillNamePattern: 'deception', label: 'Open Book' }],
    betaDraft: true,
  },
  {
    name: 'Anvil Touch',
    type: 'thorn',
    pillar: 'body',
    category: 'natural',
    description: 'The bearer cannot do delicate work with their hands.',
    mechanicalEffect: 'Sleight-of-hand, lockpicking, fine craft, and surgery checks suffer -2.',
    rollModifiers: [
      { flat: -2, skillNamePattern: 'sleight', label: 'Anvil Touch' },
      { flat: -2, skillNamePattern: 'lockpick', label: 'Anvil Touch' },
      { flat: -2, skillNamePattern: 'craft', label: 'Anvil Touch' },
    ],
    betaDraft: true,
  },
];

// ── Items (4 sample items, lbs-based per weight-system-stripped) ────────

interface ItemTemplate {
  name: string;
  type: 'weapon' | 'armor' | 'tool' | 'consumable' | 'artifact';
  description: string;
  weight: number; // lbs
  rarity: number; // 1-10
  material: 'soft' | 'hard';
  data: Record<string, unknown>;
  betaDraft: true;
}

const ITEMS: ItemTemplate[] = [
  {
    name: 'Iron Longsword',
    type: 'weapon',
    description: 'A common adventurer\'s blade. Iron, well-balanced, replaceable.',
    weight: 3.5,
    rarity: 2,
    material: 'hard',
    data: {
      damage: { piercing: 1, slashing: 3, hard: 0, dynamic: 4, crushing: 1, blunt: 0, explosive: 0 },
      range: 'melee',
      targetAttribute: 'clout',
      twoHanded: false,
      properties: [],
    },
    betaDraft: true,
  },
  {
    name: 'Wooden Shield',
    type: 'armor',
    description: 'A round oak shield, banded with iron at the rim.',
    weight: 4,
    rarity: 1,
    material: 'hard',
    data: {
      layer: 'lightArmor',
      coverage: ['TORSO', 'LEFT_LOWER_ARM'],
      resistance: 2,
      properties: ['blockable'],
    },
    betaDraft: true,
  },
  {
    name: 'Lantern',
    type: 'tool',
    description: 'A shuttered oil lantern. Twelve-hour burn time on a full reservoir.',
    weight: 1.5,
    rarity: 1,
    material: 'hard',
    data: {
      illuminationRadius: 30,
      burnHours: 12,
    },
    betaDraft: true,
  },
  {
    name: 'Healing Draught',
    type: 'consumable',
    description: 'A bitter green tincture. Restores one Body pool when consumed.',
    weight: 0.25,
    rarity: 3,
    material: 'soft',
    data: {
      effect: 'restore',
      pillar: 'body',
      pointsRestored: 2,
      consumeAction: 'minor',
    },
    betaDraft: true,
  },
];

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!admin) throw new Error('No ADMIN user. Run seed-admin.ts first.');

  let created = 0;
  let skipped = 0;

  // Seeds
  console.log('\n━━━ Seeds ━━━');
  for (const s of SEEDS) {
    const attrSum = Object.values(s.attributes).reduce((sum, v) => sum + v, 0);
    const kv = seedKV({ baseResist: s.baseResist, baseFateDie: s.baseFateDie, attrSum });
    const data = {
      description: s.description,
      baseFateDie: s.baseFateDie,
      frequency: s.frequency,
      fatedAge: s.fatedAge,
      baseResist: s.baseResist,
      attributes: s.attributes,
      skills: [],
      nectars: s.seedNectars,
      thorns: s.seedThorns,
      betaDraft: s.betaDraft,
    };
    const r = await upsertGlobalItem({
      type: 'seed', name: s.name, data, karmicValue: BigInt(kv), adminId: admin.id,
    });
    if (r.status === 'created') { created++; console.log(`  ✔ ${s.name} (KV ${kv})`); }
    else { skipped++; console.log(`  = ${s.name} already exists`); }
  }

  // Roots
  console.log('\n━━━ Roots ━━━');
  for (const r of ROOTS) {
    const data = {
      description: r.description,
      attributes: r.attributeBoosts,
      skills: r.startingSkills,
      betaDraft: r.betaDraft,
    };
    const skillKV = r.startingSkills.reduce((sum, s) => sum + s.level, 0);
    const attrKV = Object.values(r.attributeBoosts).reduce((sum, v) => sum + v, 0);
    const result = await upsertGlobalItem({
      type: 'root', name: r.name, data, karmicValue: BigInt(skillKV + attrKV), adminId: admin.id,
    });
    if (result.status === 'created') { created++; console.log(`  ✔ ${r.name}`); }
    else { skipped++; console.log(`  = ${r.name} already exists`); }
  }

  // Nectars
  console.log('\n━━━ Nectars ━━━');
  for (const n of NECTARS) {
    const data = {
      description: n.description,
      mechanicalEffect: n.mechanicalEffect,
      pillar: n.pillar,
      category: n.category,
      rollModifiers: n.rollModifiers,
      betaDraft: n.betaDraft,
    };
    // Nectar KV roughly = sum of |flat| modifiers + 1 for the prose effect
    const baseFlat = (n.rollModifiers ?? []).reduce((s, m) => s + Math.abs(m.flat), 0);
    const kv = baseFlat + 1;
    const r = await upsertGlobalItem({
      type: 'nectar', name: n.name, data, karmicValue: BigInt(kv), adminId: admin.id,
    });
    if (r.status === 'created') { created++; console.log(`  ✔ ${n.name} (${n.pillar})`); }
    else { skipped++; console.log(`  = ${n.name} already exists`); }
  }

  // Thorns
  console.log('\n━━━ Thorns ━━━');
  for (const t of THORNS) {
    const data = {
      description: t.description,
      mechanicalEffect: t.mechanicalEffect,
      pillar: t.pillar,
      category: t.category,
      rollModifiers: t.rollModifiers,
      betaDraft: t.betaDraft,
    };
    // Thorn KV is symbolic — thorn carries lien value not raw KRMA worth
    const r = await upsertGlobalItem({
      type: 'thorn', name: t.name, data, karmicValue: BigInt(1), adminId: admin.id,
    });
    if (r.status === 'created') { created++; console.log(`  ✔ ${t.name} (${t.pillar})`); }
    else { skipped++; console.log(`  = ${t.name} already exists`); }
  }

  // Items
  console.log('\n━━━ Items ━━━');
  for (const i of ITEMS) {
    const data = {
      ...i.data,
      description: i.description,
      weight: i.weight,
      rarity: i.rarity,
      material: i.material,
      itemType: i.type,
      betaDraft: i.betaDraft,
    };
    const kv = i.rarity * 2; // crude: rarer items = more karmic mass
    const r = await upsertGlobalItem({
      type: 'item', name: i.name, data, karmicValue: BigInt(kv), adminId: admin.id,
    });
    if (r.status === 'created') { created++; console.log(`  ✔ ${i.name}`); }
    else { skipped++; console.log(`  = ${i.name} already exists`); }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Beta content seed complete — ${created} created, ${skipped} existed`);
  console.log(`All items flagged with betaDraft:true — Mike can flag-for-rework via Forge.`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
