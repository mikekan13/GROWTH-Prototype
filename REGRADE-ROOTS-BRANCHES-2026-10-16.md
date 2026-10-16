# Stock Roots + Branches — material-life regrade (16 Oct 2026, DRAFT for Mike)

Mike (16 Oct): "increase the TKV of Roots and Branches probably by around 50… all need to be rebalanced… some of that 50 won't all be in the accumulated wealth but into attributes, possessions gained, items gained, skills, etc." Branches are tied to time, so they lift ~+2.8/yr (50/18). Named grants are stock item archetypes genesis pulls free and paints; accumulated wealth is the unnamed life's budget.

**Break-even:** RULED (Mike): break-even = 8 KRMA × years for roots and branches alike — an 18-year root breaks even at 144, a 17-year one at 136.

Nothing below is seeded yet. On approval: `npx tsx scripts/seed-modern-earth.ts` (idempotent upsert) re-publishes these; Violet's three campaign blocks are patched separately (§3).

## 1. Roots (18 years)

| Root | old KV | attrs | skills | grants | wealth | **new KV** | Δ | freq | named grants |
|---|---|---|---|---|---|---|---|---|---|
| Suburban Childhood | 94 | 90 | 19 | 10 | 26 | **145** | +51 | 1 | Laptop (10) |
| Rural Upbringing | 96 | 90 | 20 | 11 | 24 | **145** | +49 | 1 | Toolbox (Stocked) (6), Pocket Knife (5) |
| Inner-City Streets | 96 | 90 | 22 | 8 | 22 | **142** | +46 | -2 | Skateboard (3), Pocket Knife (5) |
| Military Family | 94 | 90 | 19 | 11 | 26 | **146** | +52 | 2 | Hiking Backpack (65L) (6), Multitool (4), Duffel Bag (Large) (1) |
| First-Generation Household | 96 | 89 | 21 | 5 | 28 | **143** | +47 | -1 | Kitchen Kit (3), Sewing Machine (2) |
| Homeschooled | 96 | 89 | 21 | 6 | 26 | **142** | +46 | -2 | Bookshelf (2), Digital Keyboard (61-key) (3), Notebook & Pen (1) |
| Academic Household | 96 | 89 | 21 | 12 | 26 | **148** | +52 | 4 | Laptop (10), Bookshelf (2) |
| Athlete's Youth | 96 | 90 | 21 | 15 | 20 | **146** | +50 | 2 | Mountain Bike (12), Adjustable Dumbbells (2), Athletic Wear Set (1) |
| Artist's Household | 95 | 90 | 20 | 11 | 16 | **137** | +42 | -7 | DSLR Camera (6), Acoustic Guitar (3), Paint & Supplies Kit (2) |
| Working-Class Grind | 95 | 90 | 20 | 9 | 24 | **143** | +48 | -1 | Toolbox (Stocked) (6), Work Boots (Steel Toe) (3) |
| Coastal Childhood | 96 | 90 | 21 | 11 | 24 | **146** | +50 | 2 | Fishing Rod & Tackle (2), Two-Person Tent (4), Pocket Knife (5) |
| Faith Community | 95 | 90 | 20 | 8 | 26 | **144** | +49 | 0 | Business Suit (4), Acoustic Guitar (3), Everyday Outfit (1) |
| Foster System | 95 | 94 | 23 | 6 | 12 | **135** | +40 | -9 | Duffel Bag (Large) (1), Burner Phone (5) |

## 2. Branches (per year)

| Branch | yrs | old KV | attrs | skills | traits | grants | wealth | **new KV** | Δ | KV/yr | freq | named grants |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| College Degree | 4 | 13 | 6 | 12 | 0 | 10 | 2 | **30** | +17 | 7.5 | -2 | Laptop (10) |
| Trade Apprenticeship | 3 | 12 | 5 | 11 | 0 | 9 | 6 | **31** | +19 | 10.3 | 7 | Toolbox (Stocked) (6), Work Boots (Steel Toe) (3) |
| Military Service | 4 | 19 | 7 | 15 | 0 | 5 | 10 | **37** | +18 | 9.3 | 5 | Multitool (4), Duffel Bag (Large) (1) |
| Medical Training | 7 | 22 | 9 | 17 | 0 | 1 | 8 | **35** | +13 | 5.0 | -21 | Lab Coat (1) |
| Nursing Years | 4 | 19 | 7 | 14 | 0 | 5 | 10 | **36** | +17 | 9.0 | 4 | First Aid Kit (4), Scrubs (1) |
| Software Career | 5 | 17 | 6 | 14 | 0 | 13 | 20 | **53** | +36 | 10.6 | 13 | Laptop (10), Desktop PC & Monitor (3) |
| Long-Haul Years | 4 | 18 | 6 | 15 | 0 | 9 | 12 | **42** | +24 | 10.5 | 10 | CB Radio (4), GPS Unit (Handheld) (5) |
| Parenthood | 5 | 15 | 7 | 11 | 0 | 1 | 6 | **25** | +10 | 5.0 | -15 | Storage Totes (Set of 4) (1) |
| Service Industry Years | 3 | 16 | 6 | 12 | 0 | 1 | 6 | **25** | +9 | 8.3 | 1 | Everyday Outfit (1) |
| The Startup Ride | 3 | 16 | 6 | 12 | 0 | 10 | 2 | **30** | +14 | 10.0 | 6 | Laptop (10) |
| Year Abroad | 1 | 8 | 2 | 7 | 0 | 2 | 0 | **11** | +3 | 11.0 | 3 | Luggage Set (2) |
| Recovery Journey | 4 | 47 | 7 | 6 | 35 | 0 | 2 | **50** | +3 | 12.5 | 18 | — |
| Beat Cop Years | 5 | 21 | 6 | 18 | 0 | 3 | 16 | **43** | +22 | 8.6 | 3 | Flashlight (LED) (3) |
| Kitchen Line Years | 4 | 14 | 6 | 10 | 0 | 7 | 8 | **31** | +17 | 7.8 | -1 | Chef's Knife (6), Chef's Whites (1) |

## 3. Violet's own blocks (campaign instances; patched on approval, not by the seeder)

Her blocks were authored by genesis at the old scale and sit well under it (root 61 vs the ~95 stock anchor). Proposed, same spread. Break-even for her 17-year root = 8 × 17 = **136**; at 107 she pays no Frequency and sits under the line — a deprived, loved, quiet household, by design.

| Block | yrs | old KV | proposed lines | **new KV** | Δ | KV/yr |
|---|---|---|---|---|---|---|
| root **Grandparent Household** | 17 (archetype 18) | 61 | attributes 44 → 62 (clout 4, celerity 5, constitution 7, flow 6, focus 11, willpower 9, wisdom 10, wit 10); skills 17 → 23 (Needlework & Repair 3→5, Ancient Stories 5→6, + Cooking 3); named grants: Handmade Stuffed Animal (1), Sewing Box (2), Handwritten Recipe Collection (1); accumulated wealth **18** (the stucco house sold to settle Rosemary's debts — four things kept, little else) | **107** | +46 | 6.3 |
| branch **Violated Trust** | 2 | 11 | attributes +2 (willpower 2→3, focus 1→2); skills +2 (Concealment 2→3, Reading Intent 3→4); accumulated wealth **1** | **17** | +6 | 8.5 |
| branch **Years of Solitary Craft** | 6 | 28 | attributes +3 (focus 3→4, willpower 3→4, flow 3→4); skills +3 (Self-Teaching 3→4, Web Markup 2→3, Creative Writing 5→6); named grant: Laptop (10) = her Personal Laptop; accumulated wealth **6** | **50** | +22 | 8.3 |

Her life budget after this: 18 + 1 + 6 = **25 KV** of accumulated wealth, minus the things she already holds or owns that did not come as named grants. [QUESTION Mike] What has she lived on for six years in that apartment (`set_income` needs a source and a figure; the budget assumes modest, steady, solitary work)?

## 4. Open before seeding

1. **Foster System (135) and Artist's Household (137)** land under the 144 line on purpose (materially poorer upbringings; the lift went to skills and attributes). Keep, or level everyone to 144?
2. **Violet's root at 107** against a 136 line: keep her deliberately under it, or lift her toward it?
3. **Violet's income** (§3).

On "yes": `cd app && npx tsx scripts/seed-modern-earth.ts` re-publishes the 27 stock blocks (idempotent), and I patch Violet's three with a one-off script.
