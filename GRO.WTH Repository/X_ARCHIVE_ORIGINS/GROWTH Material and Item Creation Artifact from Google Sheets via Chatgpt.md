# GROWTH Material and Item Creation System

## Overview

In the GROWTH RPG system, every item is crafted from one or more **materials**, and its properties are determined by those materials’ attributes. Each material has a durability rating (called **Resist**), a classification (Soft, Hard, or Either), and a set of special **modifiers** (“mods”) that define how it interacts with different damage types and conditions. When materials are combined to create an item, their properties (durability, mods, weight, value, etc.) interact to produce the item’s final statistics and behaviors. Items also have a **Tech Level** (the era or sophistication required to produce them), a **Weight** category (how heavy/encumbering it is), a **Value**, and condition levels for durability. The rules below ensure that both human players and AI systems (LLMs) can create or interpret items **consistently and balanced** within the GROWTH mechanics.

**For players:** This means the equipment in the game will behave predictably – e.g. metal armor is sturdier but heavier, a wooden shield can burn, a leather jerkin might soak water but be ruined by fire, etc. The item’s description will list any special properties or weaknesses (mods) inherited from its materials.

**For LLM/AI:** These rules provide a step-by-step blueprint to generate valid items. An AI agent can use the material stats and combination rules to output new item descriptions or JSON data that adhere strictly to GROWTH’s mechanics. By following the material definitions and combination formulas, the AI’s created items will remain balanced and rule-compliant.

---

## Materials and Their Properties

Every material in GROWTH is defined by a set of base attributes that influence any item made from it:

- **Base Resist:** A number (typically 1–50) representing the material’s inherent durability or hardness. Higher Resist means the material can withstand more damage before failing. For example, cotton cloth might have a very low Resist (~1), while steel or stone can have much higher Resist values. (In GROWTH, “Soft” materials usually fall in the lower range and “Hard” materials in the higher range[Google Drive](https://docs.google.com/document/d/1jYiBAxGMU-EV9nghPQ8dWSInx-Tu0WV65LSy7FaNt1I), though there are exceptions based on the material’s nature.)
    
- **Resist Type (Soft vs. Hard):** A classification of the material as **Soft** or **Hard** (a few rare materials can be “Either” for special cases). Soft materials are flexible or yielding (like fabrics, leather, wood) whereas Hard materials are rigid or dense (like metal, stone)[Google Drive](https://docs.google.com/document/d/1jYiBAxGMU-EV9nghPQ8dWSInx-Tu0WV65LSy7FaNt1I)[Google Drive](https://docs.google.com/document/d/1jYiBAxGMU-EV9nghPQ8dWSInx-Tu0WV65LSy7FaNt1I). This affects how the material behaves – Softs tend to absorb shock or bend (often lighter but lower Resist), while Hards tend to deflect damage but can be brittle (often heavier with higher Resist). _(Examples: Cloth, leather, and rubber are Soft materials; stone, bone, and metal are Hard materials[Google Drive](https://docs.google.com/document/d/1jYiBAxGMU-EV9nghPQ8dWSInx-Tu0WV65LSy7FaNt1I).)_
    
- **Tech Level:** The technological level or crafting knowledge required to work with the material. This is usually denoted by a roman numeral or number and descriptor (e.g. “I – Primitive”, “II – Simple”, etc.). Low tech-level materials (I) are available in primitive settings (wood, bone, simple fabrics), while higher tech materials (III, IV, etc.) represent more advanced metallurgy or synthetic materials. An item’s Tech Level is typically the highest tech among its components or the complexity of the item itself.
    
- **Base Weight:** A normalized weight or density rating (often 1–6 in categories like _Featherlight, Trivial, Light, Moderate, Heavy, Hefty_). Higher weight categories mean the material is heavier or denser[Google Drive](https://docs.google.com/spreadsheets/d/17y2DVn2dG6pdUojk1BoAEIA5SHMJ1RzjihGz8ahRMxA). This influences how encumbering an item made from the material will be. (E.g. cotton is Featherlight (category 1) while stone might be Heavy (category 5) or Hefty (6).)
    
- **Base Value:** An abstract value rating (e.g. 1–10) reflecting the material’s rarity and desirability. Common, primitive materials like wood or stone have low value ratings, whereas rare or advanced materials (silver, diamond, etc.) have higher values. When crafting items, more valuable materials will produce more valuable end products (all else equal).
    

**Material Mods:** Crucially, each material can have one or more **mods** – special properties that affect how it interacts with damage and conditions. These mods are the core of the material’s strengths or weaknesses (such as being fireproof, or conversely flammable). When a material is part of an item, its mods become part of that item’s description and mechanics. Mods cover a range of effects, detailed below.

### Categories of Material Mods

For clarity, material mods can be grouped into a few categories:

- **Damage Dampening Mods:** These mods **halve** a specific type of damage that the material takes. If a material has a dampening mod, any incoming damage of that type is reduced by 50% (round down).
    
    - _Examples:_ **Pierce Dampening**, **Bash(ing) Dampening**, **Slash Dampening**, **Heat Dampening**, **Cold Dampening**, **Electric Dampening**, **Decay Dampening** – each “Dampening” mod means the material takes half damage from that type. For instance, a material with _Bash Dampening_ would suffer only half the normal bludgeoning damage from an attack.
        
- **Resistant Mods:** These mods make the material **resist special effects** of certain damage types. Typically, “Resistant” means the material’s Resist value must be overcome for the effect to apply, or the material negates a portion of the damage:
    
    - **Heat Resistant / Cold Resistant:** The material ignores the special penetrating properties of heat/cold damage unless the attack is extremely strong. In game terms, heat or cold damage must meet or exceed the material’s Resist in one blow to even begin degrading the item’s condition. Lesser heat/cold attacks won’t harm the material.
        
    - **Electric Resistant / Decay Resistant:** The material can absorb or negate some of this energy. For example, Electric Resistant material reduces any electrical damage by an amount equal to its Resist value (essentially it has a built-in shield against electricity up to its durability). Decay (corrosive or entropy) resistance works similarly.
        
- **Proof Mods:** “Proof” means **near-immunity** to a damage type’s special nature – the damage is treated as normal physical harm (usually like standard piercing damage) rather than its special effect.
    
    - _Examples:_ **Heat Proof**, **Cold Proof**, **Electric Proof**, **Decay Proof** – these mods indicate the material is essentially immune to the unique aspect of that damage type. For instance, _Heat Proof_ means fire/heat doesn’t ignite or melt the material at all; the item would only be harmed if the fire is so intense as to function like pure physical damage. (In other words, treat heat as if it were just another physical attack against the item.)
        
- **Vulnerability Mods:** The opposite of resistance – these mods make the material take **double damage** from the specified type.
    
    - _Examples:_ **Heat Vulnerable**, **Cold Vulnerable**, **Electric Vulnerable**, **Decay Vulnerable** – any damage of that type that hits the material is doubled. So a flaming attack would burn a _Heat Vulnerable_ material twice as badly. Metals, for example, are often _Electric Vulnerable_ (conducting electricity easily, they suffer more from lightning shocks).
        
- **Intolerance Mods:** A form of vulnerability where the material’s effective durability is **halved** against a certain damage type.
    
    - _Examples:_ **Heat Intolerant**, **Cold Intolerant** – the material’s Resist value counts as only half its normal value when resisting that damage. For instance, a _Cold Intolerant_ material with Resist 20 would effectively resist cold as if it were Resist 10, making it much easier for freezing temperatures to damage it. (This often represents materials that become brittle or weak in extreme temperatures.)
        
- **Physical/General Mods:** These mods cover a variety of other effects:
    
    - **Flexible X:** Indicates the material is very flexible or lightweight. When used in an item, it **reduces encumbrance** (the item’s weight/penalty) by X steps or points. For example, _Flexible 2_ might mean the item counts as 2 weight-categories lighter for encumbrance purposes due to this material’s give. (Many soft materials like fabrics or leather have a Flexible mod inherently – e.g. _Leather: Flexible 2_ – making armor made of them less restrictive[Google Drive](https://docs.google.com/spreadsheets/d/17y2DVn2dG6pdUojk1BoAEIA5SHMJ1RzjihGz8ahRMxA)[Google Drive](https://docs.google.com/spreadsheets/d/17y2DVn2dG6pdUojk1BoAEIA5SHMJ1RzjihGz8ahRMxA).)
        
    - **Restrictive:** The opposite of flexible – this mod means the material is unwieldy or heavy, **doubling the encumbrance** of any item made with it. A very dense metal might have a Restrictive mod, indicating armor made from it is twice as cumbersome to wear.
        
    - **Protective:** When this material is used in armor, it provides **extra protection** beyond its raw Resist. Specifically, _Protective_ increases the base Resist of the item (after combination) by a factor: in cloth clothing it gives 1.5× Resist, in light armor 2×, in heavy armor 2.5×. (This models materials specifically good for defense. For example, a special weave or padding might be marked Protective, making armor sturdier.)
        
    - **Unrepairable:** Items made of this material **cannot be repaired** by non-magical means if they break. Essentially, once it’s damaged, it stays damaged. Some very hard or complex materials (or those that shatter into pieces) have this property – e.g. certain crystal or brittle metal items might be unrepairable.
        
    - **Fragile / Brittle:** These related mods indicate the material **breaks easily under stress**. A _Fragile_ material has low tolerance for repeated impact – even if it has a decent Resist, once it starts cracking, it will quickly fail. A _Brittle_ material cannot flex at all, so a strong hit might shatter it outright. In gameplay, Fragile/Brittle items tend to lose multiple condition levels from a single heavy blow or may break completely when their durability is exceeded. (For instance, glass is Fragile and Brittle – a hard hit can destroy it in one go.) **Brittle** items also often carry the _Unrepairable_ mod (since once shattered, you can’t fix them)[Google Drive](https://docs.google.com/spreadsheets/d/1VVGrF2QdfeY3pp71N4fqMx-5eAXFuDpcCfRHuuxKYTY)[Google Drive](https://docs.google.com/spreadsheets/d/1VVGrF2QdfeY3pp71N4fqMx-5eAXFuDpcCfRHuuxKYTY).
        
    - **Flammable:** The material **ignites or is damaged by fire easily**. If the item takes any Heat (fire) damage that would lower its condition, Flammable causes it to lose an **extra** condition level. In other words, fire does double durability damage to Flammable items (they catch fire readily, worsening the damage). Many organic materials like cloth, wood, and leather are Flammable.
        
    - **Combustible:** An even worse fire vulnerability – if the item is hit by heat damage, it doesn’t just lose condition; instead the damage is doubled _and_ the object can be **instantly destroyed** by catching fire/exploding. (Combustible materials are extremely prone to burning up completely – e.g. gunpowder or certain chemicals.)
        
    - **Absorbent:** The material **soaks up liquids**. When it’s wet, it gains one benefit and one drawback: it becomes Heat Resistant (it’s harder to burn because it’s water-logged) but it becomes Cold Intolerant (water causes extreme cold vulnerability). This mod often applies to fabrics and leathers that can hold water.
        

_Examples:_ To illustrate some material definitions, here are a few starting-level materials and their key stats:

- **Cotton (cloth):** Resist ~1 (very low), Soft. Mods: Absorbent, Flammable, and very Flexible (e.g. Flexible 2)[Google Drive](https://docs.google.com/spreadsheets/d/17y2DVn2dG6pdUojk1BoAEIA5SHMJ1RzjihGz8ahRMxA). _Tech Level:_ I (primitive weaving). _Weight:_ Featherlight (category 1). _Value:_ very low (common). Cotton burns easily but is light and can soak up liquids (gaining heat resistance when soaked).
    
- **Wood (generic hardwood):** Resist ~10, classified as Hard (rigid structure)[Google Drive](https://docs.google.com/spreadsheets/d/17y2DVn2dG6pdUojk1BoAEIA5SHMJ1RzjihGz8ahRMxA). Mods: Flammable and Absorbent[Google Drive](https://docs.google.com/spreadsheets/d/17y2DVn2dG6pdUojk1BoAEIA5SHMJ1RzjihGz8ahRMxA); also inherently Heat Resistant (doesn’t ignite unless fire is strong)[Google Drive](https://docs.google.com/spreadsheets/d/17y2DVn2dG6pdUojk1BoAEIA5SHMJ1RzjihGz8ahRMxA). _Tech Level:_ I (primitive – woodwork). _Weight:_ Moderate (category ~4). _Value:_ low. Wood is an easy material for early items but is vulnerable to fire and soaking; it has decent durability for primitive weapons or shields.
    
- **Leather (tanned hide):** Resist ~17, Soft (tough but flexible)[Google Drive](https://docs.google.com/spreadsheets/d/17y2DVn2dG6pdUojk1BoAEIA5SHMJ1RzjihGz8ahRMxA). Mods: Absorbent, Flammable; Flexible 2 (making it good for wearable armor)[Google Drive](https://docs.google.com/spreadsheets/d/17y2DVn2dG6pdUojk1BoAEIA5SHMJ1RzjihGz8ahRMxA). _Tech Level:_ I (primitive tanning). _Weight:_ Trivial (category 2) as a raw material, though layered leather armor can be heavier. _Value:_ low-moderate. Leather doesn’t crack easily and is light, but it can rot or burn.
    
- **Stone (common rock):** Resist ~16, Hard[Google Drive](https://docs.google.com/spreadsheets/d/17y2DVn2dG6pdUojk1BoAEIA5SHMJ1RzjihGz8ahRMxA). Mods: Fragile (stone can shatter under force) and inherently Cold Resistant (doesn’t mind cold)[Google Drive](https://docs.google.com/spreadsheets/d/17y2DVn2dG6pdUojk1BoAEIA5SHMJ1RzjihGz8ahRMxA). _Tech Level:_ I (stone-age tools). _Weight:_ Heavy (5) – stone is dense[Google Drive](https://docs.google.com/spreadsheets/d/17y2DVn2dG6pdUojk1BoAEIA5SHMJ1RzjihGz8ahRMxA). _Value:_ very low. Stone weapons or tools hit hard but can break (and are difficult to repair).
    
- **Bronze (arsenical bronze alloy):** Resist ~28, Hard. Mods: Heat Resistant (doesn’t easily melt) and Electric Vulnerable (conducts lightning readily)[Google Drive](https://docs.google.com/spreadsheets/d/17y2DVn2dG6pdUojk1BoAEIA5SHMJ1RzjihGz8ahRMxA). _Tech Level:_ II (early metalworking). _Weight:_ Moderate (4). _Value:_ moderate. Bronze is a strong early metal, excellent against normal damage and heat, but weak to electrical attacks; it made superior weapons in ancient times.
    
- **Cast Iron:** Resist ~39, Hard. Mods: **Brittle** and **Heavy** (cast iron is very rigid and prone to snapping under extreme stress)[Google Drive](https://docs.google.com/spreadsheets/d/17y2DVn2dG6pdUojk1BoAEIA5SHMJ1RzjihGz8ahRMxA), and Heat Resistant. Also likely Electric Vulnerable (like most ferrous metals). _Tech Level:_ II-III (advanced smelting). _Weight:_ Hefty (6). _Value:_ moderate. Iron yields very durable tools/weapons, but pure cast iron can fracture if struck too hard and is cumbersome.
    

These are just a few examples. The GROWTH system includes many materials (rubber, silk, plastics, exotic alloys, etc.), each defined by a Resist, type and mods. An advanced material might have special mods (e.g. **Graphene** has extremely high Resist ~48 and is Electric Proof, meaning it negates electricity[Google Drive](https://docs.google.com/spreadsheets/d/17y2DVn2dG6pdUojk1BoAEIA5SHMJ1RzjihGz8ahRMxA)). But at the start of the game, players will mostly encounter lower-tech materials as listed above. All these definitions form the building blocks for item creation.

---

## Item Creation Rules

When crafting or generating a new item, the following step-by-step process is used to ensure the item’s stats are correctly derived from its materials. This applies whether a player is crafting an item in-game or an AI is generating a hypothetical item. The process assumes you know the item’s intended form (a sword, a shield, armor, etc.) and thus what materials would logically compose it.

**1. Define the Item Type and Components:**  
Decide what the item is and what parts it has. For example, a **sword** typically has a blade and a handle; a **shield** might be a single piece or a wooden core with a metal rim; a suit of **armor** might involve a shell plus padding, etc. Identify the major material components of the item.

**2. Select a Primary Material:**  
Choose the main material that makes up the bulk or most important part of the item. The primary material usually dictates the item’s overall nature. For instance, in a sword, the blade’s material (steel, bronze, etc.) would be primary, while the hilt wrapping is secondary. In a wooden shield with iron rims, the wood might be primary (majority of the shield) and the iron a secondary reinforcement. The **Primary material sets the base Resist and classification** for the item. In other words, start with the primary material’s Resist value and type as a foundation.

**3. Add Subordinate Material(s):**  
If the item has additional materials, determine the subordinate material(s) and their role. These could be handles, bindings, linings, or secondary structural elements. A weapon or tool often has one primary and one secondary material (e.g. a pickaxe with an iron head and wooden handle has iron primary, wood secondary). Some complex items might have more than two materials, but it’s often easiest to treat it as one primary and one composite secondary (or handle multiple sub-materials one by one).

**4. Calculate the Item’s **Final Resist**:**  
The item’s effective durability is a combination of its components. GROWTH uses a simple rule for two components: **take the average of the Primary and Subordinate materials’ Resist values** (then round to the nearest whole number) to get the item’s Resist. This models how a weaker material can be reinforced by a stronger one and vice versa. For example, if you combine a high-Resist metal with a low-Resist wood, the final item’s durability will be in between the two.

- If there are multiple sub-materials, you can extend this averaging method (e.g. average all components, perhaps weighted by their contribution). In most cases, considering one primary and one secondary is sufficient.
    
- **Resist Type:** After computing the Resist, you can classify the item as **Soft or Hard**. Generally, use the primary material’s type as a guide. (Often the averaged Resist will fall near the primary’s range anyway.) For instance, if a Soft material (like leather) is primary in armor, the armor stays flexible (treated as Soft armor) even if combined with a bit of metal. Conversely, a predominantly Hard item remains Hard. In edge cases where a Soft and Hard mix yields a borderline Resist, the GM/AI can decide what makes sense (e.g. a leather breastplate reinforced with some metal might still be considered “Light Armor (Soft)” for flexibility, whereas a mostly metal shield with a cloth cover is still “Hard”).
    

**5. Determine Tech Level:**  
Set the item’s Tech Level to the **highest** tech level among its components or the item design. You cannot craft an item at a lower tech level than one of its materials. For example, if you somehow have a futuristic polymer as a material, the item’s tech level would reflect that advanced material. In a more grounded scenario, a **Bronze Sword** made of bronze (Tech I/Primitive) and wood (Tech I) is Tech I, but an **Iron Pickaxe** (iron being slightly higher tech) might be Tech II. Some item types might impose a minimum tech level as well – e.g. a firearm needs at least the gunpowder age regardless of materials. In summary, use the most advanced element as the tech requirement.

**6. Apply Material Mods to the Item:**  
Now take all the mods from the primary and subordinate materials and **combine them** on the final item. The item effectively inherits all the properties – good and bad – of what it’s made of. This means:

- Any **resistances or proofs** the materials have will protect the item. _(E.g. an iron-headed, wood-handled pickaxe gets iron’s Heat Resistant mod – it won’t be easily damaged by fire – and wood’s Heat Resistant (if any) or other mods. In the Iron+Wood example, iron provides Heat Resistant and wood provides Flammable, so the pickaxe resists mild fire but if it _does_ catch fire it burns worse.)_
    
- Any **vulnerabilities** or **intolerances** from either material will also affect the item. _(E.g. that same pickaxe’s iron is Electric Vulnerable and the wood is Flammable, so the final pickaxe is vulnerable to both lightning and flames.)_
    
- Stack or merge duplicates: If both materials share the _same mod_, you generally list it once (it doesn’t “double up” unless it’s a numerical mod like Flexible X, in which case values might add). For instance, wood and leather both are Flammable – the shield made of wood + leather is still just “Flammable” (burns easily). If both had Flexible mods (say Flexible 2 each), the item might effectively be more flexible – GMs could rule it adds up to Flexible 4 for encumbrance reduction. In most cases, just combine qualitatively.
    
- Handle contradictions by context: It’s rare to have directly opposing mods on materials (e.g. Heat Proof vs Heat Vulnerable), but if it happens, use common sense or item logic. Often one material is predominant. For example, a metal sword wrapped in an asbestos cloth (Heat Proof wrap) would still have a metal blade that can get hot – it might gain some heat protection, but not complete immunity. The system doesn’t explicitly cancel mods out; instead, **note both and let the more specific or severe effect take precedence**. (In practice, such combinations are unusual in starting tech.)
    

After this step, you will have a list of mods describing the final item. These should be recorded in the item’s description or stat block. Players should be made aware of these properties (e.g. an item might list “Mods: Flammable, Brittle” meaning _be careful with fire and heavy blows!_).

**7. Determine Weight and Encumbrance:**  
Calculate the item’s weight category from its materials and form. A simple method is to **average the materials’ base weight ratings**, similar to Resist. However, item design plays a role: some items use a lot of one material relative to another. Often, the primary material’s weight dominates with a small adjustment for the secondary. Also consider any Flexible or Restrictive mods which alter encumbrance. For a rough guideline:

- If an item is mostly one material, start from that material’s weight category. If the second material is much lighter or just a small part (like a leather grip on a sword), the impact on weight is minimal. If the secondary is significantly heavy (like an iron rim on a wooden shield), the weight might be slightly higher than the primary alone.
    
- Many crafted items also have standardized weight adjustments. For example, armor or shields might inherently weigh more because they use a lot of material: A “Heavy Armor” piece might effectively add +1 or +2 to the weight category over just the raw material due to layers and size. (In the **Items** reference sheet, each item type had a “Weight Increase” value that gets added to the material weight[Google Drive](https://docs.google.com/spreadsheets/d/1umfpp1jrtOfH-lhELIVThykr_vpnji8YyjqlCYyWjck)[Google Drive](https://docs.google.com/spreadsheets/d/1umfpp1jrtOfH-lhELIVThykr_vpnji8YyjqlCYyWjck).) So apply any item-specific modifier.
    
- Apply **Flexible/Restrictive mods** last: If the item’s materials have Flexible X, reduce the effective encumbrance by X; if they have Restrictive, you might increase it. For instance, a full suit of plate made of a Restrictive metal would count heavier to wear than its raw weight category implies (encumbrance doubled). Conversely, a shield made of a very Flexible material might be easier to handle.
    

After this, assign the item a final Weight category/name for players (e.g. “Light” vs “Heavy”) and possibly a numeric weight value if needed.

**8. Determine Base Value:**  
Combine the materials’ value contributions to set the item’s worth. An item usually inherits the **highest** value component (expensive materials drive the cost) plus maybe a small increment if the item is complex. A simple way is to average the base values of the components, similar to Resist, since an item is roughly the sum of its parts in value. However, in practice certain items have greater value due to craftsmanship or utility. GMs can tweak the value up if the item is particularly useful or in demand (e.g. weapons and armor often worth more than raw materials alone). As a baseline, if wood is value 1 and iron is value 3, a wood+iron tool might be around value 2. Keep values in the abstract scale (1–10 where 1 is common and 10 is legendary). In GROWTH’s economy, currency like “Munitions” or similar may be tied to these value ratings[Google Drive](https://docs.google.com/document/d/1_QHRyGP3_q_qnO8hKZ4Z_Z42aDomb5Fzo07vDS_Euas)[Google Drive](https://docs.google.com/document/d/1_QHRyGP3_q_qnO8hKZ4Z_Z42aDomb5Fzo07vDS_Euas), but ultimately value helps gauge trade and rarity.

**9. Finalize Item Description or Stat Block:**  
Now bring it all together – give the item a name, type, and list its stats: Resist (with classification), mods, weight, value, etc. If the item is a weapon or armor, also specify its usage details (for weapons: damage types and attack profiles; for armor: what body parts it covers or how much protection it gives). Much of this is beyond the scope of material combination, but worth noting: for weapons, the material Resist can inform the weapon’s damage (e.g. a harder material might allow higher damage or armor penetration). Likewise, mods can affect performance (a _Brittle_ weapon might break on a critical hit, a _Flexible_ bow might bend rather than snap, etc.).

For **AI/LLM purposes**, it’s often useful to output the item in a structured format like JSON. A standardized JSON schema might include fields for name, type, tech_level, materials (primary/sub), resist (value and classification), equipped_location (if applicable), condition (starting durability level), weight, value, attacks (if weapon, listing damage by type), abilities (special moves or none), and mods (with brief descriptions). This ensures the item’s data can be easily parsed or used for further processing. Below is an example of such a structured representation, taken from the primer example of an _Arsenical Bronze Sword_:

json

CopyEdit

`{   "basic_information": {     "name": "Arsenical Bronze Sword",     "type": "One-handed weapon",     "tech_level": "1 - Primitive",     "materials": {       "Primary": "Bronze",       "Sub": "Wood"     },     "resist": "Rating 19, Hard",     "equipped_location": "Hands (1)",     "condition": 3,     "weight": 4,     "value": 2   },   "attacks": {     "Stab": { "piercing": 19, "slashing": 0, "heat": 0, "cold": 0, "bashing": 0, "electric": 0, "decay": 0 },     "Slash": { "piercing": 0, "slashing": 29, "heat": 0, "cold": 0, "bashing": 0, "electric": 0, "decay": 0 }   },   "abilities": { "none": {} },   "mods": {     "Heat Resistant": "Ignores special Heat properties",     "Electric Vulnerable": "Doubles Electric damage",     "Flammable": "Doubles condition loss if damaged by Heat",     "Absorbent": "When wet, gains Heat Resistant and becomes Cold Intolerant"   } }`

This example shows how the bronze sword’s **Resist 19** (Hard) and mods were derived from Bronze (primary) and Wood (subordinate): Bronze contributed _Heat Resistant_ and _Electric Vulnerable_, Wood contributed _Flammable_ and _Absorbent_, which the final item lists. The damage section (not directly from materials but from item type design) shows it has a stab and slash attack with certain base damages (those were determined by weapon design and material strength – e.g. slash does higher damage due to bronze’s properties). For most crafting purposes, you can focus on the basic info and mods; attack values or other mechanics can be filled in according to your game’s combat rules once the item’s core stats are set.

---

## Gameplay Impact and Balance

GROWTH’s item creation system is designed such that no item is “free” of trade-offs – powerful materials tend to have higher costs or rare weaknesses, ensuring balance. Instead of traditional RPG “item level” balancing, GROWTH emphasizes **consequences and costs**. Every item has a **Karmic Value (KV)** footprint associated with its creation, and GMs have a budget of how much powerful gear can enter the story[Google Drive](https://docs.google.com/document/d/1jYiBAxGMU-EV9nghPQ8dWSInx-Tu0WV65LSy7FaNt1I)[Google Drive](https://docs.google.com/document/d/1jYiBAxGMU-EV9nghPQ8dWSInx-Tu0WV65LSy7FaNt1I). In practical terms, this means if players want to craft or obtain superior items, it might cost narrative resources or trigger story consequences (e.g. attracting danger or requiring a quest).

From a mechanical perspective for players:

- An item’s **Resist** is essentially its durability or armor rating. If an attack’s damage does not meet the item’s Resist, the item won’t be significantly harmed (and if it’s armor, it might not be penetrated). If the damage equals/exceeds the Resist, the item usually loses one **condition level** – e.g. going from “Undamaged” to “Damaged” (minor wear) or from “Damaged” to “Broken”. Items typically have a few condition levels (3 is a standard: 3 = intact, 2 = moderate damage, 1 = heavy damage, 0 = destroyed). A very powerful hit might skip a level or outright destroy a brittle item. Mods like _Bash Dampening_ or _Slash Dampening_ effectively raise the functional Resist against those damage types by halving the incoming damage, whereas vulnerabilities do the opposite. Thus, players should pay attention to mods: for example, a _Heat Proof_ shield can safely block fire attacks, but a _Flammable_ shield might catch fire and become useless quickly.
    
- **Encumbrance (Weight):** Heavier items can slow characters down or make actions harder. Because materials carry Flexible or Restrictive properties, two items with the same weight rating might not handle the same – e.g. a _Flexible (2)_ leather armor weighing “Moderate (4)” encumbers as if it were effectively 2 categories lighter (so more like a “Light” armor to wear). Conversely, an iron shield with _Restrictive_ might feel as heavy as a much larger object. The system balances heavy armor/weapons by these penalties, so a player must consider if the protection or damage is worth the trade-off in speed or stamina.
    
- **Repair and Maintenance:** Mods like _Unrepairable_ and _Fragile_ affect how items wear down. A fragile glass sword might deal a lot of damage (sharp) but break after one solid hit. Unrepairable items force players to find replacements or use magic to fix. On the other hand, _Protective_ or _Durable_ materials (if a mod implies it) mean an item can last a long time. Players can also mitigate some weaknesses: e.g. keeping an Absorbent cloak wet to gain heat resistance, or reinforcing a brittle wooden tool with iron bindings (which in item creation terms is exactly adding a secondary material to cover that weakness). The crafting system encourages creative problem solving – if a material has a downside, maybe another material’s mod can counter it (for example, building a shield in GROWTH: wood alone might be Brittle, but designing it as a **pavise** shield adds reinforcement that _“removes the Brittle mod from the material”_[Google Drive](https://docs.google.com/spreadsheets/d/1umfpp1jrtOfH-lhELIVThykr_vpnji8YyjqlCYyWjck)[Google Drive](https://docs.google.com/spreadsheets/d/1umfpp1jrtOfH-lhELIVThykr_vpnji8YyjqlCYyWjck), as noted in the item’s special rules). This highlights that _how_ you craft something matters in nullifying or reducing drawbacks.
    
- **Balance via Availability:** In early-game, only primitive materials are available, keeping item power in check. A stone axe or wooden club is decent but has clear limits (and probably low KV cost). As the game progresses, players gain access to better materials (bronze, iron, steel, etc.), but these come with higher costs and potentially new vulnerabilities (steel is strong but heavy, etc.). Because materials have different profiles of mods, no single material is strictly superior in all aspects – this ensures a form of balance. For example, _Diamond_ might be extremely hard (high Resist) but it’s rare and perhaps Brittle if used wrong; _Rubber_ might make a great shock-absorbing armor (Bashing Dampening[Google Drive](https://docs.google.com/spreadsheets/d/17y2DVn2dG6pdUojk1BoAEIA5SHMJ1RzjihGz8ahRMxA)) but it’s Flammable. The GM can manage balance by controlling material availability and enforcing tech levels. Meanwhile, players can make meaningful choices: do I use a high-tech material and risk its odd vulnerability, or stick with a reliable lower-tech material?
    

**For AI systems (LLM):** Maintaining balance means always following the rules above and not “cheating” an item beyond what the materials allow. The AI should not produce an item with an outlandish Resist or missing a glaring weakness if the components imply one. The JSON template or similar format helps enforce that all relevant information is present (so reviewers can see if an item is too good to be true). By training on these rules, an LLM will understand that **items do not have arbitrary stats – they are the sum of their parts**, and any exceptionally powerful item must come with high requirements or rare materials (and thus narrative cost). In short, the system’s philosophy is that items aren’t balanced by arbitrary limits, but by the logical consequences of their composition (materials, KV cost, etc.)[Google Drive](https://docs.google.com/document/d/1jYiBAxGMU-EV9nghPQ8dWSInx-Tu0WV65LSy7FaNt1I)[Google Drive](https://docs.google.com/document/d/1jYiBAxGMU-EV9nghPQ8dWSInx-Tu0WV65LSy7FaNt1I).

---

## Examples of Crafted Items

Finally, to demonstrate the above process, here are a few **example items** created with starting-level materials. Each example shows the chosen materials, the calculation of Resist, and the resulting mods and stats:

### Wooden Shield (Primitive Shield)

**Components:** Wooden plank (primary), Leather hide backing (subordinate).

- **Materials:** Wood (Resist 10, Hard) + Leather (Resist 17, Soft).
    
- **Resist:** (10 + 17) / 2 = ~13.5, round **14**. Primary is Wood (Hard), so classify item as **Hard**. The shield’s durability is decent against primitive weapons (Resist 14 Hard).
    
- **Mods Inherited:** Wood is _Flammable_ and _Absorbent_ (and has _Heat Resistant_ trait despite being flammable – it won’t catch fire from small flames)[Google Drive](https://docs.google.com/spreadsheets/d/17y2DVn2dG6pdUojk1BoAEIA5SHMJ1RzjihGz8ahRMxA). Leather is also _Flammable_ and _Absorbent_, and is _Flexible 2_[Google Drive](https://docs.google.com/spreadsheets/d/17y2DVn2dG6pdUojk1BoAEIA5SHMJ1RzjihGz8ahRMxA) (making the shield a bit easier to handle than a pure wooden one). Combining these, the **Wooden Shield** has: **Flammable** (very prone to burning), **Absorbent** (wetting it helps vs fire but then cold is a problem), a degree of **Heat Resistant** (small flames scorch but don’t immediately ignite it), and some **Flexibility** (the leather straps give it slight give, reducing encumbrance). In practice, the shield can block attacks, but fire or water can weaken it quickly.
    
- **Other Stats:** Tech Level I (all components primitive). Weight ~ **Moderate** (Wood’s base weight 4, plus leather negligible; a wooden shield is moderately heavy to carry). Value ~ **1** (very cheap/common). Condition 3 (starts intact).
    
- **Use:** This shield provides some protection, but a strong hit (14+ damage) can crack it – and because wood is somewhat brittle, a massive hit might even break it outright. If an enemy uses fire, the shield could catch fire (Flammable), so beware! It’s a low-tier defensive item.
    

### Stone Axe (Primitive One-Handed Weapon)

**Components:** Shaped Stone head (primary), Wooden handle (subordinate), tied with fiber (could be a third component, but we’ll ignore since it’s minor).

- **Materials:** Common Stone (Resist 16, Hard, Fragile)[Google Drive](https://docs.google.com/spreadsheets/d/17y2DVn2dG6pdUojk1BoAEIA5SHMJ1RzjihGz8ahRMxA) + Wood (Resist 10, Hard, Flammable)[Google Drive](https://docs.google.com/spreadsheets/d/17y2DVn2dG6pdUojk1BoAEIA5SHMJ1RzjihGz8ahRMxA).
    
- **Resist:** (16 + 10) / 2 = 13, classify as **Hard** (primary stone). Final Resist **13 (Hard)** – an average durability hand axe for primitive use.
    
- **Mods:** Stone brings **Fragile** (the stone head can crack if used against very hard targets) and **Cold Resistant** (cold weather won’t make it brittle beyond what it is)[Google Drive](https://docs.google.com/spreadsheets/d/17y2DVn2dG6pdUojk1BoAEIA5SHMJ1RzjihGz8ahRMxA). Wood brings **Flammable** and **Absorbent** (handle can burn or swell when wet) plus Heat Resistant trait[Google Drive](https://docs.google.com/spreadsheets/d/17y2DVn2dG6pdUojk1BoAEIA5SHMJ1RzjihGz8ahRMxA). Combined, the **Stone Axe** is **Fragile** and **Flammable**. It will do decent damage (stone is heavy and hard), but if you overstrike a metal armor with it, the stone head might shatter (Fragile). Also, don’t stick it in a fire – the wood will burn and even the stone might crack from heat shock despite being somewhat heat-resistant when dry.
    
- **Other Stats:** Tech I (stone-age tech). Weight: around **Moderate** (stone is heavy, wood is lighter; a stone axe is hefty for its size, maybe ~4 category). Value: **1** (easy to make from common materials). Condition 3 to start.
    
- **Use:** A simple weapon effective in early game, but with clear limits. After some use or a big hit, the binding might loosen or the head chip (portrayed by dropping condition). It’s a candidate for upgrade soon – e.g. replacing the head with bronze once available.
    

### Leather Armor (Light Armor)

**Components:** Cured Leather cuirass (primary material is all leather, possibly with some small metal rivets or bone, but we’ll assume pure leather for simplicity).

- **Material:** Leather (Resist 17, Soft, Absorbent, Flammable, Flexible)[Google Drive](https://docs.google.com/spreadsheets/d/17y2DVn2dG6pdUojk1BoAEIA5SHMJ1RzjihGz8ahRMxA). (If there were minor metal bits, they might add a point or two, but not significant here.)
    
- **Resist:** 17 (no averaging needed since it’s essentially one material). This is a **Soft** armor with Resist 17. However, note that leather is often categorized as “Light Armor” in game terms – it won’t stop high-powered weapons, but it offers some protection against small attacks. If the game uses the _Protective_ mod concept, hardened leather might double its Resist when used as armor (if a GM rules leather counts as protective material for armor, which could bump it to ~34 against physical damage). But in standard, we take it as is.
    
- **Mods:** Leather armor inherits **Flammable** (risk of catching fire), **Absorbent** (rain-soaked armor is heavier and cold-prone), and **Flexible 2** (very easy to move in) from the leather. No Hard material mods since none present. The armor does _not_ have the rigidity of metal, so it won’t be Brittle – you can bend it, which is good. But a severe flame or acid could ruin it fast. It’s also quite repairable (not Unrepairable; you can sew patches on leather).
    
- **Other Stats:** Tech I (humans have made leather armor since primitive times). Weight: **Light** (base leather weight trivial, but covering torso adds some; still much lighter than metal armor). Value: **2** (needs some skill to make, and offers decent protection for low tech). Condition 3 initially.
    
- **Use:** Leather armor is a reliable early armor. It can fend off weaker blows or glancing hits; anything under 17 damage might not penetrate or harm the wearer much. But a strong sword thrust (especially from a Hard material blade) can punch through. The armor’s mods mean it’s comfortable (Flexible) and quiet, but be cautious around fire (a fireball could set your armor ablaze, doing extra damage due to Flammable). If it gets drenched, it won’t burn easily (gaining Heat Resistant from Absorbent) but then cold attacks or environments could stiffen it (Cold Intolerant when wet). This dynamic encourages players to consider environment – e.g. soaking their leather cloak before facing a dragon’s fire, at the risk of suffering if a blizzard hits later.
    

### Iron Pickaxe (Early Metal Tool/Weapon)

**Components:** Iron pick head (primary), Wooden handle (subordinate).

- **Materials:** Iron (let’s assume **Wrought Iron**, approx. Resist ~30, Hard. Iron is Heat Resistant and Electric Vulnerable, and somewhat Brittle in some forms – the data for cast iron was Resist 39 but brittle[Google Drive](https://docs.google.com/spreadsheets/d/17y2DVn2dG6pdUojk1BoAEIA5SHMJ1RzjihGz8ahRMxA); we’ll use a slightly lower Resist to represent wrought iron which is tough but not as brittle) + Wood (Resist 10, Hard, Flammable)[Google Drive](https://docs.google.com/spreadsheets/d/17y2DVn2dG6pdUojk1BoAEIA5SHMJ1RzjihGz8ahRMxA).
    
- **Resist:** (30 + 10) / 2 = 20. Final Resist about **20 (Hard)**. This is a sturdy item – significantly more durable than the stone or bronze examples before. It can absorb a lot of punishment.
    
- **Mods:** Iron provides **Heat Resistant** (you can strike hot surfaces or be in a fire and the metal won’t deform easily) and **Electric Vulnerable** (lightning or magical electricity will readily damage or even melt it). Iron is also typically _Rigid_; heavy iron tools might be considered **Restrictive** due to weight (doubling encumbrance). Let’s say this iron pick head has the _Restrictive_ mod (it’s unwieldy to carry in hand). If it’s crude iron, it might also carry a **Brittle** risk (not as much as cast iron, but could snap under extreme force or cold). The Wood handle adds **Flammable, Absorbent** as usual. Combining these, the **Iron Pickaxe** is: **Heat Resistant** (it’s not easily weakened by heat), **Electric Vulnerable** (don’t use it as a lightning rod), **Flammable** (the wooden handle can burn), and perhaps **Restrictive** (it’s heavy to lug around). It does **not** flex – this tool is quite stiff.
    
- **Other Stats:** Tech Level II (early ironworking era). Weight: **Heavy** – the iron head is category ~5 or 6 itself and wood ~4, the result around 5 (a bit heavy for one hand). A character using it in combat might suffer a speed penalty if not very strong. Value: **3** (iron is valuable enough, plus it’s a useful dual-purpose tool/weapon). Condition 3 at start.
    
- **Use:** The iron pickaxe can serve as a weapon (impaling or smashing damage) and as a mining tool. Its Resist 20 means it can strike stone and very hard objects without breaking, unlike the stone axe which would shatter. This durability is a big upgrade for players in a tech II setting. However, if someone zaps it with a lightning spell, the metal could take double damage (Electric Vulnerable), possibly heating or warping it. And if it’s left in a furnace or lava too long, while the iron won’t melt easily (Heat Resistant), the wooden handle might catch fire and get destroyed, rendering the tool unusable until repaired. Also, carrying a heavy iron tool can tire a character – it’s not something you swing rapidly in combat without consequence (Restrictive encumbrance).
    

These examples show how the **material combination rules** play out for different items. Each item’s strengths (high Resist, special resistances) come directly from its materials, and so do its weaknesses. A creative player might further customize items (for instance, reinforcing that wooden shield with iron bands – adding a bit of iron would raise its Resist slightly and add Heat Resistant, but also make it heavier and introduce Electric Vulnerable). The GROWTH system encourages this kind of emergent problem solving.

By adhering to these guidelines, both players and the AI “Oracle” can **create items that feel authentic to the game world’s logic**. The depth of the material system means there’s always a trade-off to consider, but it also means nearly endless possibilities. From a GM/designer perspective, this framework ensures that new items remain balanced: any super-strong material is gatekept by tech level and counter-mods, and any combination follows predictable math. From an AI perspective, this document serves as a complete reference to generate valid items in JSON or narrative form, guaranteeing consistency with GROWTH’s core rules.

**In summary**, the material and item creation rules of GROWTH turn item crafting into a logical, pattern-driven process. By recognizing these patterns – averaging Resist values, carrying over mods, factoring weight/tech – one can produce an infinite array of weapons, armors, and tools that all **make sense** within the game’s ecosystem. Use this as a toolkit to experiment with new designs, confident that as long as you follow the rules, the result will be a fair and integrated piece of the GROWTH world. Enjoy forging your story’s artifacts!