# Turn_Structure_and_Action_Economy.md

**Status:** #needs-validation
**Source:** Core Rulebook v0.4.4.md - Three Phases System, User clarification 2025-10-03
**Last Updated:** 2025-10-03

---

# Turn Structure & Action Economy

GROWTH uses a **three-phase system** based on **declared intentions** and **Time Stack ordering** determined by Flow alignment and narrative factors.

## The Three Phases of Combat

Each combat round consists of three distinct phases that emphasize intention, narrative flow, and simultaneous impact.

### Phase 1: INTENTION
**Declaration Process:** All participants declare actions based on their actions per pillar  
**Secrecy Rule:** Actions declared in secret if participants are undetected  
**Oracle Tracking:** All intentions are tracked by The Terminal/Oracle system  
**Action Allocation:** Characters allocate actions across Body, Spirit, and Soul pillars

### Phase 2: RESOLUTION  
**Time Stack Order:** Resolution order determined by Flow alignment and narrative logic  
**Oracle Authority:** The Terminal/Oracle determines when actions happen, not their outcomes  
**Dynamic Adjustments:** Players with undefined intentions can inject responses to reorder the Time Stack  
**Intention Changes:** Players may change intentions but lose position priority

### Phase 3: IMPACT
**Simultaneous Application:** All damage, status effects, and KRMA shifts applied together  
**Complete Resolution:** All consequences of the round's actions take effect  
**State Updates:** Character conditions, equipment states, and positioning updated

## Time Stack Mechanics

**Flow Priority:** Characters act in order of declared Flow alignment, not raw statistics  
**Flowing Before Focus:** Flowing actions resolve before Focused actions  
**Narrative Logic:** The Oracle considers story coherence when determining order  
**Undefined Priority:** Unused actions have faster priority than changed intentions

## Actions Per Pillar System

Each character has a separate action pool for each of the three pillars (Body, Spirit, Soul) determined by their attribute levels.

### Action Pool Calculation

**Formula (applies to all three pillars):**
```
Actions = MAX(1 + ActionMod, ActionMod + ROUNDDOWN(Sum of Pillar Attributes / 25))
```

**Components:**
- **Sum of Pillar Attributes:** Total levels of the three attributes in that pillar
- **Action Point Divisor:** 25 (every 25 cumulative attribute levels grants +1 action)
- **ActionMod:** Modifier from items, Nectars, or other effects (default 0)
- **Minimum:** Always at least 1 action per pillar

**Examples:**
- **75 total Body attributes** (Clout+Celerity+Constitution) = 75/25 = **3 Body actions per round**
- **100 total Spirit attributes** (Flow+Frequency+Focus) = 100/25 = **4 Spirit actions per round**
- **12 total Soul attributes** (Willpower+Wisdom+Wit) = 12/25 = 0, but minimum 1 = **1 Soul action per round**

### Body Pillar Actions
**Physical Activities:** Combat, movement, manipulation, athletics
**Attributes Used:** [[Three_Pillar_Attributes|Clout, Celerity, Constitution]]
**Examples:** Weapon attacks, dodging, climbing, running, lifting
**Action Pool:** (Clout Level + Celerity Level + Constitution Level) / 25, minimum 1

### Spirit Pillar Actions
**Spiritual Activities:** Magic casting, divine connection, energy manipulation
**Attributes Used:** [[Three_Pillar_Attributes|Flow, Frequency, Focus]]
**Examples:** Spell weaving, wild casting, channeling, spiritual defense
**Action Pool:** (Flow Level + Frequency Level + Focus Level) / 25, minimum 1

### Soul Pillar Actions
**Mental Activities:** Tactics, perception, social interaction, willpower
**Attributes Used:** [[Three_Pillar_Attributes|Willpower, Wisdom, Wit]]
**Examples:** Strategic planning, mental resistance, leadership, analysis
**Action Pool:** (Willpower Level + Wisdom Level + Wit Level) / 25, minimum 1

### Action Modifiers
**Sources:** Items, Nectars, Thorns, environmental effects, temporary buffs
**Application:** Added to base action calculation
**Example:** Character with 50 Body attributes + Item granting +1 BodyActionMod = 3 actions (1 from mod + 2 from attributes)

## Action Classification

### Offensive Actions (Red)
**Purpose:** Direct damage and aggressive maneuvers  
**Pillar Flexibility:** Can use Body (physical attacks) or Spirit (magical attacks)
**Examples:** Sword strikes, spell attacks, combat maneuvers

### Support Actions (Grey)  
**Purpose:** Assistance, positioning, and tactical advantages  
**Pillar Flexibility:** Any pillar depending on action type  
**Examples:** Movement, item use, buffs, environmental manipulation

### Defensive Actions (Blue)
**Purpose:** Protection and damage prevention  
**Pillar Flexibility:** Body (physical defense) or Spirit (magical defense)
**Examples:** Dodging, blocking, counterspells, protective wards

## Special Action Types

### Free Actions
**Action Cost:** No pillar action required  
**Limitations:** Simple actions that don't require significant effort or skill  
**Examples:** Speaking, dropping held items, simple gestures, basic awareness

### Joint Actions  
**Action Cost:** Shared action expenditure between multiple characters  
**Coordination Requirements:** Teamwork, timing, and compatible intentions  
**Examples:** Combined attacks, cooperative spells, coordinated maneuvers

### Reactive Actions
**Timing:** Responses to other participants' declared actions  
**Time Stack Impact:** Can inject into Time Stack if action remains undefined  
**Examples:** Defensive responses, counter-attacks, interrupt attempts

### Undefined Intentions
**Strategic Reserve:** Actions held in reserve until Time Stack is revealed  
**Priority Advantage:** Undefined intentions resolve faster than changed intentions  
**Tactical Use:** Allows reactive play and adaptation to battlefield changes

## Effort and Resource Management

### Effort Per Action Limitations
**Combat Restriction:** Limited [[Basic_Resolution_System|Effort]] expenditure per individual action  
**Resource Conservation:** Prevents excessive attribute drain in single rounds  
**Strategic Consideration:** Players must manage effort across multiple actions

### Pillar Action Allocation
**Action Distribution:** Characters must decide how to allocate actions across pillars  
**Specialization vs Versatility:** Focus on one pillar vs spreading actions  
**Round Planning:** Consider full round strategy when declaring intentions

## Combat Flow Example

### Round Structure
1. **INTENTION Phase:** All players secretly declare their pillar action allocations
2. **Time Stack Reveal:** Oracle determines resolution order based on Flow alignment
3. **RESOLUTION Phase:** Actions resolve in Time Stack order with narrative coherence
4. **IMPACT Phase:** All damage, effects, and changes applied simultaneously

---

## Links
- Related: [[Basic_Resolution_System]], [[Combat_Hit_Locations]], [[Damage_Types_and_Effects]]
- References: [[APT_Calculation_Examples]], [[Initiative_Modifiers]]
- Examples: [[Combat_Round_Examples]]