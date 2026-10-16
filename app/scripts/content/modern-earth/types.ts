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
 *   (2× magic). Item KV = its PRICE in KRMA (ruling 2026-10-16; see
 *   ItemTemplate.kv) — damage/resist/abilities no longer sum into it.
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

/** A NAMED thing those years put in the bearer's hands (block grant, rulings
 *  2026-08-24/25 #13; priced in the block at its own KV). `name` is a stock
 *  item archetype where one fits — genesis pulls it free and paints it. */
export interface PossessionGrant {
  name: string;
  description: string;
  kv: number;
  unpackNote?: string;
}

/** The MATERIAL lines of a block (Mike ruling 2026-10-16): named grants at
 *  their own KV, and ACCUMULATED WEALTH — a KRMA number INSIDE the block's
 *  TKV for everything those years left the bearer that is not named (home,
 *  wardrobe, pots and pans, the junk drawer); Σ over a character's blocks is
 *  genesis's budget to build her material life; the remainder becomes cash
 *  in a campaign currency. Both compete with attributes for the TKV. */
export interface MaterialLines {
  possessions?: PossessionGrant[];
  accumulatedWealth?: number;
}

export interface RootTemplate extends MaterialLines {
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

export interface BranchTemplate extends MaterialLines {
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
  /** KV IS THE PRICE in KRMA (Mike ruling 2026-10-16): graded by real
   *  modern-US retail price RELATIVE to the anchor — a three-seat couch
   *  (~$300) = 2 KV, i.e. the stock catalog's internal scale is ~$150/KV.
   *  Fractional (sub-1 KRMA items allowed), 3 significant figures. There is
   *  NO fixed dollar rate — each table calculates its own currency rate; this
   *  scale only keeps global stock consistent relative to itself. Ability
   *  KVs stay on the abilities; this total stays coherent with price. */
  kv: number;
  /** The item's own bulk in cubic feet (what it takes up inside a holder). */
  volumeCuFt?: number;
  /** For things that HOLD things (storage furniture, appliances, bags, boxes,
   *  cases, vehicles, buildings): interior volume in cubic feet… */
  capacityCuFt?: number;
  /** …and the load it can bear in lbs. Placement refuses over-capacity. */
  capacityLbs?: number;
  tags?: string[];
  /** Multi-component possessions (vehicles/buildings, Mike ruling
   *  2026-08-04): components nested per the body-comp contains chain. */
  contains?: ItemTemplate[];
}
