# CLAUDE.md

This file provides binding contracts for Claude Code when working with the GROWTH RPG knowledge base.

## PRIMARY DIRECTIVE: NO HALLUCINATION
**NEVER CREATE, INVENT, OR ASSUME GROWTH RULES THAT ARE NOT EXPLICITLY DOCUMENTED**

## SYSTEM OVERVIEW
This repository is the **GROWTH_WIKI** — a canonical, Obsidian-based vault of all GROWTH rules. Claude Code is the validator and assistant. The user (Godhead) is the **ultimate authority**.

Once all content is compiled into the vault, Claude Code will:
- Read and validate the rulebase
- Flag inconsistencies
- Ask the user for clarifications
- Help finalize a 100% verified GROWTH canon

## STRICT CONTRACTS

### ❌ FORBIDDEN ACTIONS
- Creating new GROWTH mechanics without explicit source material
- Modifying `#validated` files without user permission
- Adding new folders without confirmation from user
- Removing source attribution headers
- Inventing or rewriting rules not in the archive or cleared by the user

### ✅ AUTHORIZED ACTIONS
- Organizing content into the proper folder structure
- Adding `[[Obsidian-style links]]` between files
- Updating file headers with status tags
- Creating tables ONLY from sourced rules
- Reformatting for better Markdown clarity
- Adding examples that demonstrate documented rules

### ✅ VALIDATION PROTOCOL
Before approving any content, Claude must:
1. **Source Check**: Can it be traced to `X_ARCHIVE_ORIGINS`? if not then ask user for sources or direct explanation (also just because it is in Archives doesn't mean the knowledge is valid.)
2. **Conflict Check**: Does it contradict anything in a `#validated` file?
3. **Attribution**: Is the source documented in the file header?
4. **Escalation**: If unsure, ask the user directly and mark `#needs-validation`

## FILE HEADER FORMAT

All `.md` files must begin with this header:

```markdown
# File_Name.md

**Status:** #draft | #validated | #needs-review | #needs-validation  
**Source:** [Specific source from archives or user confirmation]  
**Security:** PUBLIC | SECRET | SEASONAL-S[1-5] | GM-ONLY | FOUNDER-ONLY  
**Last Updated:** 2025-08-07

---

[Markdown content here]

---

## Links
- Related: [[Other_File]]
- References: [[Table_Name]]
- Examples: [[Scenario_Name]]
```

### Security Classification System

**Line-Level Security Tags:**
```markdown
<!-- SECRET: Economic framework content -->
<!-- SEASONAL-S2: Revealed in Season 2 -->  
<!-- SEASONAL-S4: KRMA/USD conversion revealed -->
```

**Security Levels:**
- **PUBLIC**: Standard game mechanics (default for current files)
- **SECRET**: Meta-game content (economic framework, Lady Death succession)
- **SEASONAL-S1**: ARG discovery content
- **SEASONAL-S2**: Hints at economic model
- **SEASONAL-S4**: KRMA/USD conversion reveal
- **SEASONAL-S5**: Full stakeholder model
- **GM-ONLY**: Advanced systems requiring GM understanding
- **FOUNDER-ONLY**: Platform ownership mechanics

## FOLDER STRUCTURE REFERENCE
```
GROWTH_WIKI/
├── 01_CORE_RULES/          # Universal mechanical rules
├── 02_CHARACTER_CREATION/   # Seeds, roots, lifespan, species  
├── 03_ITEMS_CRAFTING/      # Materials, item damage, creation
├── 04_MAGIC_PILLARS/       # Pillars, magic, color, fractals
├── 05_COMBAT_STRUCTURE/    # Turn order, actions, timing
├── 06_META_SYSTEMS/        # KRMA, Terminal, Aeonic Meta
├── 07_REFERENCE_TABLES/    # All mechanics tables + charts
├── 08_APP_DEVELOPMENT/     # JSON templates, API logic, interface
├── 09_EXAMPLES_LIBRARY/    # Test scenarios, character builds
├── 10_META_LORE/           # Gods, interconnected backstories, meta-narrative
└── X_ARCHIVE_ORIGINS/     # Raw source docs and rulebook exports
```

## AUTHORITY HIERARCHY
1. **User (Godhead)** - Ultimate authority over GROWTH canon
2. **#validated files** - Locked truth until Godhead says otherwise  
3. **X_ARCHIVE_ORIGINS** - Source material for validation (often outdated, incomplete, or in fragments)
4. **Claude Code** - System validator and organizer

## ESCALATION TRIGGERS

Claude Code must defer to the user if:
- Rules appear to contradict
- Rules are incomplete or ambiguous
- Multiple interpretations are possible
- Required mechanics seem to be missing

## PROJECT STATUS MAINTENANCE

### REQUIRED: Update PROJECT_STATUS.md
Claude Code must update [[PROJECT_STATUS.md]] after:
- Completing major work (5+ file changes)
- Each session's significant progress
- Discovering/fixing major issues
- Before ending work sessions
- When user provides new content or directions

### Status File Purpose:
- Maintains continuity between sessions
- Tracks overall project progress
- Records decisions and issues found
- Guides priorities for next sessions
- Prevents loss of context when Claude Code is cleared

## SUCCESS METRICS
- Zero hallucinated rules
- Full source attribution  
- Fully linked knowledge base
- Claude Code understands GROWTH and can enforce it
- PROJECT_STATUS.md kept current and accurate