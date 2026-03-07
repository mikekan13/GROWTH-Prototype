
This report reviews the GROWTH character sheet template (v1.2) and example sheets (v0.5 and v1.2) against the official rules (Core Rulebook v0.4.4) and supporting design documents. It identifies discrepancies in formulas, logic, and terminology, and suggests improvements for accuracy and usability.

## Skill Dice Mapping (Fate Die & Skill Level)

**Expected Rule:** A character’s Fate Die (d4, d6, d8, d12, or d20) is rolled for all skill checks, and at certain skill levels an additional “Skill Die” is added. According to the rules, skill levels map to extra dice as follows:

- Levels 1–3: No extra die; add a static +Level to the Fate Die roll (e.g. Level 3 adds +3).
    
- Levels 4–5: Add a **d4** (Fate Die + d4).
    
- Levels 6–7: Add a **d6** (Fate Die + d6).
    
- Levels 8–11: Add a **d8** (Fate Die + d8).
    
- Levels 12–19: Add a **d12** (Fate Die + d12).
    
- Level 20: Add a **d20** (Fate Die + d20).
    

The maximum potential roll = Fate Die maximum + Skill Level (e.g. Fate d8 with Skill 5 yields max 8+5=13).

**Sheet Implementation:** The sheets generally follow this progression, but one bug was observed in the older v0.5 sheet around the Level 8–11 range. For example, a character with Skill Level 11 (Illusion magic) was shown with a **d10** as the skill die[Google Drive](https://docs.google.com/spreadsheets/d/1pIUScFFKQ886oo4qWaZxfOFSjbN6hdQ6SKcdolwLQmk). This is incorrect – per rules it should still be a d8 until reaching level 12. (It appears the formula may have treated Level ≥10 as a threshold for d10 by mistake.) All other tested points matched the intended breakpoints (e.g. Level 6 skill shows “d6”[Google Drive](https://docs.google.com/spreadsheets/d/1pIUScFFKQ886oo4qWaZxfOFSjbN6hdQ6SKcdolwLQmk), and Level 3 shows no extra die beyond the Fate coin).

**Naming/Display:** The sheet uses the term **“Coin”** to represent rolling only the Fate Die. For instance, a Level 2 Survival skill displays “**Coin**” with max 10[Google Drive](https://docs.google.com/spreadsheets/d/1pIUScFFKQ886oo4qWaZxfOFSjbN6hdQ6SKcdolwLQmk), implying a Fate Die roll +2. In the dice roller output, a roll is described as `1d8+1Coin`[Google Drive](https://docs.google.com/spreadsheets/d/1pIUScFFKQ886oo4qWaZxfOFSjbN6hdQ6SKcdolwLQmk). This terminology might confuse users – it reads oddly to add “1Coin”. To improve clarity, consider explicitly labeling it as “Fate Die” or simply showing the static bonus. For example, Level 2 could display “Fate +2” instead of “Coin”.

**Max Roll Calculation:** The “Max” column in the sheets correctly reflects Fate Die max + Skill Level. For example, the Basic Combat skill at Level 3 shows max 11 when using a Fate d8[Google Drive](https://docs.google.com/spreadsheets/d/1pIUScFFKQ886oo4qWaZxfOFSjbN6hdQ6SKcdolwLQmk) (8 + 3 = 11), and the Illusion skill at Level 11 shows max 19 with Fate d8[Google Drive](https://docs.google.com/spreadsheets/d/1pIUScFFKQ886oo4qWaZxfOFSjbN6hdQ6SKcdolwLQmk) (8 + 11 = 19). This is consistent with the rule that max potential = Fate max + skill level. No issues were found with the max potential formula itself.

**Recommendations:** Fix the skill die formula for levels 8–11 so that it uses d8 (not d10) in that range. Also, use clearer labels for the Fate Die-only case – possibly change “Coin” to an icon or the word “Fate” to avoid confusion. These adjustments will ensure the Skill Roll column matches the rulebook mapping exactly and is easier to read.

## Attribute Pools, Effort, and Depletion States

**Expected Rule:** Each attribute has a **pool** of points that can be spent as effort. When an attribute’s pool is drained to 0, the character suffers a specific **depletion state**:

- **Clout 0 (Weak):** Carry Level drops to 1 (virtually no carrying capacity).
    
- **Celerity 0 (Clumsy):** Character must pass a DR 5 check (with **no effort allowed**) before any action, or else fumble.
    
- **Constitution 0 (Exhausted):** Ability point (effort) costs are doubled.
    
- **Focus 0 (Muted):** No effort can be applied to rolls (only raw dice).
    
- **Frequency 0 (Death’s Door):** Character must roll vs. death (Lady Death’s intervention).
    
- **Flow 0 (Deafened):** Cannot roll any dice (can only contribute effort).
    
- **Willpower 0 (Overwhelmed):** _TBD_ (not fully defined in v0.4.4).
    
- **Wisdom 0 (Confused):** _TBD_ (no defined effect yet).
    
- **Wit 0 (Incoherent):** _TBD_.
    

**Sheet Implementation:** The character sheets track current vs. max attribute pool in a `current/total` format, and they do flag certain depletion states automatically:

- Constitution depletion is handled correctly. In the **Robert Valentine** sheet, Constitution had a pool of 10 and was fully spent (`0/10`), which triggered the **“Exhausted”** label[Google Drive](https://docs.google.com/spreadsheets/d/1pIUScFFKQ886oo4qWaZxfOFSjbN6hdQ6SKcdolwLQmk). This aligns with the rule that Con=0 means Exhausted (effort costs doubled).
    
- Other physical attributes (Clout, Celerity) did not hit 0 in examples, so we didn’t see “Weak” or “Clumsy” labels. It’s unclear if those are implemented. Given consistency, they likely should be (but no sample in sheets shows it). We recommend adding similar conditional formatting: if Clout pool = 0, display “Weak”, etc.
    
- **Frequency** depletion (“Death’s Door”) is not visibly shown in any sheet (no character had Frequency 0 in examples). It should be implemented to alert the GM/players when Frequency hits 0 – perhaps by highlighting the Frequency cell or showing “Death’s Door” text. This is critical, as reaching 0 Frequency triggers a death save via Lady Death.
    
- **Flow** at 0 (“Deafened”) likewise wasn’t seen. It should be added for completeness so that if a character’s Flow pool empties, the sheet indicates they can’t roll dice.
    
- **Mental attributes (Willpower, Wisdom, Wit)**: The rulebook hasn’t finalized these depletion effects (marked TBD). The sheets currently leave them blank even if drained. For instance, if Willpower were 0, the sheet likely just shows 0 without any status text. Once the game defines these (e.g. Overwhelmed, Confused, Incoherent), those conditions can be added. In the interim, it might be useful to at least flag when any attribute hits 0 (perhaps with a color or symbol) so the GM knows to apply a penalty manually.
    

**Attribute Pool Calculations:** There is some confusion in how the sheet displays base attributes vs. augmented values and how it derives the pool maximum:

- In the template, each attribute row has columns for **Level** and **Aug**. It appears “Level” is intended as the base attribute score, and “Aug” as any bonus points from seeds, equipment, etc. The sum would be the effective attribute (and presumably the pool max). For example, Jenkins’s sheet shows Clout `16, 5` (base 16 + aug 5 = 21 effective) with a pool of `21`[Google Drive](https://docs.google.com/spreadsheets/d/1JYRXpuQWmcVNoL8wEdfS-q04KeMa3WlJRXJ8zfIv2wk), and Focus `10, 17` (base 10 + aug 17 = 27) with a pool of 27[Google Drive](https://docs.google.com/spreadsheets/d/1JYRXpuQWmcVNoL8wEdfS-q04KeMa3WlJRXJ8zfIv2wk). This implies **each attribute point gives one pool point**.
    
- However, Robert’s sheet in v0.5 showed Constitution as `5, 5` with a `0/10` pool[Google Drive](https://docs.google.com/spreadsheets/d/1pIUScFFKQ886oo4qWaZxfOFSjbN6hdQ6SKcdolwLQmk). It’s likely his base Con was 5 and effective Con 5 (no aug), but a pool of 10 was given – suggesting perhaps **Constitution (or all Body attributes)** were doubling the pool. This inconsistency might be an outdated logic in v0.5. In the newer sheets, Jenkins has Con 20 with pool 20 (1:1). So the current standard seems to be **pool size equals the effective attribute score** for all attributes.
    
- If the double-counting for Constitution was an error in older sheets, it has been corrected in v1.2. We should remove any leftover logic doubling Body pools. All attributes should use a unified method to calculate pool (likely 1 pool point per attribute point, unless a specific rule says otherwise).
    

**Effort Application:** The sheets provide the current pool points so players know how much effort they can spend. There isn’t an automated “effort to reach max” calculation, which is fine because effort use is situational. However, the integrated dice roller could potentially compute how much effort is needed if a roll falls short of the max potential. For example, the dice roller output for Robert shows a roll result and mentions “+ 0 Effort = 7”[Google Drive](https://docs.google.com/spreadsheets/d/1pIUScFFKQ886oo4qWaZxfOFSjbN6hdQ6SKcdolwLQmk). This indicates the player didn’t spend effort. A nice-to-have feature would be prompting the player if they _could_ succeed by spending effort (though implementing that might be complex).

**Recommendations:** Ensure all depletion states are covered by sheet logic:

- Add visual indicators for **Weak** (Clout 0), **Clumsy** (Celerity 0), **Muted** (Focus 0), **Death’s Door** (Frequency 0), **Deafened** (Flow 0). Currently only “Exhausted” for Constitution is confirmed working[Google Drive](https://docs.google.com/spreadsheets/d/1pIUScFFKQ886oo4qWaZxfOFSjbN6hdQ6SKcdolwLQmk).
    
- Clarify the **Level/Aug** columns. If “Aug” is meant to show the bonus points _added_ to base, it should not list the final total (to avoid confusion). For example, Jenkins’s Willpower shows `6, 15`[Google Drive](https://docs.google.com/spreadsheets/d/1JYRXpuQWmcVNoL8wEdfS-q04KeMa3WlJRXJ8zfIv2wk) – likely base 6 with a final 15, but it’s unclear how 15 was arrived at. If 15 is the augmented total, perhaps label the columns “Base / Effective” instead of “LVL / AUG”. Consistent labeling will help users understand their true attribute.
    
- Verify the pool size formula is consistent (1:1 with effective attribute, unless rulebook specifies otherwise). Remove any outdated doubling for Body attributes if it persists in hidden formulas.
    
- Consider using conditional formatting (like a red cell background or bold text) when an attribute is fully depleted (0/XY). This, in addition to the text label, will make it very obvious to players/GM that a penalty state is active.
    

## Carry Capacity, Clout, and Encumbrance

**Expected Rule:** **Clout** determines a character’s **Carry Level** (1–10 scale) which dictates how much weight they can carry without penalty[Google Drive](https://docs.google.com/document/d/1jYiBAxGMU-EV9nghPQ8dWSInx-Tu0WV65LSy7FaNt1I). The rulebook specifies that a character can carry items up to their Carry Level weight freely, plus **one item** one level higher than their Carry Level, without being encumbered[Google Drive](https://docs.google.com/document/d/1jYiBAxGMU-EV9nghPQ8dWSInx-Tu0WV65LSy7FaNt1I). If they exceed that (either multiple items above their level or one item 2+ levels above), they gain the **Encumbered** status[Google Drive](https://docs.google.com/document/d/1jYiBAxGMU-EV9nghPQ8dWSInx-Tu0WV65LSy7FaNt1I) (with GM-imposed penalties on movement, etc.). Items are categorized by weight “levels” from 1 (featherlight) to 10 (extremely heavy).

**Sheet Implementation:** The sheets have a field for **Carry Level** and **Weight Status** in the Inventory section. However, there are formula issues and inconsistencies here:

- **Carry Level calculation appears broken or mis-referenced in the template v1.2.** In the Test Valmir sheet (v1.2), the Carry Level cell shows `#REF!`, indicating a formula error (likely trying to lookup data from the separate Items sheet and failing). This means the carry capacity isn’t auto-computing in that sheet. In older v0.5 sheets, the Carry Level was hard to reconcile: both Robert (Clout ~5) and Jenkins (Clout 21) show a Carry Level of **2** and “Weight Status: Fine”[Google Drive](https://docs.google.com/spreadsheets/d/1pIUScFFKQ886oo4qWaZxfOFSjbN6hdQ6SKcdolwLQmk)[Google Drive](https://docs.google.com/spreadsheets/d/1JYRXpuQWmcVNoL8wEdfS-q04KeMa3WlJRXJ8zfIv2wk). It seems one or both might be incorrect. Clout 5 yielding CL 2 could make sense, but Clout 21 should be much higher if a formula existed. This suggests that in v0.5 the Carry Level may have been a static placeholder (default 2) not yet linked to Clout, or manually entered and not updated.
    
- **Intended formula:** It’s not explicitly given in the docs how Clout maps to the 1–10 Carry Level. It might be linear or tiered. If we assume a linear scale (Clout 1 = CL1 and Clout 10 = CL10, capped at 10 max), then Jenkins with 21 Clout should cap at CL10. Robert with 5 Clout would be CL5 in that linear scenario, but he was CL2 on the sheet. So perhaps it’s tiered: e.g., Clout 1–3 = CL1, 4–6 = CL2, 7–9 = CL3, etc., capping at CL10 for Clout ≥28. This tier fits Robert (5 → CL2) but Jenkins (21 → CL8 by that scheme, not 2). Clearly, Jenkins’s Carry Level wasn’t updating properly. We suspect the sheet never applied the formula in v0.5, and the #REF in v1.2 shows it’s trying to but failing to fetch needed data.
    
- **Weight Status:** The sheets display “Fine” when under capacity. We did not see examples of it changing, since none of the characters’ inventories were heavy enough to encumber them given the (erroneous) CL2. Ideally, this should change to “Encumbered” if total carried weight exceeds the free allowance.
    
- **Total Weight Calculation:** There is a cell that sums up carried weight, but it’s not clearly labeled in the CSV export. In Robert’s sheet, a “0” was present before “Carry Level 2”[Google Drive](https://docs.google.com/spreadsheets/d/1pIUScFFKQ886oo4qWaZxfOFSjbN6hdQ6SKcdolwLQmk), which might be the total weight or remaining capacity. If Robert’s items total weight was ~ to carry capacity, that could be remaining capacity 0 (just speculation). However, manually summing Robert’s inventory: Most items were weight level 2 (“Trivial”), and he had many, but the system likely doesn’t sum weight _levels_ directly (it might count highest level among items). The rule allowing one item above means encumbrance isn’t a simple sum – it’s about highest weight category and count of items above threshold. This is complex to automate.
    

**Issues Identified:**

- The Carry Level field is not reliably computed. This is a **bug** (broken reference) in v1.2 and was likely not functional in v0.5 either. It needs to be linked to the character’s Clout attribute.
    
- The weight status logic may not be fully implemented. Even if Carry Level were correct, the sheet would need to evaluate the inventory. For example, if Carry Level = 5 and the character has items of weight levels {5,6,6}, the sheet should flag encumbrance (since they have more than one item above CL). Currently no such check seems present.
    
- The inventory **Weight** column lists each item’s weight category (e.g. “2 – Trivial”, “1 – Featherlight”). These are pulled from item data. That part works (the categories are displayed). But any aggregation of those is unclear.
    

**Recommendations:**

- **Fix Carry Level formula:** Ensure it calculates from Clout. If using tiers, implement the tiered lookup (this might be why the sheet references an external table of weight thresholds – likely in the “Items” or a data sheet). If linear capping, a simple `=MIN(10, ROUNDDOWN(Clout/…))` or similar would suffice. Clarify this with game design: given rule text, a tiered progression is implied.
    
- **Implement encumbrance logic:** This could be as simple as a check: _if any item’s weight level > Carry Level + 1, or if two items have weight level = Carry Level+1, then Weight Status = “Encumbered”_. That covers exceeding the allowance. The sheet could use COUNTIF to count items above CL and so on. Currently, Weight Status only shows “Fine” universally; adding the encumbrance condition will alert players when they carry too much.
    
- It may be useful to display how close to capacity the character is. For instance, “Weight Status: Fine (Light load)” vs “Heavy load” when at capacity. Or, list “Carry Level X of Y used.” A **table or chart** might even be provided on the sheet to explain the weight level categories and their numeric codes, since players see terms like Trivial(2) but may not know 2 means weight level 2.
    
- After fixing the above, test with examples: A character with high Clout should see a higher Carry Level. For example, if Jenkins’s Clout 21 yields CL7 (or CL8 depending on formula), his sheet should show that, and none of his items (mostly level 2 or 3) would encumber him. Conversely, a low-Clout character carrying a heavy item should switch to Encumbered status on the sheet.
    

## Wealth Level and Tech Level Gating

**Expected Rule:** **Wealth Level** and **Tech Level** are both rated 1–10 (with descriptors like “Destitute (1)” or “Elite (10)” for wealth, and “Primitive (1)” up to “Transcendent/Complex” etc. for tech). These levels serve as abstract resources and limits:

- **Wealth**: Represents purchasing power and social class. The mechanics likely allow characters to easily purchase items at or below their Wealth Level, while items above that might require checks, favors, or be outright unavailable. Wealth could also affect starting gear and lifestyle. (E.g., a Wealth 1 Destitute character starts with almost nothing and can only afford trivial items, whereas Wealth 10 can obtain very expensive gear).
    
- **Tech Level**: Represents the level of technology the character is familiar with or has access to. It can gate equipment use or crafting. For instance, a Tech Level 3 character (medieval tech) might not be able to use a Tech 7 energy rifle without penalty or special training. Tech Level also factors into **lifespan** – higher tech societies might extend life or provide better healthcare (the rulebook mentions Tech Level being part of Fated Age calc).
    

**Sheet Implementation:** Each sheet lists the character’s Tech Level and Wealth Level near the top, showing both the numeric rating and descriptor. For example, Jenkins is “Tech 6 – Complex” and “Wealth 4 – Lower Middle Class”[Google Drive](https://docs.google.com/spreadsheets/d/1JYRXpuQWmcVNoL8wEdfS-q04KeMa3WlJRXJ8zfIv2wk), and Robert was “Tech 6 – Complex, Wealth 1 – Destitute”[Google Drive](https://docs.google.com/spreadsheets/d/1pIUScFFKQ886oo4qWaZxfOFSjbN6hdQ6SKcdolwLQmk). This part is displayed correctly.

However, we found **no automatic enforcement or guidance** in the sheet regarding these levels and item purchases:

- Characters in the examples have items potentially above their Wealth means. Robert (Wealth 1) possesses items valued at 4, 5, 6 KV (a spyglass of value 6, etc.)[Google Drive](https://docs.google.com/spreadsheets/d/1pIUScFFKQ886oo4qWaZxfOFSjbN6hdQ6SKcdolwLQmk)[Google Drive](https://docs.google.com/spreadsheets/d/1pIUScFFKQ886oo4qWaZxfOFSjbN6hdQ6SKcdolwLQmk). Possibly these were acquired in gameplay, but if this was character creation it might violate starting wealth guidelines. The sheet does not flag it.
    
- The sheet doesn’t indicate item Tech Levels at all. Items in the inventory don’t show a required Tech Level to use, even though materials have Tech ratings in the primer data. For instance, a “Solar Desalinator” might be a fairly advanced device; if the character’s Tech Level was lower than the item’s, the GM might impose a penalty or forbid it. The sheet currently gives no warning of such a mismatch.
    

**Missing Functionality:** Ideally, the sheet should assist with Wealth/Tech gating in a few ways:

- **Purchasing limits**: When selecting or adding an item, compare its cost/rarity (maybe via KV or an assigned Wealth requirement) to the character’s Wealth Level. If the item’s nominal “Wealth DC” is above the character’s level, highlight it or mark with an asterisk. The Core Rulebook likely has guidelines like _“a Wealth check is needed to buy items above your wealth level”_. The sheet could at least note “Expensive” on such items.
    
- **Tech use limits**: If an item’s Tech Level exceeds the character’s, perhaps shade the item name or add a note “Tech lvl X required”. For example, if a Tech 3 character has a Tech 6 gadget, the sheet might flag that they need assistance or suffer a disadvantage using it.
    
- We did not see any direct references in the sheet formulas to Wealth or Tech beyond displaying them. There was no column in inventory for required Wealth or Tech, presumably because that data would come from the Items compendium if at all. This is a gap that could be filled with data lookup and conditional formatting.
    

**Recommendations:**

- Incorporate the **Items data** (perhaps already partially linked via the Items sheet ID) to include Tech Level and a notional price tier for each item. Then, in the inventory table, add hidden helper columns or conditional rules:
    
    - If `Item.TechLevel > Character.TechLevel`, then highlight the item cell or put a “⚠” symbol to alert the user.
        
    - If `Item.Value (or KV) > Character.WealthLevel`, similarly flag it. (For a simple rule, treat Wealth Level as the max item value they can easily buy. E.g., Wealth 4 can buy items of value 4 or less freely).
        
- Provide guidance in a tooltip or footnote on the sheet: e.g. _“Wealth checks may be required for items above your Wealth Level”_. This reminds users of the rule without needing full automation.
    
- Ensure that Tech Level’s effect on **lifespan** is accounted for (see next section). This might involve using Tech Level as a multiplier or additive in the Fated Age formula.
    
- As an ease-of-use feature, one could add a **dropdown of starting equipment by Wealth** – not critical, but it could prevent players from selecting too costly gear initially.
    

By integrating Wealth/Tech considerations, the sheet will better reflect the gating intended by the game’s economic and tech systems, preventing unrealistic equipment selections and prompting the necessary GM/player discussions when high-tech or costly items come into play.

## Lifespan, Fated Age, and Lady Death

**Expected Rule:** Characters have a **Lifespan Level** (often tied to species or other factors) which, combined with Tech Level and a fate roll by Lady Death, determines their **Fated Age** – the age at which they are fated to die barring extraordinary interventions. The process from the rules:

- **Lifespan Level**: A base measure of how long the species typically lives (e.g. “4 – Normal” might correspond to ~80 years for humans, “6 – Immortal” could be extremely long-lived).
    
- **Tech Level multiplier**: High tech can extend life. The rule summary suggests Tech Level is factored in, possibly as a multiplier or bonus years.
    
- **Fated Percentage Roll**: Lady Death (the GM, behind the scenes) rolls two d100 and takes the higher, representing the percentage of that maximum lifespan the character actually achieves. For example, if base lifespan (after tech mods) is 80, and Lady Death’s highest d100 is 95, the initial Fated Age might be ~76 years (95% of 80).
    
- After this calculation, there is a negotiation phase (meta-narrative) where the GM or game system might adjust the Fated Age – but mechanically, it’s basically set unless altered by story or Frequency “defy death” checks. The rulebook mentions a “three strikes” system for death saves when a character exceeds their fated age.
    

**Sheet Implementation:** Currently, the character sheets do **not** compute or display the character’s Fated Age. They only show current age and birthdate, and a Lifespan category:

- Each sheet has a “LIFESPAN” entry (with a numeric level and descriptor) and fields for Age and Birthdate. For example, Robert is “Lifespan 4 – Normal, Age 33, Birthdate 1/1/0335”[Google Drive](https://docs.google.com/spreadsheets/d/1pIUScFFKQ886oo4qWaZxfOFSjbN6hdQ6SKcdolwLQmk). Valmir is “Lifespan 6 – Immortal, Age 5525”[Google Drive](https://docs.google.com/spreadsheets/d/1QvvTXJovovUyyGfWLn0DRQnQ-h3XLZGCsLMABZ48s-k) – clearly an ancient being.
    
- **No Fated Age shown**: There is no field calculating how many years that character is expected to live. For Valmir (Immortal tech-priest type), presumably his Fated Age would be extremely high or effectively indefinite, but the system likely still rolls something. The sheet leaves this entirely to the GM.
    
- **Lady Death interactions**: There’s no tracking of death saves or “defy death” attempts on the sheet. Frequency (Ҝarma) is the resource used to resist death; the sheet does track Frequency points, but it doesn’t track how many death save failures the character has (the three strikes). That’s understandable, as that’s more of a session log detail.
    
- The **Lady Death negotiation** is outside the scope of a sheet, but once a final Fated Age is decided in the narrative, the GM or player could input it somewhere for reference. Currently there is no placeholder for “Fated Age” or “Death Save DC” on the sheet.
    

**Issues & Opportunities:**

- **Outdated Lifespan info**: The sheet’s Lifespan Level descriptors might not match the latest rule definitions. For instance, “Immortal (6)” for Valmir suggests level 6 is extremely long-lived. If the rulebook v0.4.4 updated these scales, the sheet should be checked. (It appears consistent with rulebook snippet: a Lifespan <4 was “Long” and ≥6 possibly “Immortal”).
    
- **Missing Fated Age Calc**: This is a missing functionality. It’s understandable since it involves a random roll. However, since Lady Death’s initial roll is essentially mechanical, the sheet could calculate a _tentative_ Fated Age automatically upon entering Lifespan and Tech Level. For example, it could assume a 100% roll (worst-case) or prompt the GM to input the d100 result.
    
- The Tech Level’s effect on lifespan isn’t explicitly shown. If Tech Level multiplies lifespan (e.g. perhaps each Tech level adds +5% lifespan or similar), the sheet could incorporate that in the calc.
    

**Recommendations:**

- **Add a Fated Age field**: After the Age/Birthdate, include a field for “Fated Age”. This field’s formula can multiply the Lifespan base by a factor from Tech, then by a placeholder percentage. For instance, if Lifespan 4 corresponds to 80 years, Tech 6 might give +20%, and then you multiply by (Lady Death %/100). Because the Lady Death roll is variable, the sheet could either:
    
    - leave a blank for the GM to input the rolled percentage or
        
    - generate a random percentage (not ideal in a sheet, since it would recalc on every edit).  
        Better is to have the GM input “Fated Age” manually after determining it in play. But having the field there reminds everyone of that important number.
        
- **Highlight Age vs Fated Age**: If current age exceeds the Fated Age, that cell could turn red or say “⚠ Past Fated Age”. This signals the character is living on borrowed time and likely needs to make death saves after each significant time interval. None of the examples were near that point (Valmir is Immortal, Jenkins and Robert are young).
    
- **Automate Lady Death checks?** Probably too much for a sheet. However, a note on the sheet could be useful: e.g., “After age X, roll Frequency (Ҝ) to defy death each year (three failures = death).” This at least bakes the rule into the character sheet for quick reference.
    
- Ensure the **Tech Level multiplier** is documented. If, say, Tech Level 6 doubles human lifespan in lore, include that in the Fated Age calc. The Lady Death design doc implies Tech Level is directly used in the backend formula, so coordinate with the rule designers on the exact math.
    

By tracking Fated Age and alerting when it’s exceeded, the sheet will better integrate the Lady Death mechanics. This is important for long campaigns where characters approach their twilight years. It also adds a dramatic metric to the sheet – players can see a ticking clock for their hero’s destined end, which is very thematic for GROWTH.

## Nectars and Thorns Limits

**Expected Rule:** **Nectars** (special boons/abilities) and **Thorns** (flaws or burdens) are narrative traits that characters accumulate through their journey. The rulebook states that the **maximum number of Nectars and Thorns a character can have is equal to their Fate Die value**[Google Drive](https://docs.google.com/document/d/1jYiBAxGMU-EV9nghPQ8dWSInx-Tu0WV65LSy7FaNt1I). For example, a character with a d8 Fate Die can have up to 8 total Nectars/Thorns. If they would gain another Nectar beyond this, they must replace an existing one; if they gain a new Thorn and are at cap, it forces the loss of a Nectar[Google Drive](https://docs.google.com/document/d/1jYiBAxGMU-EV9nghPQ8dWSInx-Tu0WV65LSy7FaNt1I)[Google Drive](https://docs.google.com/document/d/1jYiBAxGMU-EV9nghPQ8dWSInx-Tu0WV65LSy7FaNt1I). This mechanic ensures characters don’t hoard unlimited traits – their fate (as represented by the Fate Die) limits their capacity for extreme boons/banes.

**Sheet Implementation:** The sheets list Nectars and Thorns in a section (often just labeled “Nectars” or similar) with their type, name, description, and a Karmic Value (KV) rating. For instance, Robert has:

- _Natural Nectar:_ **“Ambitious”** – allows an extra Value/Goal[Google Drive](https://docs.google.com/spreadsheets/d/1pIUScFFKQ886oo4qWaZxfOFSjbN6hdQ6SKcdolwLQmk).
    
- _Negative Thorn:_ **“Emotional Baggage”** – a narrative drawback[Google Drive](https://docs.google.com/spreadsheets/d/1pIUScFFKQ886oo4qWaZxfOFSjbN6hdQ6SKcdolwLQmk).
    

However, the sheet does **not** display the Fate Die-based limit or the count of current Nectars/Thorns:

- There is no counter summarizing “Total Nectars/Thorns: X of Y allowed”. A player would have to manually know their Fate Die (which is listed) and count their traits.
    
- No validation or warning if they exceed the limit. (In our examples, no one exceeded it – Robert has Fate d8 and only 2 traits, Jenkins Fate d8 unknown traits count, likely small.)
    

**Issues & Suggestions:**

- **Counting**: It’s simple to add a count. The sheet could have a cell that counts the number of Nectars and Thorns entered (the table could be of fixed length or dynamic range). For example, “Available Nectars/Thorns: 8” and “Used: 2” for Robert’s case. Jenkins’s sheet likely has a similar section; we saw he has multiple Goals/Values and Nectars could be listed but the excerpt didn’t show them fully.
    
- **Enforcing Replacement Rule**: Enforcement can be left to the GM, but a gentle prompt helps. If `count > FateDieValue`, the sheet could highlight the count in red or display “Over max! Choose one to replace.”
    
- **Differentiating Nectars vs Thorns**: The sheet currently lists a “Type” column (Natural, Negative, etc.). It might help to have separate subtotals for positive vs negative if needed. But since the rule combines them in one max, a total count is sufficient.
    

**Recommendations:**

- Add a **formula**: e.g., in a cell labeled “Nectars/Thorns (used/max)” with something like `=COUNT(NectarNamesRange) & "/" & FateDieValue`. For a Fate Die d8, FateDieValue = 8. (The Fate die could be parsed from the Fate Die cell, which currently contains “8” or “10” etc. In Valmir’s case Fate Die was “10” which is unusual since Fate Die should be one of the set dice – perhaps an error; if Valmir was Fate d10 it contradicts standard platonic set. Assuming Fate Die cell is numeric or can be mapped d12->12, etc.)
    
- If using Google Sheets features, one could even use Data Validation to restrict adding beyond a certain number of rows, but that’s probably overkill. A visual cue is enough.
    
- Update any explanatory notes: The rulebook snippet about max Nectars = Fate Die is important[Google Drive](https://docs.google.com/document/d/1jYiBAxGMU-EV9nghPQ8dWSInx-Tu0WV65LSy7FaNt1I). Consider adding a note in the Nectars section like: “_Max active Nectars+Thorns = Fate Die ([Google Drive](https://docs.google.com/document/d/1jYiBAxGMU-EV9nghPQ8dWSInx-Tu0WV65LSy7FaNt1I))._” This citation or note reminds users of the limit.
    

By doing this, players will be alerted when they are at capacity. It also ties the Fate Die more directly into the character sheet’s logic, reinforcing the concept that their “fate” governs these extraordinary traits.

## Items and Materials: Conditions, Mods, Damage Types

**Expected Rule:** The crafting and item system in GROWTH is detailed. Key mechanics from the primer and rules:

- **Damage types:** There are seven main damage types (Piercing, Slashing, Bashing, Heat, Cold, Electric (Energy), Decay). Items/materials can interact with these via resistances, proofing, vulnerabilities, etc.
    
- **Material Resist (Durability):** Every material has a base Resist value (1–50) and a classification **Soft** or **Hard**. Items combine materials, but generally an item will have an overall Resist rating and type. **Protective** materials/armor multiply base Resist by 1.5x, 2x, 2.5x depending on armor class (Clothing/Light/Heavy).
    
- **Item Condition States:** There are four states – **Undamaged (3)**, **Worn (2)**, **Broken (1)**, and a special **Indestructible (4)** for things that can’t break. When condition degrades, the item’s effective resistance or functionality drops. (Broken items only absorb half their Resist, etc.).
    
- **Mods (Material Modifiers):** Materials can confer special properties (e.g. “Heat Resistant”, “Slash Dampening”, “Flammable”, “Unrepairable”, etc.). These are binary or value mods that affect how damage is taken. For example, _Heat Resistant_ means heat damage must meet the Resist value to harm the item, _Slash Dampening_ halves slashing damage, _Unrepairable_ prevents repairs, etc.
    
- **Item slots & armor:** Armor pieces cover specific body parts and can have their own Resist values that contribute to overall defense. The sheet tracks which slots an item is worn in (checkboxes for Head, Chest, etc.).
    
- **Weight & Value:** Already discussed partly – weight level (1–10) and value (1–10 or more) are shown for each item.
    

**Sheet Implementation:** The inventory table captures a lot of this data, but a few inconsistencies and missing features were noted:

- **Condition terminology:** The sheet uses some non-standard terms for item condition. Many items correctly show **“3 – Undamaged”** or **“2 – Worn”**, which align with the rule states. However, in Robert’s inventory, one item shows **“1 – Finite”**[Google Drive](https://docs.google.com/spreadsheets/d/1pIUScFFKQ886oo4qWaZxfOFSjbN6hdQ6SKcdolwLQmk) and another **“2 – Sufficient”**[Google Drive](https://docs.google.com/spreadsheets/d/1pIUScFFKQ886oo4qWaZxfOFSjbN6hdQ6SKcdolwLQmk) in the Condition column. These terms (“Finite” and “Sufficient”) are not part of the official condition states. They seem out of place:
    
    - “Finite (1)” was listed for a **Sailor’s Kit** (a bag) – possibly meant to indicate it’s a consumable or has limited uses? But a bag isn’t consumable. It might be an error where “Broken” should have been used (1 corresponds to Broken). If so, the sheet should use “1 – Broken” instead of “Finite”.
        
    - “2 – Sufficient” was listed for a **Flask** – maybe this was intended to denote it’s partially full of liquid? More likely, it’s a mistake and should have been “2 – Worn” or some standard term. “Sufficient” is not an official condition.  
        These anomalies suggest an outdated or custom naming that wasn’t cleaned up. All items should use the standard four terms for condition (or numerical ratings with those terms). Any custom states (like using condition to track ammunition or contents) should be clearly separated to avoid confusion.
        
- **Automatic condition effects:** The sheet does not automatically adjust item Resist or function based on condition. For example, when an item is marked “Broken (1)”, the GM is supposed to halve its effective Resist, but the sheet doesn’t calculate that. This is likely fine (it’d be complex to alter Resist values on the fly), but a note could be added. Perhaps when an item’s condition = 1 (Broken), the Resist cell could display “(halved)” or just rely on GM knowledge. Currently no such note is present.
    
- **Material mods and damage type indicators:** The sheet has columns under “Resists” for what looks like damage type abbreviations: F, C, E, A (presumably Fire(Heat), Cold, Electric (Energy), Acid(Decay) or maybe “Arcane”). We observed single-letter entries in these columns for some items:
    
    - Robert’s **Left Rigger’s Glove** has an “R” under one of these columns (it appears under “F” in the text export)[Google Drive](https://docs.google.com/spreadsheets/d/1pIUScFFKQ886oo4qWaZxfOFSjbN6hdQ6SKcdolwLQmk). We suspect “R” stands for **Resistant** (perhaps “Heat Resistant” if under the Fire column). However, the glove’s description says “Hard to Repair; Tough”[Google Drive](https://docs.google.com/spreadsheets/d/1pIUScFFKQ886oo4qWaZxfOFSjbN6hdQ6SKcdolwLQmk), nothing about heat. Possibly “R” was meant to denote **“Rigid”** or some other mod? This is unclear. No legend is provided for what letters like R (or potentially P for Proof, V for Vulnerable, etc.) mean in those columns.
        
    - Most other items left those columns blank (e.g., no letters for rope, flask, etc.). The **Spyglass** has nothing there despite a note “Unrepairable” in description – a mod which could have been marked maybe with a letter (U?) but wasn’t.  
        It seems the sheet began implementing a system to mark material mods with shorthand in dedicated columns, but it’s incomplete/inconsistent.
        
- **Material combination logic:** Some items (like the Spyglass made of “Bone and Glass”) have composite materials. The sheet shows a single Resist value (18 Hard for the spyglass)[Google Drive](https://docs.google.com/spreadsheets/d/1pIUScFFKQ886oo4qWaZxfOFSjbN6hdQ6SKcdolwLQmk). We can infer that behind the scenes, the sheet might be calculating that via the Items sheet (averaging material resists, etc., per the formula in the primer). Without the backend, we can’t verify each, but the numbers seem plausible. For example, **Leather armor pieces**: Leather base resist might be 4 (Soft). Light Armor with Protective mod 2× would be 8, which matches the gloves/boots Resist 8 Soft listed. This indicates those formulas are likely working correctly to set initial Resist.
    
- **Mods in descriptions vs fields:** Many mods are just written in the item description text (e.g. “Flexible” on Rope[Google Drive](https://docs.google.com/spreadsheets/d/1pIUScFFKQ886oo4qWaZxfOFSjbN6hdQ6SKcdolwLQmk), “Hard to Repair” on gloves). These rely on the user to remember their effects. The sheet could use checkboxes or structured fields for common mods to be more machine-readable, but it currently does not.
    
- **Armor slots logic:** The sheet provides checkboxes (True/False) for each body part slot the item occupies[Google Drive](https://docs.google.com/spreadsheets/d/1pIUScFFKQ886oo4qWaZxfOFSjbN6hdQ6SKcdolwLQmk). These are working (e.g., the Sailor’s Cap has True under “HEAD” and is False elsewhere[Google Drive](https://docs.google.com/spreadsheets/d/1pIUScFFKQ886oo4qWaZxfOFSjbN6hdQ6SKcdolwLQmk), the gloves have True under the specific arm slots). There’s no summary of total armor coverage, but the detail is there. No issues here aside from perhaps cosmetic (the exported CSV shows “False” text rather than a checkbox, but in the sheet UI those are likely actual checkboxes).
    

**Issues Identified:**

- Non-standard condition labels (“Finite”, “Sufficient”) – likely legacy or input errors.
    
- Lack of mod legend – letters like “R” appear with no explanation.
    
- No automated effect for broken items – could be noted for user.
    
- Minor: The **Rest Rate** and **Base Resist** rows in Jenkins’s Vitals section (lines 76–80)[Google Drive](https://docs.google.com/spreadsheets/d/1JYRXpuQWmcVNoL8wEdfS-q04KeMa3WlJRXJ8zfIv2wk) suggest some data that isn’t clearly presented in CSV. Possibly those are summary rows (Base Resist 15 for his armor? Rest Rate 1 for healing?). It’s not well-labeled in output but as long as in the sheet it’s clear (maybe a leftover from older design).
    

**Recommendations:**

- **Use standard condition terms:** Replace any “Finite” with “Broken” and any “Sufficient” with the proper term (likely “Worn” if it was meant to be 2). Ensure all items created with the template use the dropdown of {Indestructible, Undamaged, Worn, Broken}. If “Finite” was intentionally a special case (perhaps for items that get “used up” rather than broken, like consumables), that should be rethought. A consumable’s condition could just be its quantity or charges, not the armor-style condition.
    
- **Provide a mod legend or use tooltips:** If letters are going to be used under the damage type columns, include a legend on the sheet (e.g., maybe as a hover note on the headers F/C/E/A). For instance: _“R = Resistant (ignores special effects), P = Proof (damage treated as Pierce), V = Vulnerable (double damage), D = Dampening (half damage)”_, etc. This correlates with the primer’s terms. Currently we only saw “R”, but one could imagine others. Consistently mark mods: e.g., a material with Heat Proof could have “P” under F, or Flammable could be an “🔥” icon somewhere. Alternatively, ditch the letter columns and continue listing mods in the description, but that forfeits structured data usage.
    
- **Automate mod effects where feasible:** A stretch goal – if an item is “Unrepairable”, the sheet could prevent its condition from being restored above Broken without GM override. This might be too much for a sheet, but at least highlight “Unrepairable” items in the condition cell (maybe color it). For “Dampening” mods, one could imagine calculating effective DR, but that’s more for GM to do in combat.
    
- **Armor and Resist Summary:** It might be useful to sum up the character’s armor coverage – e.g., compute an “Armor Resist total” by combining worn items. However, because GROWTH’s system isn’t simply additive (different pieces cover different hit locations, and types of damage matter), the sheet doesn’t attempt this. That’s fine, but a note to the GM like “See armor resist per hit-location above” could help. Jenkins’s sheet had a section listing “Base Resist 15” under Vitals, possibly summarizing his average or lowest armor, but it was unclear. Ensure any summary like that is correct and up-to-date.
    
- **Conditional formatting for Broken items:** When an item’s Condition = “1 – Broken”, consider shading the whole item row or the name in red. This gives a visual warning that the item is broken and only half effective. This is in addition to writing “Broken”; it helps during play to quickly scan which gear is damaged.
    

By refining the inventory section with consistent terminology and clear indicators, we make it much easier for both players and GMs to handle equipment. The current formulas seem to correctly fetch item stats (Resist, weight, value) from the database, which is great – we mainly need to clean up presentation and add a few rule-based cues (like mod letters and condition highlights).