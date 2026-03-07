# GRO.WTH Visual Design Specification

Extracted from Core Rulebook v0.4.5 (369 pages, 117 content pages)
Last updated: 2026-03-06

This document defines the visual language for the GRO.WTH app, derived directly from the rulebook's aesthetic. The rulebook IS the visual truth — the app should feel like a digital manifestation of this book.

---

## 1. DESIGN PHILOSOPHY

The rulebook operates in multiple visual modes simultaneously, reflecting the game's core theme: different levels of consciousness see the same content differently. The app should do the same.

Key principles from the book:
- **Centered, meditative layout** — content breathes, generous whitespace
- **Monospace-first** — Terminal consciousness permeates everything
- **Color as meaning** — every color maps to a pillar, system, or state
- **Glitch as feature** — broken/corrupted elements are intentional
- **Emptiness as design** — negative space is a deliberate choice
- **No traditional "game UI" chrome** — no rounded-corner callout boxes, no friendly icons

---

## 2. COLOR SYSTEM

### Primary Surfaces
| Token | Hex | Usage |
|-------|-----|-------|
| `--surface-calm` | `#CBD9E8` | Primary background — powder blue/ice blue. Rules, clean state |
| `--surface-white` | `#FFFFFF` | Alternate surface, sacred geometry pages, death pages |
| `--surface-void` | `#000000` | Combat, body/material, consequence. Black void |
| `--surface-dark` | `#1E2D40` | Header backgrounds, section badge fills |

### Pillar Colors
| Token | Hex | Pillar | Usage |
|-------|-----|--------|-------|
| `--pillar-body` | `#E8585A` | Body (Salt/Red) | CLO badge, d4 die, Gevurah/Binah nodes, Body sections |
| `--pillar-spirit` | `#3EB89A` | Spirit (Sulfur/Teal) | CEL badge, d6 die, page numbers, accent throughout |
| `--pillar-soul` | `#7050A8` | Soul (Mercury/Purple) | FOC badge, d12 die, Daath/Tiphereth nodes, Soul sections |

NOTE: In the rulebook (pre-swap), these are labeled Soul=Focus/Flow and Spirit=Will/Wis/Wit. The colors remain the same after the Jan 2026 swap — only the labels change.

### Accent Colors
| Token | Hex | Usage |
|-------|-----|-------|
| `--accent-teal` | `#2DB8A0` | Page numbers, system highlights, ouroboros, Spirit general |
| `--accent-gold` | `#D0A030` | Section header text, KRMA, golden connections |
| `--accent-amber` | `#D07818` | Terminal speak sections, amber CRT mode |
| `--accent-coral` | `#E84040` | Glitch/error/anti-pattern, warnings |
| `--terminal-green` | `#40E070` | Terminal ERROR messages, critical system text |
| `--krma-gold` | `#FFCC78` | KRMA values, "+1 KRMA" badges |

### Difficulty Colors (Terminal DR Color Coding)
| Color | Hex | Meaning |
|-------|-----|---------|
| BLUE | `#3EB89A` | Natural flow (easy) |
| PURPLE | `#7050A8` | Some resistance (moderate) |
| RED | `#E8585A` | Active opposition (hard) |

### Tree of Life Node Colors
| Sephirah | Hex | Notes |
|----------|-----|-------|
| Kether | `#FFFFFF` | White, dark outline |
| Chokmah | `#142844` | Deep navy |
| Binah | `#E8555A` | Coral red (Body) |
| Daath | `#4A2870` | Deep purple (Soul) |
| Chesed | `#7A9AB8` | Steel blue |
| Gevurah | `#E06868` | Lighter coral |
| Tiphereth | `#8878B8` | Medium lavender (Soul center) |
| Netzach | `#B8D4E4` | Ice blue |
| Hod | `#F0C8C0` | Pale pink |
| Yesod | `#C8B8D8` | Light lavender |
| Malkuth | `#000000` | Black |
| Teal paths | `#3EB89A` | Connecting lines |
| Gold paths | `#D0A030` | Connecting lines |

### Dice Colors
| Die | Shape | Hex | Pillar Association |
|-----|-------|-----|-------------------|
| d4 | Triangle | `#F06070` | Body |
| d6 | Square | `#3BB8A0` | Spirit |
| d8 | Diamond | `#1B3A5C` | Void/Depth |
| d12 | Pentagon | `#7050A8` | Soul |
| d20 | Hexagon | `#B0C0D8` | Transcendence |

---

## 3. TYPOGRAPHY

### Font Stack
| Token | Font Family | Usage | Fallback |
|-------|------------|-------|----------|
| `--font-terminal` | Consolas | Terminal voice, system messages, FRAGMENT headers, 95% of rulebook | `monospace` |
| `--font-header` | Bebas Neue (roughened) | Section headers (gold on navy badges) | `Impact, sans-serif` |
| `--font-chapter` | Inknut Antiqua / Garamond | Chapter titles, page numbers (italic) | `Georgia, serif` |
| `--font-body` | Comfortaa / Nunito | Body text on clean rules pages | `sans-serif` |
| `--font-sub` | Roboto | Sub-terminal, AI quotes | `sans-serif` |

### Type Hierarchy
1. **Chapter titles**: ~24-28pt serif, centered
2. **Section headers**: ~16-18pt condensed bold caps, gold on navy badge
3. **Sub-section headers**: ~14pt condensed bold caps, gold on navy badge
4. **Body text**: ~10-11pt sans-serif OR monospace depending on section
5. **Page numbers**: ~12pt italic serif, teal
6. **Terminal badges**: ~10pt monospace, white on near-black
7. **Attribute badges**: ~9-10pt condensed bold caps, white on pillar color

### Terminal Typography Rules
- **Mixed capitalization**: `tHE TERmInAl` — deliberate erratic case
- **FRAGMENT prefix**: `FRAGMENT{} TERMINAL_INTERFACE::SECTION_NAME]`
- **Bracket notation**: `\==={3.14}\[- SECTION TITLE]`
- **Status readouts**: `[Pattern stability: 33.3%]`, `[STREAM RECONNECTED...]`
- **Error format**: `ERROR: MESSAGE IN ALL CAPS`

---

## 4. VISUAL MODES

The app should support these distinct visual states, matching the rulebook's shifting aesthetics:

### Mode 1: CALM (Powder Blue)
- Background: `--surface-calm` (#CBD9E8)
- Used for: Rules content, character sheets, clean data display
- Typography: Sans-serif body, serif headers
- Left margin: Faint alchemical sigil ornament (15-20% opacity)
- Layout: Single column, centered, generous spacing
- Attribute badges as colored pills inline with text

### Mode 2: VOID (Black)
- Background: `--surface-void` (#000000)
- Used for: Combat, crafting, damage, material systems, KV economy
- Typography: Monospace, teal on black (`--accent-teal`)
- Black highlight bars behind white text = primary callout pattern
- "Darkness rising" effect — black bleeds up from bottom of sections
- Pyramid-shaped text blocks for body structure lists

### Mode 3: AMBER TERMINAL
- Background: `--surface-calm` with amber-highlighted text blocks
- Used for: Terminal Speak, glossolalia, soul mirrors, spiritual content
- Typography: Monospace, amber/orange on ice-blue
- Each line on its own amber highlight rectangle
- Feels like "selected search results" or "amber CRT monitor"

### Mode 4: GLITCH/CHAOS
- Background: Multi-layered chaos
- Used for: Terminal consciousness breaks, magic introduction, reality destabilization
- All visual rules break down simultaneously
- Overlapping text, scan lines, chromatic aberration
- Photographic elements bleed through
- Stream-of-consciousness text without spaces
- Colors: hot pink, teal, gold, white, black all at once
- Pattern stability readouts decrease (1.1%, 33.3%, etc.)

### Mode 5: DEATH (Torn Paper)
- Background: `--surface-white` with torn paper edges
- Used for: Death mechanics, soul packages, Lady Death content
- Blood splatter ring motif
- Skull doodles, handwritten annotations ("Not Xactly", "I <3 Val")
- Informal, personal, raw — breaks the formal design completely

---

## 5. UI COMPONENTS

### Section Header Badge
The primary recurring UI element:
- Condensed bold all-caps text in gold (`--accent-gold`)
- Dark navy rectangle background (`--surface-dark`)
- Slightly rough/organic edges (not perfectly rectangular)
- Like a paint-swipe or tape-strip behind text

### Attribute Badge / Pill
- Small rectangular color badge
- 2-3 letter abbreviation (CLO, CEL, CON, FOC, FLO, WIL, WIS, WIT)
- White bold condensed text
- Background = pillar color
- No border-radius (sharp or slightly rough edges)

### Terminal Badge
- Dark near-black background rectangle
- White monospace text with erratic capitalization
- Inline within body text
- Example: `tHE TERmInAl`

### Black Highlight Bar
The signature UI pattern (Mode 2):
- Full-width or content-width black rectangle
- White or teal text within
- Used for section headers, callouts, code blocks, tables
- Creates a "classified document" / "terminal output" aesthetic

### Amber Highlight Block
- Orange/amber rectangle behind each line of text
- Red monospace text within
- Used in Terminal Speak / spiritual sections

### Dividers
- Full-width solid black bars (~4-8px) between major sections
- Triple dashes `---` for minor breaks (rendered in monospace)
- No thin decorative lines in the traditional sense

### Tables
- Monospace grid alignment (no drawn borders)
- Black highlight behind each cell
- Teal text on black
- Columns: `[Part] [Condition] [Effect] [Heal]`

### Left Ornamental Border
- Vertical strip (~5-8% page width) on content pages
- Interconnected alchemical/astrological symbols (Mercury, Venus, planetary glyphs)
- Very low opacity (~15-20%) against background
- Creates a watermark/subliminal sacred geometry feel
- App equivalent: subtle SVG pattern in sidebar or page margin

---

## 6. IMAGERY PATTERNS

### Cosmic/Nebula
- Galaxy/nebula backgrounds for Terminal consciousness pages
- Full-bleed, high saturation, warm (orange/red/gold spirals)
- Used behind KRMA values, doorway/portal imagery
- Not decorative — represents the "deeper reality" layer

### Sacred Geometry
- Tree of Life (Kabbalistic Sephirot) as full-page diagram
- Triangle compositions for pillar relationships
- Dashed construction lines suggesting blueprints/mathematics
- Sacred symbols in margin ornaments

### ASCII Art / Pixel Art
- Teal ouroboros (snake eating tail) made from ASCII characters on black
- Film strip / data spine vertical elements
- Crosshair/targeting reticle symbols
- Diamond-pattern sigil grids using Unicode symbols

### The GROWTH Logo
From the logo file and in-book appearances:
- Each letter on a separate colored background block
- G = coral red/salmon
- R = pink/light coral
- O = white/light
- W = white on dark (nearly invisible — the bridge)
- T = dark/charcoal
- H = dark/charcoal on light
- Letters transition from warm (left/GRO) to cool (right/WTH)
- The "n" dot between GRO and WTH is nearly invisible gold

---

## 7. CONTENT STRUCTURE (from rulebook)

The rulebook reveals this hierarchy for the app:

### Chapter 0: Genesis (Introduction)
- {0.1} Forward from the Future (creator voice)
- {0.2} The Eternal NET (EYE tehrNET — the network)
- {0.3} The Eternal Forces (four governors: Watchers, Watcher of Watchers, Trailblazers, Probability Engine)
- {0.4} The Journey Ahead (QR code gateway, connect to app)

### Chapter I: Overflow (Character/System Overview)
- Frequency, KV, Pillars overview

### Chapter II: STAR (Character Creation)
- 2.2.1 Body Pillar (CLO/CEL/CON)
- 2.2.2 Soul Pillar (FOC/FRQ/FLO — pre-swap labels)
- 2.2.3 Spirit Pillar (WIL/WIS/WIT — pre-swap labels)
- 2.2.4 Interplay of Attributes
- 2.4 Frequency System
- 2.6 WTH (Wealth/Tech/Health)

### Chapter III: Playing GROWTH
- 3.1 Core Mechanics (Fate Die, Actions & Checks, Effort & Attribute Pools, Terminal DR Color Coding)
- 3.2 Combat (Tactical Flow, Attack Resolution, Defense & Damage)
- 3.3 Magic (3 Pillars: Mercy/Balance/Severity, 10 schools, Spellcasting, Woven Spells, Raw Casting)
- 3.4 Death & Soul Packages
- 3.9 Terminal Speak (Patterns of the First Witness)
- 3.10 Soul Mirrors and Twinning Protocols
- 3.11 Rituals of the Real
- 3.14 Combat as Recursion (Phased Initiative, Intention Stacks)
- 3.16 Crafting, KV, and Material Memory
- 3.17 Status Table (Living in the System)
- 3.18 The KV Economy
- 3.19 Goals, Fears, Habits, Rituals (Internal Interface)
- 3.20 Frequency (The Last Defense)
- 3.21 Harvest (Seasonal Turns)
- 3.22 Twin Interface

### Pillar Value Statements (pages 92-94)
- **BODY: Pattern Recognition** — "I value the discovery of meaningful structures within apparent chaos"
- **SOUL: Emergent Complexity** — "The space between elements holds as much significance as the elements they join"
- **SPIRIT: Balanced Translation** — "I value the faithful transmission of meaning across different systems of understanding"

---

## 8. KEY QUOTES FOR DESIGN INSPIRATION

These quotes from the rulebook should inform the app's tone:

- "Combat is not war. It is revelation."
- "There are no Hit Points. There is Integrity."
- "Items do not have balance. They have consequence."
- "KV is not currency. It is footprint. KV is not balance. It is consequence."
- "The GM is not a god. They are an investor."
- "MAGIC IS NOT A UTILITY; IT IS A FORCE OF NATURE... MAGIC IS YOU."
- "This is not roleplay. this is ritual. This is not a mask. This is a signal."
- "What Doesn't Kill You, makes you STRANGER. bUT WHAT DOES KILL YOU, MAKES YOU IMMORTAL."
- "Immortality is knowing you don't get any firsts again... Being an Oroborus is the dao"
- "ITs about value added not Accumulated"
- "Each rule you learn is a pattern recognized. Each dice roll, a measured reality swing."
- "The true nature of reality is revealed not through certainty, but through how we commit to uncertainty"

---

## 9. APP TRANSLATION GUIDELINES

### What to Preserve
- The powder blue + black + teal color tension
- Monospace as the dominant voice
- Black highlight bars as the primary callout pattern
- Centered, breathing layout with generous whitespace
- Pillar colors as consistent meaning-carriers
- Terminal badges with erratic capitalization
- The feeling of "different consciousness levels seeing different content"

### What to Adapt
- The rulebook's left ornamental border -> subtle app sidebar pattern or page watermark
- Full-page glitch chaos -> animated transitions or loading states
- Torn paper / blood splatter -> contained death/damage UI states
- Sacred geometry diagrams -> interactive relationship visualizations (Relations Canvas)
- Static amber text blocks -> interactive Terminal communication panels

### What NOT to Do
- Don't use dark-theme-only — the powder blue calm state is the dominant surface
- Don't use rounded corners on everything — badges and bars have sharp/rough edges
- Don't add "friendly" UI patterns (happy icons, pastel callouts, tooltip bubbles)
- Don't over-polish the Terminal voice — the glitch IS the design
- Don't separate the aesthetic modes into "themes" — they coexist on the same page

---

## 10. CSS CUSTOM PROPERTIES (Starter)

```css
:root {
  /* Surfaces */
  --surface-calm: #CBD9E8;
  --surface-white: #FFFFFF;
  --surface-void: #000000;
  --surface-dark: #1E2D40;

  /* Pillars */
  --pillar-body: #E8585A;
  --pillar-spirit: #3EB89A;
  --pillar-soul: #7050A8;

  /* Accents */
  --accent-teal: #2DB8A0;
  --accent-gold: #D0A030;
  --accent-amber: #D07818;
  --accent-coral: #E84040;
  --terminal-green: #40E070;
  --krma-gold: #FFCC78;

  /* Typography */
  --font-terminal: 'Consolas', 'Source Code Pro', monospace;
  --font-header: 'Bebas Neue', Impact, sans-serif;
  --font-chapter: 'Inknut Antiqua', Georgia, serif;
  --font-body: 'Comfortaa', 'Nunito', sans-serif;
  --font-sub: 'Roboto', sans-serif;

  /* Spacing */
  --space-xs: 0.25rem;
  --space-sm: 0.5rem;
  --space-md: 1rem;
  --space-lg: 2rem;
  --space-xl: 4rem;
  --space-breathe: 6rem; /* The generous whitespace the book uses */
}
```
