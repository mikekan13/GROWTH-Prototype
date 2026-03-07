# LLM_Agent_Behavior_and_Prompts.md

**Status:** #extracted - Content distributed to organized folders  
**Source:** ChatGPT & Claude Protocol Memory  
**Last Updated:** 2025-08-07

---

## LLM Behavior, Prompts, and Contracts in GROWTH

### 1. LLM Roles and Limitations

- **LLMs are not rule authors.** They can only:
  - Extract, format, and rephrase rules from existing content.
  - Propose structural or organizational improvements.
  - Validate logic and identify contradictions, but never invent new mechanics.
- **LLMs cannot finalize, canonize, or “close” a rule.** Only the user (Godhead) can approve or reject a rule, edge-case, or meta-system.
- **All LLM prompts, contracts, and escalation protocols** must be archived for review and future validation.

---

### 2. Contract-First Prompting and Validation

- Every interaction with Claude Code or ChatGPT for rule extraction, organization, or validation uses a contract-first prompt structure, including:
  - Authority hierarchy (user > validated files > archive > Claude Code)
  - Strict validation protocols: No hallucination, all rules must be sourced, flagged, and escalated if unclear.
  - Escalation triggers: Any ambiguity, contradiction, or missing logic must be flagged for human review.
- LLMs can format, hyperlink, and propose changes, but not modify any #validated file or create new mechanics without explicit user permission.

---

### 3. Sample Prompts & Protocols

- **General Validation Prompt:**  
  “You are validating and rewriting rules for GROWTH, a metaphysical RPG system. Identify whether the given text is a RULE, META_RULE, or LORE. Place in the correct folder using the GROWTH_WIKI structure. Link to related mechanics. Flag contradictions. Only confirm as #validated if approved by user.”
- **Escalation Example:**  
  “This rule appears to conflict with [File_Name.md]. Please escalate for user review.”
- **Organization/Extraction Example:**  
  “Extract all rules about death, resurrection, and Frequency from these files, format as Markdown, and link to Lady Death and Soul Package mechanics. Mark #needs-validation if any logic is ambiguous.”

---

### 4. Meta-LLM Layer

- LLMs are instructed to learn from past interactions, prompt structures, and contracts, building a self-improving rule validation system for GROWTH, always subject to the user’s ultimate authority.

---

## Links
- Related: [[ChatGPT_Project_Memory]], [[CLAUDE.md]]
- References: none
- Examples: none