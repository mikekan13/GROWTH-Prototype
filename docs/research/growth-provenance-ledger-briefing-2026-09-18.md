# GROWTH Creation Ledger — Provenance & Attribution Briefing
**Purpose:** Companion to `growth-agent-research-briefing.md`. Ground-truth reference for building GROWTH's ledger of everything created and by whom — human and AI — and connecting it to attribution, rights, and eventual compensation (KRMA). Point Claude Code at this file.

**Compiled:** 2026-09-18

---

## 0. Framing: Why This Is the Same Problem Twice

Doc 1 established: an AI entity that cites its evidence memories can say where its self came from. This doc: a *platform* that signs its creative acts can say where its content came from. Same discipline, two scales. Foundation models can't self-attribute because training consolidates without provenance — the sources were never stored, only their common pattern. GROWTH is being built *after* that lesson, so it can record provenance at write-time, where it's nearly free, instead of reconstructing it later, where it's nearly impossible.

The field currently splits the problem into five layers. Most projects tackle one. GROWTH's ledger should be designed knowing all five exist:

1. **Creation provenance** — who/what made this, with what tools and ingredients. (C2PA's territory.)
2. **Ownership provenance** — who owns it now, which can change after creation. (NFT/registry territory.)
3. **Rights expression** — what may be done with it: remix, AI-training, commercial use. (ODRL, PLUS, opt-in/out registries.)
4. **Consumption tracking** — which systems accessed/ingested it. (Newest layer; e.g. Sovereign Context Protocol.)
5. **Influence attribution** — which sources shaped a given generated output, and how much. (Training Data Attribution — the unsolved research frontier.)

---

## 1. The Landscape — Who's Tackling What

### 1.1 C2PA / Content Credentials (creation provenance — the mature standard)
- Coalition for Content Provenance and Authenticity: open standard from Adobe, Arm, BBC, Intel, Microsoft, Truepic (launched Feb 2021; Adobe's Content Authenticity Initiative dates to 2019). Current spec **v2.3, published Feb 2026**. Royalty-free, open, implementable by open source. c2pa.org
- Mechanism: a **manifest** — a cryptographically signed JUMBF metadata block embedded in the asset — recording what tool created the content, which organization operated it, when, and the chain of edits since creation. Signed with X.509 certificates; verifiable **offline**, no central database required.
- Key concept for GROWTH: **assertions** and **ingredients**. A manifest declares facts ("assertions") including which 'ingredient' assets were used in creation — so a derived work points at its parents. This is exactly a creative dependency graph, standardized.
- AI-specific assertions exist: IPTC Digital Source Type values like `compositeWithTrainedAlgorithmicMedia` (human + AI hybrid works), the AI model used, and the nature of human contributions. OpenAI already embeds C2PA in DALL·E 3 images.
- 2026 conformance program enables interoperability testing across tools/platforms/verifiers.
- **Known limits:** designed for media files (images/video/audio strong; raw text weak — text doesn't carry embedded metadata well). Manifests get stripped when platforms re-encode; the mitigation is **soft binding**: a watermark in the content acts as a persistent pointer to an external manifest repository, resolved via a standardized Soft Binding Resolution API. C2PA certifies *origin*; it does not track *consumption* by AI systems, and it does not detect fakes — it documents authentic provenance so absence-of-credentials becomes the signal.

### 1.2 Regulatory tailwind (why building this now is strategic, not just principled)
- **EU AI Act Article 50**: AI-generated/manipulated content must be "marked in a machine-readable format" and detectable as such. **Enforcement begins August 2, 2026** — i.e., already in force as of this writing. Penalties up to €15M or 3% of global turnover. The EU's draft Code of Practice on AI-Generated Content (Dec 2025; final expected mid-2026) explicitly recommends C2PA Content Credentials.
- **California SB 942** requires machine-readable disclosure of AI-generated content; the **U.S. Digital Authenticity and Provenance Act (2025)** mandates content provenance measures. Library of Congress formed a C2PA working group (2025).
- Net: a platform where every asset carries signed provenance from birth is *ahead* of compliance that most platforms are scrambling to retrofit. AI-generated GROWTH content (entity dialogue, generated art, GM output) already needs machine-readable marking in the EU. The ledger isn't just ethics — it's the compliance layer.

### 1.3 Training Data Attribution / TDA (influence attribution — the research frontier)
- The question: "which training data influenced this output, and how much?" Methods, in rough order of maturity:
  - **Influence functions** (Koh & Liang 2017) — the theoretical foundation; Anthropic has scaled variants to large models. Accurate-ish, brutally expensive per query.
  - **TRAK** (Park et al.) — scalable approximation using random projections.
  - **DataInf** (Kwon et al.) — attribution for **LoRA-tuned** models specifically. Directly relevant if GROWTH ever fine-tunes per-entity adapters (doc 1 §7): attribution over a small adapter's training set is tractable in a way whole-model attribution is not.
  - **WASA** — watermarks embedded in LLM-generated text that identify the source data. 
- Survey of adoption (arxiv 2501.12642): efficient TDA at scale would enable a **micropayment/royalty system** where creators are paid proportional to measured influence on outputs — the Spotify model for training data — as an alternative or supplement to upfront licensing deals (Google–Reddit, OpenAI–Dotdash). Currently blocked on cost and on unsettled fair-use litigation; a landmark ruling against unlicensed training would make influence-based royalties suddenly very attractive to labs.
- **GROWTH's advantage:** platform-native creation means influence can often be *recorded* rather than *estimated*. When an entity's output retrieves specific memories, when a generator conditions on specific assets, the ingredients are known at generation time. Log them. Estimation (TDA) is the fallback for the blended cases, not the primary mechanism.

### 1.4 Data provenance auditing & consent registries
- **Data Provenance Initiative**: audited 1,800+ text datasets, found widespread **license misattribution** — the cautionary tale for sloppy ledgers. Their follow-up argues for comprehensive data transparency frameworks; a Compliance Rating Scheme (CRS) exists for scoring dataset transparency.
- **DECORAIT**: decentralized opt-in/opt-out registry for AI training consent. **PLUS Coalition**: standardized picture licensing metadata. **ODRL** (W3C Open Digital Rights Language): machine-readable rights/permissions expression — the vocabulary for "this asset may be remixed in-world but not used for external model training."
- **Sovereign Context Protocol** (arxiv 2603.27094): attribution layer ensuring data *access* is attributed before content ever reaches a model — consumption tracking, complementary to C2PA's origin certification.
- **ISCC** (International Standard Content Code): content-derived identifiers — an asset's ID computed from the asset itself, so the same work gets the same ID regardless of where it travels. Useful as GROWTH's canonical asset key alongside platform UUIDs.
- **SLSA + Sigstore**: software-supply-chain attestation extended to AI artifacts — verifiable records of model training pipelines, fine-tune steps, deployment lineage. Relevant when GROWTH ships per-entity LoRA adapters: each adapter should carry a signed attestation of what data trained it.

### 1.5 EKILA (the closest existing blueprint to GROWTH's ambition)
- Academic framework (CVPR workshop, Adobe-affiliated) that fuses the layers: **C2PA manifests for creation provenance + NFTs for dynamic ownership + tokenized rights**, forming an Ownership-Rights-Attribution (ORA) triangle, plus a **visual attribution model** matching generated outputs back to training images, with **wallet addresses in training-asset metadata for royalty receipt**.
- Payment info embedded immutably at creation-time; C2PA metadata links to the NFT so current ownership (which changes post-creation) is resolvable for royalty routing.
- GROWTH's KRMA economy is structurally this: creation provenance + transferable ownership + rights + attribution-driven reward, in a game economy instead of an art market. Read EKILA before finalizing KRMA's attribution mechanics: arxiv.org/abs/2304.04639.

---

## 2. GROWTH Ledger — Design Recommendations

### 2.1 The record: one manifest per creative act
Adopt C2PA's shape even where the spec doesn't fit natively (text, game objects):
```
{
  asset_id:        ISCC-style content hash + platform UUID
  created_at:      timestamp
  creator:         principal ID (human player | AI entity | hybrid)
  creator_kind:    human | ai | composite   (IPTC digital source type vocabulary)
  tool/model:      generator + version (for AI: model, entity, adapter version)
  ingredients:     [asset_ids consumed/conditioned on]   ← the dependency graph
  memory_refs:     [entity memory IDs retrieved during generation]  (AI acts only)
  rights:          ODRL expression (remix? external AI training? commercial?)
  owner:           current owner pointer (mutable — separate register, not the manifest)
  signature:       platform key, and creator key where users hold keys
}
```
- **Ingredients are the whole game.** Every derived work points at parents → the ledger is a DAG of creation. Attribution queries become graph traversals ("all ancestors of this asset, weighted by depth"), not ML estimation.
- **Creator_kind matters legally**: EU Art 50 needs the AI-generated flag machine-readable; C2PA's composite type covers human-AI collaboration, which is most of what a tabletop platform produces.
- **Ownership lives outside the manifest** (EKILA's flexible model): creation facts are immutable; ownership changes. Manifest carries a stable pointer into the ownership register.

### 2.2 The ledger substrate
- Requirement is **tamper-evidence + verifiability**, not necessarily blockchain. A signed, hash-chained append-only log (Merkle tree, transparency-log style — the Certificate Transparency / Sigstore pattern) gives tamper-evidence at ~zero marginal cost and no chain dependency. Add a public chain anchor (periodic Merkle root checkpointing) only if/when external auditability or KRMA's economics demands third-party trust.
- Sign asset manifests so they survive **export**: content leaving GROWTH (a shared image, an exported story) should carry its Content Credentials with it — this is where actual C2PA conformance pays off, and where soft-binding watermarks cover platforms that strip metadata.

### 2.3 Unifying with the entity-memory provenance (doc 1)
These are the same ledger at different grain:
- Entity memory: engine-authored observations, reflections citing evidence — provenance of *belief*.
- Creation ledger: manifests citing ingredients — provenance of *artifact*.
- Bridge them: when an entity's creative act (a ruling, a story beat, generated dialogue) becomes a platform asset, its manifest's `memory_refs` point into the entity's memory stream. Then "why did Brannis say that?" and "who contributed to this story?" are the *same query* against connected graphs. No other platform has this, because no other platform controls both layers.

### 2.4 Attribution → KRMA
- **Recorded influence first**: ingredient-graph traversal with decay-by-depth gives deterministic, auditable attribution shares for the common case. Cheap, explainable, disputable.
- **Estimated influence second**: reserve TDA-style estimation (DataInf if using LoRA adapters) for blended cases where conditioning wasn't itemizable.
- Distribution model: Spotify-style pooled micropayments proportional to influence share is the literature's convergent answer. Decide early whether influence decays with graph distance and whether it expires — these choices define the economy's long-term shape and are nearly impossible to change once creators have earnings expectations.

### 2.5 Rights & consent from day one
- Every asset carries an ODRL-expressible rights statement at creation, including the **AI-training bit** — may this asset enter entity memory consolidation / any future fine-tuning corpus? That single flag, recorded from birth, is what the entire outside world is fighting about right now because nobody recorded it. GROWTH recording it makes the platform's own future model-training provably consensual — and makes the ledger the thing that lets GROWTH's entities pay their sources.

---

## 3. What's Genuinely Unsolved (open lanes)
- **Text provenance** is the weak spot of every standard — C2PA is media-first, watermarking text (WASA-style) is fragile. A platform where text is born inside the system and never needs embedded metadata (the ledger IS the metadata) sidesteps this; publishing that pattern would be a contribution.
- **TDA at consumer cost** — nobody can do per-output influence attribution cheaply on large models. GROWTH's recorded-ingredients approach is the workaround, and demonstrating a working influence-royalty economy at any scale would be novel; the literature explicitly says such systems are "plausible and feasible" but essentially unbuilt.
- **Cross-platform survival** — manifests stripped on re-upload; soft-binding infrastructure is young. Watch the C2PA conformance program.
- **Dynamic ownership + rights at game speed** — EKILA sketched it for art markets; nobody has run ORA-style attribution inside a live economy with thousands of small acts per session. That's KRMA's lane.

---

## 4. Build Order
1. **Manifest-at-creation** for every asset, with ingredients + creator_kind + rights bits. Schema first; it's the part you can't retrofit (the Data Provenance Initiative's 1,800-dataset misattribution audit is what retrofit looks like).
2. **Hash-chained transparency log** for tamper-evidence. Defer chain anchoring until economics demands it.
3. **ISCC-style content IDs** as canonical keys.
4. **Bridge to entity memory_refs** (doc 1 provenance rules must land first).
5. **Ingredient-graph attribution queries** → KRMA share calculation, deterministic path first.
6. **C2PA-conformant export signing** for content leaving the platform → EU AI Act Art 50 compliance for free.
7. **TDA estimation layer** (DataInf on adapters) only after 1–6, only for the blended cases.

## 5. Key Links
- C2PA spec & FAQ: c2pa.org (spec v2.3, Feb 2026)
- EKILA (C2PA+NFT+royalties): arxiv.org/abs/2304.04639
- Content ARCs (decentralized rights survey): arxiv.org/abs/2503.14519
- TDA adoption & royalties analysis: arxiv.org/abs/2501.12642
- Sovereign Context Protocol (consumption attribution): arxiv.org/abs/2603.27094
- AI agent identity/provenance standards survey (C2PA, SLSA, Sigstore in agent context): arxiv.org/abs/2604.23280
- ODRL: w3.org/ns/odrl/2/ · ISCC: iscc.codes · Data Provenance Initiative: dataprovenance.org
