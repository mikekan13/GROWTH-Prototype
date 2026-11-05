# Rolls UX brief - 2026-11-05

Source caveat: WebFetch was blocked and the context-mode MCP was down, so this rests on search snippets only. Where a claim is general knowledge rather than a fetched page, it says so. Repo skim: `RollPopup.tsx` is a force-open black panel with a wager per governor pool, a hint colour, and a timeout. `DiceResultBar.tsx` already prints `SD d8[6] | FD d6[4] | +3 effort | = 13 vs DR 12 | SUCCESS +1` as one dense line.

## 1) What the good tables share

1. **Breakdown on demand, total up front.** Sephral's Roll Breakdown for Foundry separates dice, static modifiers and computed terms into a panel the player can open, and it has a setting that lets players see it ([foundryvtt-hub](https://www.foundryvtt-hub.com/package/sephrals-roll-breakdown/)). Rollwarden does the same for D&D Beyond: every modified roll gets a popup showing where each die came from ([Mozilla add-ons](https://addons.mozilla.org/en-US/firefox/addon/rollwarden/)). So: big number first, formula one tap or hover away.
2. **Colour marks extremes and discarded dice.** Roll20 colours inline dice red for lowest, green for highest, blue for both, and grey for a die not in the final result. The thresholds are configurable ([Roll20 forum](https://app.roll20.net/forum/permalink/2157772/)). Foundry highlights success and failure by default on target-number rolls ([Conan 2d20 issue](https://gitlab.com/fvtt-modiphius/foundryvtt-conan2d20/-/issues/181)). So: show dropped or irrelevant dice dimmed, not removed.
3. **Show all dice for advantage.** A D&D Beyond forum user asks to show all three results when advantage or disadvantage applies ([D&D Beyond forum](https://www.dndbeyond.com/forums/d-d-beyond-feedback/149053-campaign-audit-log/previous)). Roll20 users complain that the 3D dice show hidden branches that the template's conditional logic then hides ([Roll20 forum](https://app.roll20.net/forum/permalink/11846012/)). So: the animation and the card must tell the same story.
4. **The wager comes before the throw, and the UI says so.** In Blades in the Dark, push-yourself (2 stress) or a Devil's Bargain must be chosen before the roll, never after ([Roll20 BitD compendium](https://roll20.net/compendium/BITD/Action%20Roll), [FAQ](https://www.scribd.com/document/778454579/FAQ-s)). So: the popup states the cost and the rule in the same place.
5. **Suspense is a short pause with a visible target.** Commenters on an itch.io dice game say suspense rises when you know what you need ([itch.io](https://itch.io/post/11311228)). A late-result delay builds suspense, but too long makes play slow. Baldur's Gate 3 players value click-to-skip ([Steam thread](https://steamcommunity.com/app/1086940/discussions/0/3808408963762874297/?ctp=8)). A generic animation rule of thumb is anticipation at 30-50% of the action's duration ([playbooks.com](https://playbooks.com/skills/dylantarre/animation-principles/anticipation-mastery)). So: about 0.8-1.2 s tumble, tap to skip, number lands once.
6. **Do not bury the result in module collisions.** Dice So Nice hides the chat message until the 3D dice settle, then re-shows it. That broke other modules' tooltips ([GitLab](https://gitlab.com/riccisi/foundryvtt-dice-so-nice/-/issues/337)). So: the card appears when the die lands. It never appears before, and never fights an overlay.
7. **The system owns a custom template.** Roll20 advice is that logic belongs in a system-specific roll template ([Roll20 forum](https://app.roll20.net/forum/permalink/11845688/)). Genesys needs symbol dice and its roller apps show custom faces ([Genesys Dice](https://apps.apple.com/app/id1297007531)). So: GRO.WTH's own Effort, Fate Die and DR vocabulary should be on the card, not generic "d20 + mod".
8. **Never encode meaning in colour alone.** WCAG 1.4.1 Use of Color (general knowledge, not fetched): [w3.org](https://www.w3.org/WAI/WCAG21/Understanding/use-of-color.html). Pair each band with a word and a glyph.

## 2) Layouts

### (a) Popup - the choice
```
+--------------------------------------------------+
| SOUL  *  WILLPOWER            Resist: the knock  |
| Fate Die d8 rolled: 5      Difficulty (DR): 12   |
|--------------------------------------------------|
| EFFORT  from Willpower pool                      |
|  pool 14 [========|......] wager 3               |
|  pool  14  ->  8        (3 Effort costs 6)       |
|  [x2 Dialed to Eleven: Soul pool changes doubled]|
|                                                  |
|  need 7 more to reach DR  -> you have 5 + 3 = 8  |
|--------------------------------------------------|
|  SPLITTING (Willpower 0): all 14 or none         |
|   ( ) none: 0     (x) all 14 -> pool 0 (cost 28?)|
|--------------------------------------------------|
|                 [      R O L L      ]   0:24     |
+--------------------------------------------------+
```
Notes: the multiplier line and the Splitting toggle appear only when active, and they replace the slider. The "after" figure is computed after the multiplier. The Trailblazer never sees the DR, per the current rule. Where the DR is shown above, only the Watcher sees it, and the Trailblazer sees the colour hint instead. The cost of "all 14" under a doubling Thorn must be computed and shown. See open question 2.

### (b) Card - the readout
```
+--------------------------------------------------+
| KRISTOPHER . WILLPOWER vs the knock              |
|                                                  |
|        [  d8  ]     13                           |
|         face 5      vs DR 12      +1             |
|  ==== SUCCESS (narrow) ============ [check mark] |
|                                                  |
| [Effort 3 -> cost 6 (Dialed to Eleven x2)]       |
| [Splitting: all-or-nothing]                      |
| (i) 5 fate + 3 effort + 5 skill d4[?]  [expand]  |
|                                                  |
| "He holds the door, but it costs him."           |
+--------------------------------------------------+
Observer view (a being who sees only what shows):
| KRISTOPHER                                       |
|   ==== HELD ====     "He holds the door."        |
|   (no number, no DR, no chips)                   |
```
Bands (word plus glyph plus colour): crushing fail, fail, narrow success, success, strong success. Use Terminal teal for the success family and Body red for the fail family, and use margin size for intensity. Do not use pillar colours for success/failure (they carry identity). Use pillar colour only for the attribute badge.

### (c) Mobile width (about 360 px)
```
+--------------------------+
| WILLPOWER      DR 12     |
| Fate d8: 5               |
| Effort   [-]  3  [+]     |
|  14 -> 8 (x2 costs 6)    |
| [x2 Dialed to Eleven]    |
|--------------------------|
| [       ROLL        ]    |  <- full width, 48 px
+--------------------------+
```
Replace the slider with stepper buttons (44-48 px targets) plus a "max" chip. The card collapses to the die, total, band and one-line meaning. Chips wrap, and the breakdown is a tap-to-expand row.

## 3) Anti-patterns
- Dense one-line formulas with no hierarchy, the current `DiceResultBar` shape. D&D Beyond users ask for a clearer breakdown ([forum](https://www.dndbeyond.com/forums/d-d-beyond-feedback/149053-campaign-audit-log/previous)).
- Colour-only success or failure, and Roll20's fixed red/green number tint, which cannot be changed ([Roll20](https://app.roll20.net/forum/permalink/2157772/)).
- 3D dice showing a branch the card then hides ([Roll20](https://app.roll20.net/forum/permalink/11846012/)).
- A result that lands before the animation ends, or an animation that cannot be skipped.
- Changing the wager after seeing the roll. Blades forbids it, and GRO.WTH must too.
- Hiding the modifier maths ("it just cost 6"). A multiplier the player cannot see feels like a bug.
- Showing the DR to someone who should not know it.

## 4) Open questions for Michael
1. Does the Trailblazer ever see the DR or the margin afterward, or only the colour band? The card needs a rule for that.
2. Under "Dialed to Eleven", is Effort cost doubled before the pool cap check? Can a wager of 8 be unaffordable at pool 14 because it costs 16?
3. Under Splitting at Willpower 0, is "all 14" the pool value at the time of the roll? And does the ×2 apply to the all-or-nothing cost?
4. Should observers get any number, or only the narrated outcome line?
5. How long should the throw pause be, and may the Watcher skip it for everyone?
