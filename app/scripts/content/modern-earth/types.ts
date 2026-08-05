/**
 * Modern-Earth starter library — shared template types.
 *
 * Content law (memory: content-generation-balance-reference-2026-08-04):
 * - Traits are play-defining exploits, bearer-agnostic ("the bearer"),
 *   easy-to-track triggers (binary states, player-declared, pool-hits-0 —
 *   no percentages, no multi-scene bookkeeping).
 * - Every trait carries a pillar tag (body|spirit|soul) — drives death routing.
 * - Thorn KV is a LIEN (negative karmicValue; collected at death by the owning
 *   Godhead, default Lady Death) — never a creation refund.
 * - Short-term illnesses are negative BLOSSOMS, long-term conditions are
 *   THORNS (Mike ruling 2026-08-04). Mental-health and physical-disability
 *   thorns are legitimate content; maturity flags handle audience.
 * - Items use canonical GrowthWorldItem fields: real weightLbs, materialClass
 *   Soft|Hard, rarity 1-10, properties from ITEM_PROPERTIES, itemAbilities
 *   individually KV'd.
 * - KV anchors: +1 flat roll mod ≈ 5 KV; First-Born nectar = +50;
 *   Diminishing thorn = −200 (severe). Attribute/skill levels 1 KV each
 *   (2× magic). Item KV = material floor + damage (1:1 at natural ring
 *   targeting) + 2×resist + graded abilities.
 */

export type Pillar = 'body' | 'spirit' | 'soul';

export interface RollModifier {
  flat: number;
  skillNamePattern?: string;
  governorAttribute?: string;
  label?: string;
}

export interface TraitTemplate {
  name: string;
  type: 'nectar' | 'thorn' | 'blossom';
  pillar: Pillar;
  category: string;
  description: string;          // Flavor prose, bearer-agnostic, ≤500 chars
  mechanicalEffect: string;     // The exploit text, ≤300 chars, binary triggers
  rollModifiers?: RollModifier[];
  /** Signed KV: positive for nectars/positive blossoms; NEGATIVE for thorns
   *  (lien magnitude) and negative blossoms. Stored as ForgeItem.karmicValue. */
  kv: number;
  /** Free-form filter tags, e.g. 'mental-health', 'physical', 'illness'. */
  tags?: string[];
}

export interface SkillTemplate {
  name: string;
  governors: string[];          // from SKILL_GOVERNORS (8 attrs, no frequency)
  description: string;
}

export interface RootBranchSkillGrant {
  name: string;
  level: number;                // 1-3 flat, 4-5 d4, 6-7 d6, 8-11 d8 (soft cap ~10 creation)
}

export interface RootTemplate {
  name: string;
  description: string;
  /** Age the character reaches through this Root (max 25 canon). */
  age: number;
  attributes: {
    clout: number; celerity: number; constitution: number;
    focus: number; flow: number;
    willpower: number; wisdom: number; wit: number;
  };
  skills: RootBranchSkillGrant[];
  nectars: string[];            // names of traits defined in this library
  thorns: string[];
}

export interface BranchTemplate {
  name: string;
  description: string;
  /** Years this Branch adds to the character's age. */
  ageAdded: number;
  attributes: RootTemplate['attributes'];
  skills: RootBranchSkillGrant[];
  nectars: string[];
  thorns: string[];
  requirements: string;
}

export interface ItemAbilityTemplate {
  name: string;
  description: string;
  mechanicalEffect?: string;
  kv?: number;
}

export interface ItemTemplate {
  name: string;
  itemType: 'weapon' | 'armor' | 'accessory' | 'consumable' | 'tool' | 'artifact' | 'misc';
  description: string;
  primaryMaterial: string;
  subordinateMaterials?: string[];
  materialClass: 'Soft' | 'Hard';
  weightLbs: number;
  rarity: number;               // 1-10 canon scale
  baseResist?: number;          // 1-50 universal
  properties?: string[];        // from ITEM_PROPERTIES
  itemAbilities?: ItemAbilityTemplate[];
  // Weapon-only
  damage?: {
    piercing?: number; slashing?: number; heat?: number; decay?: number;
    cold?: number; bashing?: number; energy?: number;
  };
  range?: string;
  targetAttribute?: string;
  shots?: number;
  reload?: string;
  // Armor-only
  armorCategory?: 'Clothing' | 'Light' | 'Heavy';
  /** Graded total KV (material floor + damage + 2×resist + abilities). */
  kv: number;
  tags?: string[];
  /** Multi-component possessions (vehicles/buildings, Mike ruling
   *  2026-08-04): components nested per the body-comp contains chain. */
  contains?: ItemTemplate[];
}
