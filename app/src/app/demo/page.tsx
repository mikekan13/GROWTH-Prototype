import CharacterSheet from '@/components/character/CharacterSheet';
import type { GrowthCharacter } from '@/types/growth';

const DEMO_CHARACTER: GrowthCharacter = {
  identity: {
    name: 'Kael Ashenmire',
    age: 34,
    fatedAge: 62,
    background: 'A traveling apothecary haunted by visions of a burning city',
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
    { name: 'Herbalism', level: 12, isCombat: false, description: 'Identify and prepare botanical remedies' },
    { name: 'Short Blade', level: 7, isCombat: true },
    { name: 'Persuasion', level: 5, isCombat: false },
    { name: 'Occult Lore', level: 9, isCombat: false },
  ],
  magic: {
    mercy: { schools: ['Restoration'], knownSpells: [{ name: 'Mend Flesh', school: 'Restoration', description: 'Heal minor wounds through touch', cost: 3 }] },
    severity: { schools: ['Dissolution'], knownSpells: [{ name: 'Unravel', school: 'Dissolution', description: 'Break down material bonds', cost: 5 }] },
    balance: { schools: [], knownSpells: [] },
  },
  traits: [
    { name: 'Fiend Sight', category: 'supernatural', description: 'See in complete darkness, eyes glow faintly amber', type: 'nectar' },
    { name: 'Ambitious', category: 'natural', description: '+1 GRO.vine capacity', type: 'nectar' },
    { name: 'Healing Hands', category: 'magic', description: '+2 to Restoration spell rolls this session', type: 'blossom' },
    { name: 'Mark of the Magistrate', category: 'social', description: 'Recognized and distrusted in Velthane', type: 'thorn' },
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
  ],
  fears: [
    { name: 'Fire', description: 'The burning visions have made all flame terrifying', resistanceLevel: 7, status: 'active' },
    { name: 'Abandonment', description: 'Everyone leaves eventually', resistanceLevel: 4, status: 'aligned' },
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
  },
  inventory: {
    weight: 12,
    items: [
      { name: 'Apothecary Kit', weightLevel: 3, condition: 3, techLevel: 2 },
      { name: 'Obsidian Blade', weightLevel: 2, condition: 4, techLevel: 3, description: 'Short blade with dissolution runes' },
      { name: 'Dried Starbloom (x5)', weightLevel: 1, condition: 4, techLevel: 1, quantity: 5 },
    ],
  },
  notes: 'Last session: Encountered a merchant selling maps to the Ashwood. Spent 3 KRMA on information.',
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
