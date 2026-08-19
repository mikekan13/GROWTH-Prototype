# Material Physics → Resist Model

**Source of truth:** `app/scripts/material-physics.ts` (run `npx tsx scripts/material-physics.ts` from `app/`)
**Status:** Calibrated 2026-08-19 against seeded stock (`app/scripts/content/modern-earth/materials.ts`) + `GRO.WTH Repository/07_REFERENCE_TABLES/Complete_Materials_Reference.md`. Stock supersedes the old repo table where they conflict.
**Result:** 41 canon anchors — 29 PASS (±2), 2 PASS* (±3), 10 TRAIT-EXPLAINED, **0 unexplained FLAGs**.

## Design principle (Mike ruling)

**One scalar + traits at every layer.** The resist number carries magnitude; material traits carry behavior. Where measured physics disagrees with a canon number, the residual is a *trait or form assignment*, not a formula failure — glass is hard but resist 2 (Brittle + thin pane carries it); leather 17 > bone 12 (Flexible absorbs, Brittle shatters). The calculator therefore emits a suggested trait set next to every number and labels each residual honestly.

Resist 1–50 is the mundane-physics band; 50+ is reserved for the supernatural.

## The model

All strength terms are **log-scale** (the 1–50 band spans ~4 orders of magnitude of real strength), and **energy-to-break is weighted alongside raw strength** per Mike's directive — that is what puts ductile leather over brittle bone.

### Hard solids (metals, minerals, bio-hard)

```
gate   = elong < 2%  ?  min(1, K_IC / K_GATE)  :  1
sigEff = max( tensile,  ALPHA_C[class] * compressive * gate )

R = K_STR   * ln(1 + sigEff / SIGMA_REF)     strength (MPa)
  + K_TOUGH * ln(1 + U / U_REF)              work of fracture (MJ/m^3)
  + K_KIC   * ln(1 + K_IC / KIC_REF)         crack resistance (MPa*sqrt(m))
  + K_HARD[class] * Mohs^2 * gate            indent/scratch hardness
  + K_DENS  * ln(max(1, density))            massiveness (lead, tungsten)
  + BASE[class]
```

The **brittleness gate** is the physical heart of the model: hardness and compressive capacity only earn resist if fracture toughness lets the material survive impact (K_IC ≥ 2 MPa·√m for full credit). Glass (K_IC 0.75) keeps only ~37% of its formidable hardness; bone (K_IC 3) keeps all of it.

### Other classes (class-aware weighting, per Mike's allowance)

| Class | Formula | Rationale |
|---|---|---|
| Wood | `5.2·ln(1 + MOR/20) + 2.8·density` | wood fails in bending (MOR); density ≈ Janka hardness |
| Polymer | `5.19·ln(1 + σt/25) + 3.06·ln(1 + U/5)` | polycarbonate's 14 vs acrylic's 8 is pure toughness |
| Composite | `11.7·ln(1 + σ_laminate/60)` | fiber-dominated; laminate strength already encodes toughness |
| Fabric | `14.4·ln(1 + σ_fiber/350) − 10`, floor 1 | fiber stopping power minus WEAVE_PENALTY (a weave parts around a point load) |
| Soft solid (leather/tissue) | `13.6·ln(1 + σ_eff/10)` | σ_eff = tensile × anisotropy (tendon: 0.15 — strong along, cut across) |
| Elastomer | same, σ_eff × 0.3 | ELASTOMER_RETURN: stored elastic energy is returned, not absorbed |

Result rounded, clamped [1, 50].

### Coefficients

| Name | Value | Meaning |
|---|---|---|
| K_STR / SIGMA_REF | 4.2 / 100 MPa | strength weight / log knee |
| K_TOUGH / U_REF | 0.8 / 2 MJ·m⁻³ | work-of-fracture weight / knee |
| K_KIC / KIC_REF | 0.9 / 1 MPa·√m | fracture-toughness weight / knee |
| K_GATE | 2 MPa·√m | brittleness gate threshold |
| K_HARD (metal / mineral / bio-hard) | 0.47 / 0.35 / 0.47 | × Mohs², gated |
| ALPHA_C (metal / mineral / bio-hard) | 0.35 / 0.30 / 0.30 | compressive strength credit |
| K_DENS | 1.4 | × ln(density) — massiveness |
| BASE_BIOHARD | 2.5 | hierarchical bio-composites out-toughen their constituents (Wegst & Ashby 2004) |
| WEAVE_PENALTY | 10 | woven sheet vs solid sheet |
| ELASTOMER_RETURN | 0.3 | rubber returns energy instead of absorbing it |

**Data honesty rule:** property values are typical literature values (MatWeb, ASM, FPL Wood Handbook, Callister, Wegst/Meyers/Currey for biologicals), cited per row in the script. Calibration iterates *coefficients only* — never the measured data.

## Calibration table (canon anchors)

| Material | Canon | Computed | Δ | Verdict | Suggested traits |
|---|---|---|---|---|---|
| Cotton (fabric) | 1 | 1 | 0 | PASS | Flexible 2, Flammable, Absorbent |
| Wool (fabric) | 1 | 1 | 0 | PASS | Flexible 2, Flammable, Absorbent, Cold Resistant |
| Denim | 2 | 2 | 0 | PASS | Flexible 2, Flammable |
| Canvas | 3 | 3 | 0 | PASS | Flexible 2, Flammable, Strong |
| Silk | 5 | 5 | 0 | PASS | Flexible 2, Flammable, Absorbent, Strong |
| Polyester (fabric) | 2 | 4 | +2 | PASS | Flexible 2, Strong |
| Nylon webbing | 5 | 6 | +1 | PASS | Flexible 2, Strong |
| Kevlar (panel stock) | 25 | 25 | 0 | PASS | Flexible 1, Strong, Heat Resistant, Protective |
| Hide (thick) | 12 | 12 | 0 | PASS | Flexible 2, Flammable, Absorbent |
| Leather (common) | 17 | 17 | 0 | PASS | Flexible 2, Flammable, Absorbent |
| Rubber (sheet) | 6 | 6 | 0 | PASS | Flexible 3, Electric Proof |
| Foam padding | 2 | 1 | −1 | PASS | Flexible 3, Flammable |
| PVC (rigid) | 5 | 10 | +5 | TRAIT | thin-wall pipe form factor (see outliers) |
| Acrylic (PMMA) | 8 | 8 | 0 | PASS | Fragile |
| Polycarbonate | 14 | 14 | 0 | PASS | — |
| Plywood | 8 | 7 | −1 | PASS | Flammable, Absorbent |
| Lumber, softwood | 10 | 10 | 0 | PASS | Flammable, Absorbent |
| Hardwood (oak/maple) | 12 | 11 | −1 | PASS | Flammable, Absorbent, Heat Resistant |
| Drywall | 3 | 1 | −2 | PASS | Fragile |
| Window glass | 2 | 9 | +7 | TRAIT | Fragile/Brittle + pane form (see outliers) |
| Stone, common (granite) | 16 | 16 | 0 | PASS | Fragile, Heat Resistant |
| Brick | 20 | 4 | −16 | TRAIT | deployed masonry mass (see outliers) |
| Concrete | 25 | 6 | −19 | TRAIT | deployed mass + rebar partnership (see outliers) |
| Obsidian | 20 | 5 | −15 | TRAIT | Sharp edge lore; physically volcanic glass |
| Quartz | 20 | 15 | −5 | TRAIT | gem lore premium; Brittle |
| Diamond | 23 | 50 | +27 | TRAIT | Brittle caps gems in play (see outliers) |
| Bone (cortical) | 12 | 12 | 0 | PASS | Brittle, Cold Resistant |
| Antler | 14 | 14 | 0 | PASS | Featherlight |
| Lead | 10 | 9 | −1 | PASS | Malleable, Blunt |
| Copper (soft, pipe/wire) | 12 | 19 | +7 | TRAIT | Malleable discount (see outliers) |
| Aluminum (6061-T6) | 15 | 16 | +1 | PASS | Featherlight, Electric Vulnerable |
| Brass (C360) | 18 | 21 | +3 | PASS* | Electric Vulnerable (copper-alloy discount) |
| Cast iron (gray) | 28 | 21 | −7 | TRAIT | Brittle + Heat Proof hearth premium (see outliers) |
| Steel, rebar/structural | 30 | 28 | −2 | PASS | Strong, Heat Resistant, Electric Vulnerable |
| Steel, low-carbon sheet | 35 | 27 | −8 | TRAIT | top of canon band 30–35 (see outliers) |
| Stainless (304) | 32 | 29 | −3 | PASS* | Malleable, Strong, Heat Resistant |
| Titanium (Ti-6Al-4V) | 34 | 36 | +2 | PASS | Strong, Featherlight, Heat/Cold Resistant |
| High-carbon steel (1080) | 38 | 39 | +1 | PASS | Strong, Heat Resistant, Sharp |
| Tungsten | 42 | 44 | +2 | PASS | Strong, Blunt, Heat Proof |
| Fiberglass (chopped GFRP) | 12 | 11 | −1 | PASS | Brittle |
| Carbon fiber (CFRP) | 28 | 28 | 0 | PASS | Brittle, Strong, Featherlight, Heat Resistant |

## Derived table (model predictions — no canon anchor existed)

| Material | Resist | Suggested traits |
|---|---|---|
| Flesh (skin+muscle+fat composite) | **3** | Flexible 2 |
| Skin (dermis) | **8** | Flexible 2 |
| Muscle | **1** | Flexible 2 |
| Fat (adipose) | **1** | Flexible 3, Cold Resistant |
| Organ tissue (parenchyma) | **1** | Flexible 2, Fragile |
| Brain | **1** | Flexible 2, Fragile |
| Cartilage (hyaline) | **5** | Flexible 1 |
| Sinew / Tendon | **12** | Flexible 1, Strong (aniso 0.15: strong along, cut across) |
| Bone (recompute) | **12** | Brittle — reproduces the canon anchor |
| Chitin (sclerotized cuticle) | **10** | Flammable, Featherlight |
| Scale (keratin) | **11** | Flammable, Protective |
| Ivory (dentin) | **12** | — |
| Shell (nacre) | **14** | Brittle, Protective |
| Horn (bulk keratin) | **13** | Flammable |
| Hardwood (recompute) | 11 | Flammable |
| Carbon Fiber (recompute) | 28 | Brittle, Strong, Featherlight |
| Aluminum (recompute) | 16 | Featherlight, Electric Vulnerable |
| Rubber (recompute) | 6 | Flexible 3, Electric Proof |

The bio ladder is physically coherent: brain/fat/organ/muscle 1 → flesh 3 → cartilage 5 → skin 8 → chitin 10 → scale 11 → bone/ivory/tendon 12 → horn 13 → shell 14. Leather (17) out-resisting bone (12) is real physics: work-of-fracture (energy to break) beats brittle hardness, exactly per the design directive.

## Flagged outliers & analysis

All ten residuals have a trait/form story — none required fudging property data:

1. **Window glass (canon 2, bulk physics ~9)** — the canonical trait-carried case (Mike ruling). K_IC 0.75 already strips 63% of its hardness credit via the gate; the rest is the *thin pane* form. Bulk glass block would honestly sit ~9 with Brittle.
2. **Brick (20 vs 4) & Concrete (25 vs 6)** — the biggest systematic finding. Canon prices **deployed masonry** (a mortared, massive wall — concrete with rebar partnership), not a hand sample; a single brick snaps under a hammer tap, but you don't punch through a wall. Recommendation: keep the canon numbers for stock (they encode the play experience of walls) and treat the gap as a **structure/form factor** at item level, not a material property. Worth a Mike ruling if raw-chunk masonry ever matters.
3. **Obsidian (20 vs 5)** — physically volcanic glass. Canon 20 prices the legendary knapped *edge* (Sharp, Unrepairable), not bulk resist.
4. **Diamond (23 vs clamp 50)** — Mohs 10 dominates any hardness model, but K_IC 3.4 means a hammer beats a diamond; canon caps all gems ~20–23 because **Brittle dominates play**. Deliberately trait-carried; same story for quartz (20 vs 15).
5. **Copper (12 vs 19)** — the old repo valued copper **22**; physics agrees with the repo (~19–22). The 2026 stock re-ruling to 12 reflects annealed plumbing/wire grade (yield ~70 MPa — it bends long before it breaks): a **Malleable** discount. Brass (18 vs 21) is the same copper-alloy discount at Δ3.
6. **Cast iron (28 vs 21)** — gray CI is weaker than mild steel in everything but compression (750 MPa) and its work-of-fracture is terrible (elong <1%). Canon 28 (old repo said 25) is a hearth-metal premium riding on Heat Proof; the Brittle trait already tells the true story.
7. **Low-carbon steel sheet (35 vs 27)** — the model lands the *rebar/structural* anchor at 28 (canon 30, PASS); the stock sheet entry sits at the top of the canon 30–35 band as a "default structural metal" premium. If ±2 on the sheet entry ever matters, the honest options are canon 32 or a Strong trait note — not coefficient torture that would break Ti/HC/W.
8. **PVC (5 vs 10)** — stock sells thin-wall *pipe*; bulk rigid uPVC genuinely out-toughs canon 5 (it's roughly nylon-webbing-solid grade). Form factor.
9. **Polyester bolt (2 vs 4)** — dress-weight commodity cloth dock; inside worst-case band anyway.

**Systematic conclusion:** the canon scale is an *intrinsic material* scale for metals, woods, polymers, fabrics, leathers, and bio materials (31/41 straight passes), but for masonry and gems it silently switches to a *deployed-form / lore* scale. The one-scalar+traits principle absorbs this cleanly — the trait/form column is where those stories live.

## Suggested-trait rules (deterministic, canon vocabulary)

- **Brittle / Fragile** — elong < 2% and K_IC < 2.5 (Fragile if also weak or low-resist); notch-brittle polymers (explicit K_IC < 1.5, elong < 5%).
- **Flexible N** — soft classes by elongation (≥100% → 3, ≥30% → 2, ≥10% → 1); fabrics floor at Flexible 2 (a weave drapes regardless of fiber strain; stiff aramid weave → 1).
- **Malleable** — metals with elong ≥ 40%.
- **Flammable / Absorbent** — organic / natural-fiber flags (mineralized bio like bone excluded).
- **Strong** — tensile ≥ 500 MPa or resist ≥ 25. **Blunt** — density ≥ 10.
- **Featherlight** — specific strength ≥ 100 MPa/(g/cc) with density ≤ 5 (Al, Ti, CFRP get it; steel and gems don't).
- **Heat Resistant / Proof, Electric Vulnerable / Proof** — per-material data hints (melting behavior, conductivity).
