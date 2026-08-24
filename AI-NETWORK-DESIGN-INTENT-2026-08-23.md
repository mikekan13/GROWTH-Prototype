# AI Network Design Intent — Privacy, Security, Anonymity (2026-08-23)

> Research synthesis compiled before the infra build. Sources: project docs/memories/code
> sweep, source-card dig (Mike's original conversations), and current model-landscape
> research. Written so the infrastructure discussion starts from Mike's actual intent,
> not a generic "model router" framing. Companion memory: `ai-network-design-intent`.

## THE MASTER FRAME

**"ATTRIBUTION INSIDE, ANONYMITY OUTSIDE."** (JEWL_Golden_Voice_Dataset_Seed.md:185-190)

Inside GROWTH, everything is perfectly attributable — signatures, ledgers, KRMA, witnessed
judgments. Outside GROWTH, everything is perfectly anonymous — JEWL-as-membrane reaches the
cloud as the aggregate, untraceable to any individual. "Accountable to each other, invisible
to the powers above." The fractal law: *legible to your own scale, opaque to the scale above.*

Two hard corollaries from the Thesis doc:
- **Architectural, not promised.** "Track the commons, not the person… 'trust us' is what
  every cage says." (Spine 2)
- **"The wall is WHERE PROCESSING HAPPENS, not a revocable policy."** A config flag that
  routes to Claude by default is not the wall.

**MIKE'S CORRECTION (verbal, 2026-08-23 — overrides Economy_Closeout:101):** the wall does
NOT require the model on the GM's machine. "The company has the servers and serverless that
acts as that." **"Local" = GROWTH-CONTROLLED COMPUTE** — our servers/serverless workers, our
weights, zero third-party retention — as opposed to third-party model APIs. Company-owned
serverless IS the local side of the wall, not a stepping stone toward it.

## THE THREE PILLARS, BY LAYER

### Privacy (player data)
- Sensitive personal content (trauma, abuse, grief, intimate, relationships, legal) never
  reaches cloud raw. `daya/sanitize.ts` already classifies + fail-closes local; WP6 spec:
  uncertain→sensitive, OOC destroyed in flight (`burnCheck()`).
- Maturity flags = router signal: mature-flagged generation → local lane (privacy + latitude).
- Boundary = DATA, not capability. JEWL keeps Claude for judgment; sensitive judgment goes
  to cloud only as a sanitized abstract.
- Source-card lineage: SC-0327/SC-0322 — dual-agent pattern, "a local model strips context
  before anything reaches the cloud"; three-tier sensitivity. Mike thinks in layered
  systems, not binary switches.
- INV-119: never send real names, emails, or account identifiers in cloud prompts.
- INV-120: minors' raw audio never leaving the device IS the compliance architecture.

### Security (platform)
- Layered classification PUBLIC / SECRET / FOUNDER-ONLY; founder-only prompt material lives
  in server files/env, never in campaign-queryable rows (CRITICAL_REVIEW:79).
- JEWL identity + wallet private at all layers (INV-69/70/72); mute = the privacy lever.
- Rutherford G4/G6: JEWL never adjudicates where his wallet has a stake; every judgment
  records an appeal path.
- SC-0431: modularity as security — multi-LLM beats a single LLM on risk surface.

### Anonymity (three distinct subjects — do not conflate)
1. **The player, from the cloud** — the router/membrane concern. Aggregation, not just
   redaction: queries escalate FROM JEWL, aggregated, untraceable to individuals.
2. **JEWL, from players** — "players see Copilot"; the mask is the point. Not a router
   concern; an app-layer invariant.
3. **Godheads, from each other** — in-game designed opacity: signatures are default
   attribution, proxy casting is the anonymity tool, stake visibility has deliberate GAPS
   (shadow proxy wars are a WANTED feature; observe effects, never raw wallets; disclosure
   only at lien cash-in; Terminal/ADMIN sees all). **Infrastructure must not instrument
   this away** — full observability here would defeat designed information gaps.
- Personal register: Mike's own practice is pseudonymity (SC-0492); biography encoded
  behind esoteric mechanics (SC-0061).

### Anti-censorship (the OLDEST pillar — Feb 2024, SC-0508)
- "The biggest problem is the censorship from gpt. Tabletop often has lots of violence,
  sexuality, and exploration of morality." Open-weight models evaluated from day one
  specifically to escape commercial-LLM censorship.
- Platform policy (SC-0385): "how you play the game won't be censored." GM-led tables,
  player-side opt-in filters — labels, not gatekeeping.
- Image gen chosen for being the best UNRESTRICTED local model runnable (SC-1182/83).

### Anti-corporate ownership (context the infra serves)
- "People that play GROWTH own GROWTH" (SC-0384); no CEOs (SC-0377); Lady Death endgame =
  designed obsolescence, "the ultimate act of decentralization" (SC-0264, SC-1091).
- SC-1150: P2P network for AI compute; SC-0845: Godheads allocating compute by public
  interest, not money.

## TENSIONS THE ORIGINAL "5-LANE ROUTER" FRAMING MISSED

1. **Anonymity ≠ redaction.** Sanitize tokenizes per-call (PERSON_A); doctrine wants
   aggregation at a membrane. Lane selection cannot produce membrane anonymity.
2. **The wall is placement, not policy.** All-lanes-on-Claude with a local "option"
   satisfies routing, violates architecture.
3. **Caller-disciplined classification is not structural.** `identifiers`/`rawKeys` are
   caller-supplied; an omitted name silently reclassifies content as safe.
4. **Designed opacity is a feature.** Router observability must stop at the layer where
   in-game information gaps begin.
5. **Three anonymity subjects, one router.** Only player-from-cloud is a router concern.
6. ~~The hardware floor is doctrine~~ **RESOLVED by Mike's 2026-08-23 correction**: company
   serverless = the local side; no GM-machine requirement. The STT/audio packaging decision
   (CRITICAL_REVIEW:67) remains open but likewise resolves to company-controlled compute.
   Note: INV-120 (minors' raw audio never leaving the DEVICE) may still be the stricter
   standard for audio specifically — worth one confirm with Mike.
7. **Two lane systems exist unreconciled**: WP6 (sensitivity/skill/pool-state) vs the
   maturity-flag router. They must merge into one law.

## TARGET DIVISION OF COGNITION (Mike ruling, 2026-08-23)

> "We are working towards the local part to have our own model eventually. First step
> is this and then finetuning one. But we want the growth rules and canvas driving and
> all that to be local. Really the reach outs for Claude would be heavy lifting —
> simulation calculations, psychology profiling, Godhead game balance logic deciding
> etc. Running the company decisions etc."

**LOCAL (the game runtime — the destination for ALL of it):** GROWTH rules operation,
canvas driving, JEWL's moment-to-moment tool orchestration, persona/voice, work
cycles, sensitive + mature content. This is a higher bar than off-the-shelf 27B
tool-calling — which is exactly why the roadmap is: (1) stand up the open model
(Qwen3.8-27B lane), (2) **fine-tune a GROWTH-native model** on it, (3) eventually a
fully owned model. A model fine-tuned on GROWTH rules + canvas traces closes the
multi-step orchestration gap that generic open models have vs Sonnet.

**CLAUDE (episodic heavy cognition, through the membrane):** simulation calculations,
psychology profiling, Godhead game-balance adjudication, company/strategy decisions.
Low-frequency, chunky, high-value consults — the shape the sanitize/aggregate membrane
is designed for. NOT the per-action workhorse.

**Consequence — training-data capture starts NOW:** every Claude dispatch during the
dev era (full tool-loop traces: context → tool calls → results → outcome) is
distillation corpus for the fine-tune. The router build should log traces in a
training-usable format from day one, tagged with maturity/privacy flags so the
training set respects the same wall. The dev-time Claude era isn't just scaffolding —
it's the teacher generating the curriculum.

## MODEL LANDSCAPE (as of 2026-08-23)

**Recommended: `huihui-ai/Huihui-Qwen3.8-27B-abliterated`** (base Qwen/Qwen3.8-27B,
released Aug 13-14, verified Apache-2.0; abliteration Aug 18).
- Gains vs incumbent Qwen3.6-27B-abliterated: 262k native context (vs 32k pin), official
  FP8 checkpoint (Qwen3.8-27B-FP8), hybrid linear attention (48/64 linear → ~377k KV
  tokens at FP8 in 80GB), in-checkpoint MTP speculative decoding, vision input, stronger
  tool-use/agentic benchmarks. vLLM recipe published (`--reasoning-parser qwen3
  --enable-auto-tool-choice --tool-call-parser qwen3_coder` — parser changes from hermes).
- Caveats: abliteration 5 days old, thin community validation, no creative-writing bench
  yet, needs transformers ≥5.8. **Smoke-test against 3.6 before cutover; 3.6 stays on the
  volume as proven fallback.**
- Ruled out: Meta Muse Glimmer 30B (Apache-2.0, best tool-use, but heavily censored, no
  trustworthy ablation), Mistral Small 4 (RP-favorite lineage, weaker tools, no verified
  ablation), Gemma 4 26B MoE (license prohibited-use policy — fails hard license rule),
  GLM 5.x (MIT but 745B — cannot fit 80GB).

## INFRA STATE AT WRITING

- H100 pod `iucnxl51ddxzpq` RETIRED 2026-08-23 (Mike-approved). Volume `o5y6of5tje`
  (200GB, US-NE-1) alive: portrait stack + qwen36-27b weights intact.
- Portraits: serverless `qr4r1dkgw3uyhf`, scale-to-zero, unchanged.
- Text lanes: ALL Claude today. Serverless text endpoint ON HOLD pending discussion.
- Prompt caching live in JEWL path (claude-tools.ts) only; DAYA Claude calls uncached.
- A real router + sanitize + metering already exists in `app/src/daya/` serving only DAYA;
  JEWL/copilot/QoL bypass it via four independent Anthropic clients.

## OPEN DISCUSSION POINTS (for Mike, one at a time)

1. ~~Placement of the "local" lane~~ **RESOLVED 2026-08-23: company serverless IS the
   local side** (Mike's correction above). RunPod serverless with our weights = the wall's
   inner face for beta; longer-term hardening (own metal / confidential computing) is an
   upgrade of the same position, not a relocation.
2. **Membrane aggregation** — what does "reaches the cloud as the aggregate" mean
   concretely for beta? (Batching? De-identified pooled queries? Per-campaign JEWL voice?)
3. **Structural identifier stripping** — move INV-119 enforcement into the chokepoint
   (schema-level, not caller-supplied).
4. **Reconciling WP6 lanes with maturity-flag routing** into one law.
5. Model cutover: smoke-test plan for Qwen3.8 ablation vs 3.6.
