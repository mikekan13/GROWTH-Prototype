import CharacterSheet from '@/components/character/CharacterSheet';
import type { GrowthCharacter } from '@/types/growth';

const DEMO_CHARACTER: GrowthCharacter = {
  identity: {
    name: 'Kael Ashenmire',
    age: 34,
    fatedAge: 62,
    background: 'A traveling apothecary haunted by visions of a burning city',
    description: 'Tall and lean with angular features. Dark hair streaked prematurely silver at the temples. Eyes shift between deep brown and faint amber when his fiend heritage surfaces. Wears a worn leather longcoat over layered traveling clothes, pockets stuffed with dried herbs and glass vials. A faint smell of starbloom and char follows him.',
  },
  levels: {
    wealthLevel: 5,
    techLevel: 3,
    healthLevel: 6,
  },
  tkv: 47,
  conditions: {
    weak: false,
    clumsy: false,
    exhausted: false,
    deafened: false,
    deathsDoor: false,
    muted: false,
    overwhelmed: false,
    confused: false,
    incoherent: false,
  },
  attributes: {
    clout: { level: 4, current: 4, augmentPositive: 1, augmentNegative: 0 },
    celerity: { level: 6, current: 3, augmentPositive: 0, augmentNegative: 0 },
    constitution: { level: 5, current: 5, augmentPositive: 0, augmentNegative: 1 },
    flow: { level: 8, current: 6, augmentPositive: 2, augmentNegative: 0 },
    frequency: { level: 12, current: 9 },
    focus: { level: 7, current: 7, augmentPositive: 0, augmentNegative: 0 },
    willpower: { level: 6, current: 2, augmentPositive: 0, augmentNegative: 0 },
    wisdom: { level: 9, current: 9, augmentPositive: 1, augmentNegative: 0 },
    wit: { level: 5, current: 5, augmentPositive: 0, augmentNegative: 0 },
  },
  creation: {
    seed: {
      name: 'Cambion',
      description: 'Half-human, half-fiend. Caught between worlds.',
      baseFateDie: 'd8',
    },
    root: {
      name: 'Street Apothecary',
      description: 'Learned herbalism in the back alleys of Velthane',
      gmCreated: true,
    },
    branches: [
      { name: 'The Burning Vision', description: 'Recurring nightmares of a city consumed by flame', gmCreated: true, order: 1 },
      { name: 'Exile from Velthane', description: 'Accused of poisoning the Magistrate', gmCreated: true, order: 2 },
    ],
  },
  skills: [
    { name: 'Herbalism', level: 12, isCombat: false, category: 'sciences', description: 'Identify and prepare botanical remedies' },
    { name: 'Short Blade', level: 7, isCombat: true, category: 'martial' },
    { name: 'Persuasion', level: 5, isCombat: false, category: 'social' },
    { name: 'Occult Lore', level: 9, isCombat: false, category: 'sciences', description: 'Knowledge of supernatural phenomena and fiend heritage' },
    { name: 'Alchemy', level: 10, isCombat: false, category: 'crafting', description: 'Transmutation and potion brewing' },
    { name: 'Stealth', level: 4, isCombat: false, category: 'athletics' },
    { name: 'Dodge', level: 6, isCombat: true, category: 'martial' },
    { name: 'Intimidation', level: 3, isCombat: false, category: 'social', description: 'The fiend eyes help' },
    { name: 'Environmental Awareness', level: 8, isCombat: false, category: 'perception' },
    { name: 'Medicine', level: 11, isCombat: false, category: 'sciences', description: 'Diagnosis and treatment of illness and injury' },
  ],
  magic: {
    mercy: {
      schools: ['Restoration', 'Fortune'],
      knownSpells: [
        { name: 'Mend Flesh', school: 'Restoration', description: 'Heal minor wounds through touch. Flesh knits together under golden light.', cost: 3, strength: 4, castingMethod: 'weaving' },
        { name: 'Purge Toxin', school: 'Restoration', description: 'Neutralize poisons and disease within a living body.', cost: 5, strength: 6, castingMethod: 'weaving' },
        { name: 'Lucky Break', school: 'Fortune', description: 'Nudge probability in a target\'s favor for their next action.', cost: 2, strength: 3, castingMethod: 'weaving' },
      ],
      skillLevels: { Restoration: 8, Fortune: 4 },
    },
    severity: {
      schools: ['Dissolution', 'Force'],
      knownSpells: [
        { name: 'Unravel', school: 'Dissolution', description: 'Break down material bonds at the molecular level. Objects crumble to dust.', cost: 5, strength: 5, castingMethod: 'weaving' },
        { name: 'Soultap', school: 'Dissolution', description: 'Drain mana from a willing or weakened target. Dangerous. Addictive.', cost: 1, strength: 7, castingMethod: 'wild' },
        { name: 'Kinetic Push', school: 'Force', description: 'A focused blast of raw kinetic energy.', cost: 3, strength: 4, castingMethod: 'wild' },
      ],
      skillLevels: { Dissolution: 6, Force: 3 },
    },
    balance: {
      schools: ['Divination', 'Abjuration'],
      knownSpells: [
        { name: 'Foresight Pulse', school: 'Divination', description: 'Brief flash of near-future danger. Grants +2 to next defensive action.', cost: 4, strength: 5, castingMethod: 'weaving' },
        { name: 'Ward of Denial', school: 'Abjuration', description: 'Invisible barrier that blocks the next incoming magical effect.', cost: 6, strength: 6, castingMethod: 'weaving' },
      ],
      skillLevels: { Divination: 5, Abjuration: 4 },
    },
    wovenSpells: [
      {
        name: 'Phoenix Salve',
        schools: ['Restoration', 'Dissolution'],
        description: 'Destroy dead/necrotic tissue and regenerate healthy flesh in its place. Painful but effective for wounds conventional healing cannot touch.',
        cost: 8,
        strength: 7,
        components: 'Fresh starbloom petal, drop of caster\'s blood',
      },
      {
        name: 'Probability Shield',
        schools: ['Fortune', 'Abjuration'],
        description: 'Weave luck and warding together. Attacks against the target have their rolls reduced by the spell\'s strength.',
        cost: 6,
        strength: 5,
      },
    ],
    mana: {
      current: 14,
      max: 22,
    },
  },
  traits: [
    { name: 'Fiend Sight', category: 'supernatural', description: 'See in complete darkness. Eyes glow faintly amber when active.', type: 'nectar', source: 'Cambion Seed', mechanicalEffect: 'Darkvision 60ft, glowing eyes (noticeable in dim light)' },
    { name: 'Ambitious', category: 'natural', description: 'Driven by an insatiable need to prove worth.', type: 'nectar', source: 'Human Heritage', mechanicalEffect: '+1 GRO.vine capacity' },
    { name: 'Apothecary\'s Intuition', category: 'learning', description: 'Instinctive sense for herbal properties and interactions.', type: 'nectar', source: 'Completed: Master Velthane Pharmacopoeia', mechanicalEffect: '+2 Herbalism when identifying unknown substances' },
    { name: 'Healing Hands', category: 'magic', description: 'Temporarily heightened connection to Mercy magic from a Godhead\'s blessing.', type: 'blossom', source: 'Godhead: Et\'herling', mechanicalEffect: '+2 to Restoration spell rolls this session' },
    { name: 'Firewalker\'s Grace', category: 'supernatural', description: 'Brief resistance to heat and flame, bestowed after facing the vision.', type: 'blossom', source: 'Godhead: Valmir Calius', mechanicalEffect: 'Fire resistance for 3 encounters' },
    { name: 'Mark of the Magistrate', category: 'social', description: 'Branded as a poisoner in Velthane. Recognized and distrusted by anyone from the city.', type: 'thorn', source: 'Failed: Clear name before exile', mechanicalEffect: '-3 to all Social skills in Velthane or with Velthane natives' },
    { name: 'Fiend Hunger', category: 'supernatural', description: 'The dissolution magic feeds something dark. Each use makes the next easier to justify.', type: 'thorn', source: 'Cambion Seed', mechanicalEffect: 'After using Dissolution 3+ times per session, WIL check DR 6 or seek another use' },
  ],
  grovines: [
    {
      id: 'gv-1',
      goal: 'Discover the source of the burning visions',
      resistance: 'The visions worsen with each clue found',
      opportunity: 'An ancient library in Thornwall may hold answers',
      status: 'active',
    },
    {
      id: 'gv-2',
      goal: 'Clear name of the poisoning accusation',
      resistance: 'The true poisoner is protected by the new Magistrate',
      opportunity: 'A former guard captain believes in innocence',
      status: 'active',
    },
    {
      id: 'gv-3',
      goal: 'Master the Dissolution school',
      resistance: 'Dissolution magic draws on fiend heritage — each use risks control',
      opportunity: 'A hermit dissolution mage lives in the Ashwood',
      status: 'active',
    },
    {
      id: 'gv-4',
      goal: 'Develop the Phoenix Salve into a reliable technique',
      resistance: 'The woven spell is unstable and requires rare components',
      opportunity: 'The Thornwall library may contain pre-Fracture weaving texts',
      status: 'active',
    },
  ],
  fears: [
    { name: 'Fire', description: 'The burning visions have made all flame terrifying. Even a candle triggers a flinch.', resistanceLevel: 7, status: 'active' },
    { name: 'Abandonment', description: 'Everyone leaves eventually. Trust is a liability.', resistanceLevel: 4, status: 'aligned', hiddenPower: 'When truly alone, gains +2 to all Soul attributes for 1 scene (the isolation sharpens focus)' },
  ],
  vitals: {
    bodyParts: {
      HEAD: 0, NECK: 0, TORSO: 2,
      RIGHTARM: 0, LEFTARM: 1,
      RIGHTUPPERLEG: 0, LEFTUPPERLEG: 0,
      RIGHTLOWERLEG: 0, LEFTLOWERLEG: 0,
    },
    baseResist: 2,
    restRate: 3,
    carryLevel: 4,
    weightStatus: 'Fine',
    equipment: {
      body: [],
      clothing: [
        {
          name: 'Linen Undershirt',
          layer: 'clothing',
          material: 'Linen',
          resistance: 1,
          condition: 3,
          weight: 1,
          properties: ['Breathable'],
        },
        {
          name: 'Leather Longcoat',
          layer: 'clothing',
          material: 'Leather',
          resistance: 3,
          condition: 3,
          weight: 4,
          properties: ['Pocketed', 'Weather-Resistant'],
          coveredParts: ['TORSO', 'RIGHTARM', 'LEFTARM', 'RIGHTUPPERLEG', 'LEFTUPPERLEG'],
        },
      ],
      lightArmor: [
        {
          name: 'Reinforced Vest',
          layer: 'lightArmor',
          material: 'Studded Leather',
          resistance: 5,
          condition: 4,
          weight: 6,
          properties: ['Concealed Pockets'],
          coveredParts: ['TORSO'],
        },
      ],
      heavyArmor: [],
    },
  },
  inventory: {
    weight: 12,
    items: [
      { name: 'Apothecary Kit', weightLevel: 3, condition: 3, techLevel: 2, description: 'Complete field kit with mortar, pestle, and 20+ reagent vials' },
      { name: 'Obsidian Blade', weightLevel: 2, condition: 4, techLevel: 3, description: 'Short blade with dissolution runes etched along the fuller' },
      { name: 'Dried Starbloom', weightLevel: 1, condition: 4, techLevel: 1, quantity: 5, description: 'Key component for Phoenix Salve' },
      { name: 'Thornwall Library Pass', weightLevel: 0, condition: 4, techLevel: 1, description: 'Temporary access granted by Scholar Maren' },
      { name: 'Fire-Warding Charm', weightLevel: 1, condition: 2, techLevel: 2, description: 'Cracked abjuration focus. Barely functional.' },
      { name: 'Journal of Symptoms', weightLevel: 1, condition: 3, techLevel: 1, description: 'Kael\'s personal log of the burning visions — dates, triggers, intensity' },
    ],
  },
  backstory: {
    description: 'Tall and lean with angular features. Dark hair streaked prematurely silver at the temples. Eyes shift between deep brown and faint amber when his fiend heritage surfaces. Wears a worn leather longcoat over layered traveling clothes, pockets stuffed with dried herbs and glass vials. A faint smell of starbloom and char follows him.',
    backstory: 'Born to a human mother in the slums of Velthane, Kael never knew his fiend father. His mother died of plague when he was twelve, and he survived by apprenticing to a back-alley apothecary named Seren. Seren taught him herbalism, medicine, and the dangerous art of Dissolution magic — "the power to take things apart so you can understand how they go together."\n\nAt twenty-six, the burning visions began. A city on fire. Always the same city, always from the same vantage point — standing on a hill, watching. He doesn\'t recognize the city. No one does.\n\nThree years ago, Velthane\'s Magistrate was poisoned with ashveil extract — a compound Kael had recently purchased in quantity for legitimate research. The evidence was circumstantial but damning. Seren testified against him to save her own skin. Kael fled.\n\nNow he travels, selling remedies and seeking answers. The visions are getting worse. And the dissolution magic... it\'s getting easier. That scares him more than the fire.',
    personalityTraits: [
      'Cautious but not cowardly',
      'Dry, self-deprecating humor',
      'Compulsive note-taker',
      'Uncomfortable with gratitude',
    ],
    values: [
      'Knowledge — Understanding the world makes it less frightening',
      'Self-reliance — The only person you can count on',
      'Craft — A well-made remedy is honest work',
    ],
    addictions: [
      'Control — Micromanages situations to prevent surprises',
      'Isolation — Pushes people away before they can leave',
      'The Work — Buries emotions in research and crafting',
    ],
    notes: 'GM notes: Kael\'s fiend father is connected to the burning visions. The city is Tiberoak before the Fracture. Seren is still alive and regretful. The Magistrate was actually poisoned by his own wife.',
  },
  harvests: [
    {
      id: 'h-1',
      name: 'Winter in the Ashwood',
      description: 'Three months studying under Maegren the hermit dissolution mage.',
      activity: 'Daily practice sessions with dissolution magic. Learned to control the fiend hunger through meditation techniques Maegren developed. Also foraged rare winter herbs.',
      duration: '3 months',
      rewards: [
        { type: 'skill', description: 'Dissolution +2 (now level 6)' },
        { type: 'nectar', description: 'Considered: "Cold Focus" — ability to suppress fiend hunger for 1 scene' },
        { type: 'equipment', description: 'Obsidian Blade (gift from Maegren)' },
      ],
      cost: 'Aged 3 months. Used 4 KRMA for training.',
      status: 'completed',
    },
    {
      id: 'h-2',
      name: 'Thornwall Research Period',
      description: 'Access to the ancient library to study pre-Fracture weaving texts.',
      activity: 'Researching the origins of woven spells, specifically the combination of Restoration and Dissolution. Also investigating references to "burning prophecies" in historical records.',
      duration: '1 month (ongoing)',
      rewards: [
        { type: 'skill', description: 'Occult Lore +1 (if successful)' },
        { type: 'other', description: 'Possible clue about the burning visions' },
      ],
      status: 'active',
    },
  ],
  notes: 'Last session: Encountered a merchant selling maps to the Ashwood. Spent 3 KRMA on information. The merchant recognized the burning city description — called it "the Tiberoak prophecy." Need to follow up.',
};

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-[var(--surface-calm)] p-8">
      <div className="max-w-3xl mx-auto mb-6">
        <span className="terminal-badge">
          dEmO mOdE — sAmPLe cHaRaCTeR
        </span>
      </div>
      <CharacterSheet character={DEMO_CHARACTER} />
    </div>
  );
}
