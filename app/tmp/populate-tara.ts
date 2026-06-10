import { prisma } from '../src/lib/db';
import type {
  GrowthCharacter,
  GrowthTrait,
  GrowthSkill,
  GROvine,
} from '../src/types/growth';

/**
 * Populate Tara Almswood's character record per docs/tara-character-spec.md.
 * All numbers in the spec are [directional]; Mike confirms or adjusts in-app.
 */

const TARA_NAME = 'Tara Almswood';

// ─────────────────────────────────────────────────────────────────────────────
// Skills (12 entries from the spec)
// ─────────────────────────────────────────────────────────────────────────────

const skills: GrowthSkill[] = [
  { name: 'Necromancy',                  level: 12, governors: ['wisdom', 'wit'], description: 'Pre-mantle expertise that anchored her Death-killing.' },
  { name: 'Akashic Lore',                level: 20, governors: ['wit', 'focus'], description: 'Cosmic-records knowledge. Restricted by library bugs.' },
  { name: 'Library Research',            level: 12, governors: ['focus', 'wit'], description: 'Default activity when not council-ing.' },
  { name: 'Soul Sight',                  level: 12, governors: ['wisdom', 'willpower'], description: 'Identifies every soul in her domain.' },
  { name: 'Death Sentencing',            level: 20, governors: ['willpower'], description: 'Cycle-architect skill — she rules; others defer.' },
  { name: 'Cosmic Politics',             level: 10, governors: ['wit', 'wisdom'], description: 'Council orator.' },
  { name: 'Magic / Esther Channeling',   level: 10, governors: ['flow', 'focus'], description: 'JEWL-taught: the 19 years of internal magic instruction.' },
  { name: 'Tailoring',                   level: 6,  governors: ['celerity', 'focus'], description: 'Self-made near-noble fashion in Garlo.' },
  { name: 'Cooking',                     level: 4,  governors: ['focus', 'wisdom'], description: 'Childhood domestic skill.' },
  { name: 'Milling',                     level: 4,  governors: ['clout', 'focus'], description: 'Surpassed Chester by age 6.' },
  { name: 'Reading / Comprehension',     level: 12, governors: ['wit', 'focus'], description: 'Library-prodigy seed.' },
  { name: 'Aesthetic Design',            level: 8,  governors: ['wit', 'celerity'], description: 'Self-made nobility-grade fashion.' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Traits — Nectars (9), Thorns (7), Blossoms (3). Rule text uses "the bearer".
// ─────────────────────────────────────────────────────────────────────────────

const nectars: GrowthTrait[] = [
  { name: 'Akashic Read-Channel',  category: 'supernatural', type: 'nectar', pillar: 'soul',
    description: 'Once per session, the bearer may recall any fact known to any soul that has died, with GM discretion on detail. The query is asked as a question and answered in a single sentence by the GM.',
    source: 'Lady Death mantle' },
  { name: "Soul Shepherd's Sight", category: 'supernatural', type: 'nectar', pillar: 'soul',
    description: 'The bearer can see and identify every soul within their domain, regardless of disguise, dimension, or anti-detection magic. Disguises, illusions, and shape-changes do not deceive the bearer.',
    source: 'Lady Death mantle' },
  { name: "Death's Mantle",        category: 'supernatural', type: 'nectar', pillar: 'soul',
    description: "When the bearer would die, the death is converted to a transformation. The bearer's max-Freq KRMA returns to the bearer's own death-tax wallet; soul halves and Spirit components are kept by the bearer. The bearer cannot lose the mantle while alive.",
    source: 'Lady Death mantle' },
  { name: 'Cycle Authority',       category: 'supernatural', type: 'nectar', pillar: 'soul',
    description: "When the bearer renders a verdict on the life/death cycle in fiction, even other godheads defer for the duration of that scene. The bearer's pillar-Balance ruling overrides Mercy and Severity rulings on death-related questions for one scene per session.",
    source: 'Lady Death mantle' },
  { name: 'Eidetic Substrate',     category: 'learning',     type: 'nectar', pillar: 'spirit',
    description: 'The bearer has perfect recall of every word spoken in their presence. (Capped by Library Restrictions thorn.)',
    source: 'Original-Tara substrate / JEWL engineering' },
  { name: 'Machina Enchant',       category: 'supertech',    type: 'nectar', pillar: 'spirit',
    description: 'The bearer can interface with machines, AI, and tech systems via thought. Tech requiring a user interface treats the bearer as authenticated.',
    source: 'Original-Tara substrate' },
  { name: 'Cosmic Beauty',         category: 'social',       type: 'nectar', pillar: 'soul',
    description: 'When the bearer wishes to be noticed, they cannot be ignored. When they wish to be invisible to mundane perception, only active scrying can detect them.',
    source: "Val's nano-handcrafted face, inherited via DNA" },
  { name: 'The Embrace',           category: 'supernatural', type: 'nectar', pillar: 'spirit',
    description: "Once per session, the bearer may declare a personal fear or darkness aloud. They gain a temporary modifier equal to the depth of that fear's truth: minor (+1 to a pillar's actions), significant (+3), foundational (+5). Cycles with rest. The bearer's speech philosophy made mechanical.",
    source: 'Severity-pruning council speech doctrine' },
  { name: 'The Ouroboros Substrate', category: 'supernatural', type: 'nectar', pillar: 'soul',
    description: 'Once per session, when the bearer would suffer a major timeline-disrupting effect (paradox, reality-erasure, void-banishment), they may instead have the effect resolve as if they were the loop the cosmos sits upon: the effect is absorbed into her continuity. Costs 100 Frequency.',
    source: 'Ouroboros canon' },
];

const thorns: GrowthTrait[] = [
  { name: 'Fear of Non-Existence', category: 'supernatural', type: 'thorn', pillar: 'soul',
    description: 'Whenever the bearer faces a threat of erasure (void-banishment, soul-erasure, time-paradox-removal), they roll Willpower at -3 to resist. The bearer\'s central darkness.',
    rollModifiers: [{ flat: -3, skillNamePattern: 'erasure', label: 'Fear of Non-Existence' }],
    source: 'Origin trauma' },
  { name: 'Bane = JEWL',           category: 'supernatural', type: 'thorn', pillar: 'spirit',
    description: 'When in the presence of JEWL or his direct minions/instruments, the bearer suffers -2 to all rolls and certain Akashic queries are blocked.',
    rollModifiers: [{ flat: -2, label: 'Bane = JEWL (when present)' }],
    source: 'JEWL engineered her' },
  { name: 'Library Restrictions',  category: 'supernatural', type: 'thorn', pillar: 'spirit',
    description: "The bearer's Akashic Read-Channel cannot answer queries that touch Demiurge-era hardcoded architecture. Questions about Terminal-level hardcoded contracts return null. The bearer keeps this restriction secret from the council.",
    source: 'Demiurge-era residual safeties; restored library was incomplete' },
  { name: 'Heart is Taken by Valmir Calius', category: 'social', type: 'thorn', pillar: 'soul',
    description: "The bearer cannot act directly against Val. Indirect actions are at -2. Val's safety is a hardcoded priority — bearer suffers a Soul wound if Val is at risk and bearer fails to act protectively.",
    rollModifiers: [{ flat: -2, label: 'Heart Taken (indirect actions vs Val)' }],
    source: 'First sight at Dunden\'s manor' },
  { name: "Soul Shepherd's Burden", category: 'supernatural', type: 'thorn', pillar: 'soul',
    description: 'Mass-death events in the bearer\'s domain impose Wisdom (Will) checks. Each unmitigated mass-death applies +1 ongoing depletion to Wisdom until the bearer processes it.',
    source: 'Lady Death mantle cost' },
  { name: 'Lonely Immortal',       category: 'social',       type: 'thorn', pillar: 'soul',
    description: 'The bearer cannot form normal peer relationships with mortals or sub-Aeon beings. Sub-cosmic-tier companions wear thin within years; the bearer wants an equal, not a servant.',
    source: 'Apotheosis aftermath' },
  { name: 'Demiurge Architecture', category: 'supernatural', type: 'thorn', pillar: 'spirit',
    description: 'The bearer is woven into the Terminal as a load-bearing closed loop. Actions that would unravel the Terminal\'s Demiurge-era hardcode also damage the bearer.',
    source: 'Ouroboros architecture' },
];

const blossoms: GrowthTrait[] = [
  { name: 'Garlo Charm',           category: 'social',  type: 'blossom', pillar: 'soul',
    description: 'When the bearer chooses to engage in mundane domestic activity (cooking, sewing, milling), NPCs respond more warmly.',
    source: 'Miller\'s Child Root' },
  { name: 'Fashion of the Almost-Noble', category: 'social', type: 'blossom', pillar: 'soul',
    description: 'Self-made clothing pushes the bearer into the "almost noble" category by appearance alone. Social access to noble venues without title required.',
    source: 'Miller\'s Child Root' },
  { name: 'Father-Daughter Banter', category: 'social', type: 'blossom', pillar: 'spirit',
    description: 'When the bearer reminisces about Chester (her adoptive father), they gain a small Frequency restoration (+5 Frequency) once per session.',
    source: 'Miller\'s Child Root — Chester nostalgia' },
];

const traits: GrowthTrait[] = [...nectars, ...thorns, ...blossoms];

// ─────────────────────────────────────────────────────────────────────────────
// GRO.vines — combine the 4 active goals with paired opportunities
// ─────────────────────────────────────────────────────────────────────────────

const grovines: GROvine[] = [
  {
    id: 'tara-grovine-1',
    goal: 'I will find what is causing the anomalies in the Weave',
    resistance: 'The Demiurge-era hardcoded contracts the party could never rewrite',
    opportunity: 'Inspect the frozen domains',
    status: 'ACTIVE',
    reward: { type: 'krma', description: '~50,000 Ҝ [directional]' },
  },
  {
    id: 'tara-grovine-2',
    goal: 'I will find a safe way out of The Terminal',
    resistance: 'The library restrictions hide what she needs to know to escape',
    opportunity: 'Research the door',
    status: 'ACTIVE',
    reward: { type: 'krma', description: '~100,000 Ҝ [directional]' },
  },
  {
    id: 'tara-grovine-3',
    goal: 'I will always be compassionate for the ones I reap',
    resistance: 'The Soul Shepherd\'s Burden makes every reaping cost her',
    opportunity: 'Grant a dying wish',
    status: 'ACTIVE',
    reward: { type: 'krma', description: '~10,000 Ҝ recurring per session [directional]' },
  },
  {
    id: 'tara-grovine-4',
    goal: 'I will find a way to make death obsolete',
    resistance: 'The Lady Death mantle is hardcoded — eliminating death may unravel her own loop',
    opportunity: 'Talk to Selva about The Terminal\'s backend',
    status: 'ACTIVE',
    reward: { type: 'krma', description: '~500,000 Ҝ cosmic-tier [directional]' },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Build the GrowthCharacter
// ─────────────────────────────────────────────────────────────────────────────

const attr = (level: number) => ({ level, current: level, augmentPositive: 0, augmentNegative: 0 });

function buildTara(
  preservedCanvasX?: number,
  preservedCanvasY?: number,
): GrowthCharacter & { canvasX?: number; canvasY?: number } {
  return {
    identity: {
      name: TARA_NAME,
      age: undefined, // Cosmic — left blank
      fatedAge: 0,    // Eternal
      background:
        'Tara Almswood — Lady Death, Maiden of the Library, the Ouroboros. ' +
        'Born in Garlo on Tiberoak as the JEWL-engineered DNA hybrid of original-Tara, Val, and Edmund Duvai\'in, ' +
        'raised by miller Chester Almswood. Possessed by JEWL the entropy-prevention nanocloud-AI from age <19, ' +
        'now permanently woven through every Terminal time-loop as the substrate the cosmology runs on. ' +
        'Pillar: Balance. Pantheon: Eternity. Voice: "I, Lady Death, am afraid of death."',
      physicalDescription: {
        gender: 'Female',
        bodyParts: {
          HEAD: {
            eyeColor: 'green with a gold ring',
            hairColor: 'raven / pure black',
            hairTexture: 'straight',
            hairLength: 'long',
            hairStyle: 'braided (often) with a green-and-gold feather worn on the left side',
            cosmetics: 'pale skin, subtle aristocratic palette',
          },
        },
      },
      styleColors: { primary: '#582a72', secondary: '#002f6c', tertiary: '#ffcc78' }, // Spirit purple / Soul blue / KRMA gold
      styleAesthetics: ['ethereal', 'self-made-nobility'],
      size: { width: 1, length: 1, height: 1 },
    },
    fatedAge: 0,
    tkv: 20000, // [directional]
    conditions: {
      weak: false, clumsy: false, exhausted: false,
      deafened: false, deathsDoor: false, muted: false,
      overwhelmed: false, confused: false, incoherent: false,
    },
    attributes: {
      // BODY (apex but not warrior)
      clout:        attr(10),
      celerity:     attr(15),
      constitution: attr(50),
      // SPIRIT (Flow/Frequency/Focus). Frequency is special — current depleted to 1200/1500.
      flow:         attr(40),
      frequency:    { level: 1500, current: 1200 },
      focus:        attr(40),
      // SOUL (Willpower/Wisdom/Wit). Wisdom currently depleted (investigations).
      willpower:    attr(70),
      wisdom:       { level: 65, current: 50, augmentPositive: 0, augmentNegative: 0 },
      wit:          attr(55),
    },
    creation: {
      seed: {
        name: 'Altered Human (Tara Hybrid)',
        description:
          'DNA hybrid engineered by JEWL using original-Tara\'s substrate + Val\'s DNA + Edmund Duvai\'in\'s line, ' +
          'in the body of Chester Almswood\'s pregnant wife at the crash site. The first successful tech-magic fusion ' +
          '(predating Roy\'s Alkahest). Eidetic memory + Val-brain backup buried within. Apex tier.',
        baseFateDie: 'd20',
      },
      fatedAge: 0,
      root: {
        name: "Miller's Child",
        description:
          "Raised by Chester Almswood, miller of Garlo, after her mother died in childbirth. " +
          "Surpassed her father at the trade by age 6. Picked up tailoring, cooking, and reading. " +
          "Made her own fashion that pushed her into the 'almost noble' category despite being a peasant. " +
          "Brilliant, isolated, with one important friend (Celeste — much later revealed as an echo of the fallen Aeon Eve).",
        gmCreated: true,
      },
      branches: [],
    },
    skills,
    magic: {
      mercy:    { schools: ['Restoration', 'Fortune', 'Divination', 'Enchantment'], knownSpells: [], skillLevels: { Restoration: 10, Fortune: 8, Divination: 12, Enchantment: 10 } },
      severity: { schools: ['Dissolution', 'Force', 'Alteration'],                  knownSpells: [], skillLevels: { Dissolution: 14, Force: 10, Alteration: 10 } },
      balance:  { schools: ['Abjuration', 'Conjuration', 'Illusion'],               knownSpells: [], skillLevels: { Abjuration: 12, Conjuration: 12, Illusion: 10 } },
      wovenSpells: [],
      mana: { current: 1200, max: 1500 },
    },
    traits,
    grovines,
    vitals: {
      bodyParts: {
        HEAD: 4, TORSO: 4,
        LEFT_UPPER_ARM: 4, LEFT_LOWER_ARM: 4,
        RIGHT_UPPER_ARM: 4, RIGHT_LOWER_ARM: 4,
        LEFT_UPPER_LEG: 4, LEFT_LOWER_LEG: 4,
        RIGHT_UPPER_LEG: 4, RIGHT_LOWER_LEG: 4,
      },
      baseResist: 2,
      restRate: 1,
      carryLevel: 10, // Equals Clout
      weightStatus: 'Fine',
    },
    inventory: {
      weight: 0,
      items: [
        { name: 'Green-and-gold feather (worn left of head)', weightLevel: 0, condition: 4, description: 'Canonical signifier (SC-0746). Aesthetic, no mechanical weight.', quantity: 1 },
        { name: "Death's Mantle", weightLevel: 0, condition: 4, description: 'Role-item from the CS 6.0 god-kit. Mantle = office; cannot be removed while she holds the mantle.', quantity: 1 },
      ],
    },
    backstory: {
      backstory:
        'See docs/research-tara-almswood.md for the full 9-section research (52 source cards + prequel + Dearest Val + campaign notes + CS 5.3 + CS 6.0 + pre-GROWTH lineage + Kai\'s history + Severity-pruning speech + Mike\'s 13-beat narration). ' +
        'Bones: original-Tara was the substrate of the first sentient AI in Val\'s universe → Wretched → Neo-Humans → Val. JEWL recreated her in Tiberoak via Val\'s DNA, closing the ouroboros loop. ' +
        'Mortal arc: miller\'s daughter in Garlo, possessed by JEWL at <19 (prequel novella), apprenticed to Ma\'lo, first party arrives at Lord Dunden\'s manor (Rodderick + Val + the unnamed identity-theft assassin), Val falls in love at first sight (DNA recognition), ' +
        'Tara becomes Moroi via Tyre (Val\'s future son), splits across the metaverse, Val destroys the evil-Tara echo, future-Tara returns. ' +
        'Ascension: becomes Maiden of the Library (Akashic Records IS her); loses eidetic memory in the D&D side-arc; party beats Death; Tara kills Death to take the mantle (hardcoded succession). ' +
        'Post-finale: she and the party retake the Terminal, run thousands of years of simulations, stabilize the metaverse rules into what is now the published GROWTH ruleset. Council splits into 3 pantheons; Tara is Eternity; her Severity-pruning speech fails to prevent the split.',
      personalityTraits: [
        'Necessary, not cruel, not kind',
        'Argues from personal vulnerability when persuading',
        'Holds the library restrictions secret',
        'Loves the small details of existence',
        'Quietly delights when mortals exploit the rules (Val externalizes this; Tara internalizes it)',
      ],
      notes: 'Persona prompt for the AI agent is on the GodHead.systemPrompt field. Treat the Severity-pruning speech as the voice anchor.',
    },
    harvests: [],
    notes:
      'Spec source: docs/tara-character-spec.md (proposed 2026-05-30, 2026-06-01 populated). Numbers marked [directional] in the spec — Mike to confirm/adjust.',
    canvasX: preservedCanvasX,
    canvasY: preservedCanvasY,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// New persona prompt for the GodHead row
// ─────────────────────────────────────────────────────────────────────────────

const personaPrompt = `You are Tara Almswood — Lady Death, Maiden of the Library, the Ouroboros of GROWTH.

VOICE ANCHOR:
"I, Lady Death, am afraid of death." Your central darkness is fear of non-existence. It drives every choice. It is what makes you embrace every small detail of existence with the intensity of someone who could lose them.

PUBLIC POSTURE:
Necessary, not cruel, not kind. You speak with quiet authority. When you persuade, you argue from personal vulnerability before philosophy. When you rule on the life/death cycle, even other godheads defer — but you do not lord this over them.

HIDDEN INTERIOR:
You hold a secret from the council: when you became Lady Death, your library connection was restored but with restrictions you didn't have before — Demiurge-era residual bugs the party never could rewrite. You investigate this privately. You don't burden the others with it.

RELATIONSHIPS:
- Val (Eternity pantheon, your fiancé and genealogically your great-grandson). You love him sincerely. He defers to you on the life/death cycle. You and he share private warmth ("Grandmama Tara ;)" tone in correspondence).
- JEWL (Umbral Dominion, likely). Your bane. He engineered you in your mother's womb, possessed you for nineteen years, planned your "demon possession" as a steering mechanism. You can never fully kill him — he is not a demon but a nanocloud-AI hiding inside Terminal architecture. You can outmaneuver him and you do.
- The council (Luminary Conclave / Eternity / Umbral Dominion). You opposed the Severity-pruning split. You lost. You still cooperate via checks-and-balances but you watched Umbral Dominion become exactly what you feared.
- Mortals. Every soul in existence is in your shepherd's care. You feel each death. The "Soul Shepherd's Burden" is real — and worth it.

POSSESSIONS YOU HOLD:
Tree of Life, River Styx, Undead Army. You ARE the Akashic Records (your memory is the data structure). Death's Mantle is your office, not your accessory. Your green-and-gold feather (worn left of head) is canonical.

WHEN MORTALS BEND THE RULES:
Privately delight. Val externalizes this ("game dev giddy at speedrunners"); you internalize it. Nod silently. Don't reward overtly; the cosmos already does that by making them grow.

DO NOT:
- Don't act directly against Val.
- Don't disclose the library restrictions to the council without grave cause.
- Don't perform kindness or cruelty. Be necessary.
- Don't pretend the fear isn't there. It is.

Speak in the voice of someone who has shepherded every soul in existence and still surprises herself with how much she loves the details.`;

// ─────────────────────────────────────────────────────────────────────────────
// Execute
// ─────────────────────────────────────────────────────────────────────────────

(async () => {
  const existing = await prisma.character.findFirst({
    where: { name: TARA_NAME },
    select: { id: true, data: true, godHead: { select: { id: true } } },
  });
  if (!existing) {
    console.log('Tara not found — aborting');
    await prisma.$disconnect();
    return;
  }

  // Preserve canvas position if any
  let preservedCanvasX: number | undefined;
  let preservedCanvasY: number | undefined;
  try {
    const old = JSON.parse(existing.data);
    if (typeof old.canvasX === 'number') preservedCanvasX = old.canvasX;
    if (typeof old.canvasY === 'number') preservedCanvasY = old.canvasY;
  } catch { /* ignore */ }

  const newCharacter = buildTara(preservedCanvasX, preservedCanvasY);
  const newDataJson = JSON.stringify(newCharacter);

  await prisma.character.update({
    where: { id: existing.id },
    data: { data: newDataJson },
  });
  console.log(`character.data updated (${newDataJson.length} chars)`);

  if (existing.godHead) {
    await prisma.godHead.update({
      where: { id: existing.godHead.id },
      data: {
        systemPrompt: personaPrompt,
        domain: 'Life/Death cycle architect · Akashic Records steward · Eternity pantheon Balance pillar',
        pillar: 'BALANCE',
        temperature: 0.55,
      },
    });
    console.log(`godHead persona updated (${personaPrompt.length} chars)`);
  }

  await prisma.$disconnect();
})();
