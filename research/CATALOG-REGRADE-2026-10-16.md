# Catalog regrade: KV is the price (2026-10-16)

## The ruling
Mike: an item's KV is its price in KRMA. Items can be worth less than 1 KRMA, so KV can be a decimal. There is no fixed dollar rate: each table works out its own currency rate. The global stock catalog still needs one internal scale, so that items are priced consistently against each other.

## The anchor
Mike's couch: a modern three-seat couch is worth about 2 KV. Taking that couch at about $300 sets the catalog's internal scale at roughly $150 per KV. The scale exists only to keep stock items in proportion to each other. It is not a currency rate: JEWL still works out each campaign's rate at the table.

## Method
- **KV** = real modern-US retail price ÷ 150, rounded to 3 significant figures. Sub-1 values are allowed. The prices are typical 2025-26 new retail, not luxury and not bargain.
- **Single items, not pairs.** Following the earlier "nothing comes in pairs" split, each single boot, shoe, glove or crutch is half the price of the pair.
- **Abilities.** Each `itemAbilities[].kv` keeps its old number. The item's total `kv` follows the price and is no longer the sum of material floor + damage + 2×resist + abilities. **On 83 items the summed ability KV is now higher than the price-KV.** Examples: Smartphone abilities 9 vs KV 3.33; Lockpick Set abilities 8 vs KV 0.667; Duct Tape abilities 3 vs KV 0.053; Laptop abilities 8 vs KV 6. The ability KVs now read as a mechanical weight, not a share of the price. [QUESTION] Should ability KVs be rescaled, or left as they are?
- **Materials** (raw stock quantities) were also regraded by price. Their old KVs were clearly off by this measure: a concrete bag at 1 KV meant $150, and a 2x4 stack at 2 KV meant $300. Keeping them would also have priced a bar of stainless steel (old KV 7, about $1,050) far above the knives made from it (0.33). No materials were invented. The seeder's material-coverage gate passes.
- **Vehicle and building components** stay at kv 0, because the possession carries the price. They do get `volumeCuFt`, and storage components get capacity: Trunk, Truck Bed, Cargo Bay, Cargo Box, Cabin, Workbench & Storage, Stockroom, walk-in cooler, Woodshed. The 21 structural building parts (frame, roof, wiring, plumbing and so on) have no volume, because they are not storable things.
- **Volume** (`volumeCuFt`) is the item's own bulk: a realistic bounding or packed size (a folded wheelchair, a packed tent, an empty backpack).
- **Capacity** (`capacityCuFt` + `capacityLbs`) is set only on things that hold things: storage furniture, fridge, freezer, washer/dryer, dishwasher, microwave, safe, bags, boxes, totes, cooler, toolbox, wheelbarrow, hand truck, tent, vehicles and buildings.
  - Numbers stated in item descriptions were honoured: the sedan trunk "sixteen cubic feet", the pickup "beds 1,500 lbs" with an 8 ft bed, the box truck "~5,000 lbs / 800 cubic feet", and the duffel "sixty liters".
  - A vehicle's capacity is the sum of its holding components. Its weight capacity is the payload.
  - A building's capacity is its interior volume (floor area × ceiling height). Its weight capacity is the floor live load (about 40 psf residential, 100 psf retail, 50,000 lbs for a garage slab).
- **The DB mirror.** `karmicValue` (BigInt) is set to `Math.round(kv)`. It is only a mirror; `data.value` holds the true decimal.

## Results (global stock, 267 live rows; 9 superseded pair rows skipped)
- Before: min 1, median 3, max 160 KV.
- After: min 0.0133 (an emergency whistle), median 0.667, max 3,330 (Corner Store).
- `scripts/regrade-catalog.ts` updated all 267 rows in place. A second run updated 0, so it is idempotent.

## Representative items
| Item | Old KV | New KV | Implied price | Volume (cu ft) | Capacity |
|---|---:|---:|---:|---:|---|
| Three-Seat Couch | 2 | 2 | $300 | 60 | — |
| Candles (Box) | 1 | 0.1 | $15 | 0.1 | — |
| Lighter | 1 | 0.0133 | $2 | 0.002 | — |
| Deck of Cards | 1 | 0.0333 | $5 | 0.004 | — |
| Chef's Knife | 6 | 0.333 | $50 | 0.02 | — |
| Duct Tape | 4 | 0.0533 | $8 | 0.03 | — |
| Everyday Outfit | 1 | 0.533 | $80 | 0.15 | — |
| Work Boot (Steel Toe) | 2 | 0.5 | $75 | 0.15 | — |
| Winter Coat | 3 | 1.33 | $200 | 0.5 | — |
| Hiking Backpack (65L) | 6 | 1.67 | $250 | 0.5 | 2.3 cu ft / 50 lbs |
| Smartphone | 10 | 3.33 | $500 | 0.004 | — |
| Laptop | 10 | 6 | $900 | 0.07 | — |
| Earbud Case | 1 | 0.467 | $70 | 0.002 | 0.0005 cu ft / 0.03 lbs |
| Hearing Aid | 3 | 10 | $1,500 | 0.0002 | — |
| Prescription Glasses | 4 | 1.67 | $250 | 0.005 | — |
| EpiPen | 5 | 2 | $300 | 0.002 | — |
| Prosthetic Hand (Body-Powered) | 8 | 40 | $6,000 | 0.1 | — |
| Refrigerator | 3 | 9.33 | $1,400 | 44 | 21 cu ft / 250 lbs |
| Washer & Dryer Set | 3 | 10.7 | $1,605 | 37 | 12 cu ft / 40 lbs |
| Queen Bed | 3 | 6.67 | $1,000 | 67 | — |
| Bookshelf | 2 | 0.8 | $120 | 15 | 12 cu ft / 250 lbs |
| Dresser | 1 | 2.67 | $400 | 20 | 12 cu ft / 200 lbs |
| Chest Freezer | 2 | 2 | $300 | 15 | 7 cu ft / 250 lbs |
| 55" Smart TV | 3 | 3 | $450 | 3 | — |
| Week of Groceries | 2 | 1 | $150 | 4 | — |
| Bottled Water (Case) | 1 | 0.04 | $6 | 0.5 | — |
| Lockpick Set (Professional) | 10 | 0.667 | $100 | 0.01 | — |
| 9mm Pistol | 23 | 3.67 | $550 | 0.03 | — |
| Hunting Rifle (Bolt-Action) | 33 | 4.67 | $700 | 0.6 | — |
| Kevlar Vest | 20 | 4.67 | $700 | 0.4 | — |
| Riot Armor Set | 24 | 8 | $1,200 | 3 | — |
| AED (Defibrillator) | 15 | 10 | $1,500 | 0.3 | — |
| Home Safe (Fireproof) | 8 | 2 | $300 | 3 | 1.2 cu ft / 100 lbs |
| Mountain Bike | 12 | 5.33 | $800 | 15 | — |
| Compact Sedan | 70 | 167 | $25,050 | 410 | 111 cu ft / 900 lbs |
| Full-Size Pickup | 85 | 333 | $49,950 | 840 | 208 cu ft / 2,100 lbs |
| Box Truck (16ft) | 90 | 467 | $70,050 | 2100 | 880 cu ft / 5,600 lbs |
| City Apartment (Unit) | 80 | 2330 | $349,500 | 8000 | 6750 cu ft / 30,000 lbs |
| Suburban House | 160 | 2670 | $400,500 | 25000 | 18000 cu ft / 80,000 lbs |
| Corner Store | 120 | 3330 | $499,500 | 36000 | 30000 cu ft / 250,000 lbs |
| Concrete Mix (80lb Bag) | 1 | 0.04 | $6 | 0.6 | — |
| Lumber (2x4 Stack) | 2 | 0.6 | $90 | 6 | — |
| Titanium (Rod Stock) | 12 | 5 | $750 | 0.06 | — |
| Kevlar Fabric (Panel Stock) | 8 | 5.33 | $800 | 0.5 | — |

The two Wireless Earbuds nested in the Earbud Case are 0.367 each, so the set totals about $180.

## Outliers and judgement calls
1. **Buildings are now huge next to character budgets.** City Apartment 2,330, Suburban House 2,670, Corner Store 3,330, Rural Cabin 1,000. Violet's whole genesis budget was 25 KV. Rent or lease pricing does not exist yet, so a renter cannot "afford" the unit as an item. [QUESTION] Should a rented home be a lease or a contract and not an owned possession, or should block grants simply never buy buildings?
2. **Vehicles.** Sedan 167, Pickup 333, Minivan 267, Motorcycle 53.3 and Box Truck 467, priced as new. A used car would be about a third of that. [QUESTION] Should there be a "used" condition multiplier?
3. **Medical devices whose price is distorted by US insurance.** EpiPen ($300 single), Inhaler ($60), Hearing Aid ($1,500 single, prescription grade) and Prosthetic Hand ($6,000) use cash or list prices. Insured out-of-pocket costs are much lower.
4. **Weapons dropped sharply** because their old KV summed damage: 9mm Pistol 23→3.67, Hunting Rifle 33→4.67, Taser 14→3. Combat power is no longer reflected in KV at all.
5. **Cheap items with strong abilities.** Lockpick Set (0.667, abilities 8), Duct Tape (0.053, abilities 3), Pepper Spray (0.1, abilities 3) and Bear Spray (0.3, abilities 4). By price they are now almost free to grant.
6. **Uncertain prices.**
   - Portable Oxygen Kit: $400, read as a cylinder kit, not a $2,000 concentrator.
   - Copper Pipe bundle: $500, at copper prices.
   - Kevlar Fabric: $800.
   - Leather hides: $750 for about 3 hides.
   - Board Game Shelf: $250 including games.
   - "Week of Groceries": $150.
7. **Block grants are not regraded.** The `kv` on possession grants in roots.ts and branches.ts (for example "Hiking Backpack (65L)") still uses the old scale. They were out of scope here because they feed the root and branch TKV.
8. **`seed-modern-earth.ts` currently stops at the blossom stage** with "Blossoms are temporary by law — expiry is required". This was already happening before the regrade (confirmed on a stash) and is unrelated to it. The material gate and `validateForgeData` were checked separately: all 267 items validate.
