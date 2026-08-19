/**
 * material-physics.ts — physics-derived Material Resist calculator (1-50 mundane band)
 *
 * Run:  npx tsx scripts/material-physics.ts   (from app/; standalone — no DB, no server imports)
 *
 * PURPOSE
 * Mike derived the paper-GROWTH material resist numbers from real measured
 * properties. This script formalizes that into a reproducible, calibrated
 * model: real property data in → resist 1-50 out, calibrated against the
 * settled canon anchors (seeded stock in scripts/content/modern-earth/
 * materials.ts, which supersedes the older Complete_Materials_Reference.md
 * where they conflict — e.g. Copper: stock 12, old repo 22).
 *
 * DESIGN PRINCIPLE (Mike ruling): ONE SCALAR + TRAITS at every layer.
 * The resist number carries magnitude; traits (Brittle, Flexible N,
 * Flammable, ...) carry behavior. Where physics disagrees with canon the
 * residual is usually a TRAIT assignment (glass is hard but canon 2 —
 * Brittle + thin-pane form carries it), so every row also emits a
 * suggested trait set, and residuals are labeled PASS / TRAIT-EXPLAINED /
 * FLAG rather than silently absorbed.
 *
 * MODEL (class-aware, per Mike's allowance for Soft/Hard weighting)
 * All strength terms are log-scale (resist perception is logarithmic —
 * 1-50 spans cotton..tungsten, ~4 orders of magnitude in strength).
 * Energy-to-break (work of fracture U, fracture toughness K_IC) is
 * deliberately weighted alongside raw strength per Mike's directive.
 *
 * HARD solids (metals, minerals, bio-hard):
 *   gate  = elong < 2%  ? min(1, K_IC / K_GATE) : 1        // brittleness gate:
 *           hardness & compressive capacity only count if the material can
 *           survive impact loading without shattering
 *   sigEff = max( tensile, ALPHA_C * compressive * gate )   // compression
 *           helps resist crushing, at reduced weight (ALPHA_C per class)
 *   R = K_STR   * ln(1 + sigEff / SIGMA_REF)                // strength term
 *     + K_TOUGH * ln(1 + U / U_REF)                         // work of fracture (MJ/m^3)
 *     + K_KIC   * ln(1 + K_IC / KIC_REF)                    // crack resistance
 *     + K_HARD[class] * Mohs^2 * gate                       // scratch/indent hardness
 *     + K_DENS  * ln(max(1, density))                       // massiveness (lead, tungsten)
 *     + BASE[class]
 *
 * WOOD:        R = KW_STR * ln(1 + MOR/20) + KW_DENS * density
 *              (MOR = modulus of rupture in bending — how wood actually fails;
 *               density stands in for Janka hardness, to which it is ~linear)
 * POLYMER:     R = KP_STR * ln(1 + tensile/25) + KP_TOUGH * ln(1 + U/5)
 * COMPOSITE:   R = KC_STR * ln(1 + laminate tensile/60)
 *              (fiber-dominated; laminate strength already encodes toughness)
 * FABRIC:      R = KF_STR * ln(1 + fiberTensile/350) - WEAVE_PENALTY  (floor 1)
 *              (a woven sheet resists with fiber stopping power minus the
 *               freedom of the weave to part; silk 5 vs kevlar 25 shows canon
 *               tracks fiber strength, not fiber toughness, for fabrics)
 * SOFT solids (leather/hide/tissue/elastomer):
 *              R = KS_STR * ln(1 + sigEff/10)
 *              sigEff = tensile * anisotropy (aligned-fiber bio like tendon
 *              is strong along the axis but cut easily across: aniso 0.15)
 *              and    * ELASTOMER_RETURN for rubbers (elastically stored
 *              energy is returned, not absorbed).
 *
 * Result rounded and clamped to [1, 50]. 50+ is the supernatural band.
 *
 * DATA HONESTY: property values are typical literature values (MatWeb,
 * Engineering ToolBox, Ashby, Callister, Wegst/Meyers for biologicals),
 * cited per row. Calibration iterates COEFFICIENTS only — never the data.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Coefficients (named; tuned against canon anchors — see docs/material-physics.md)
// ─────────────────────────────────────────────────────────────────────────────

const C = {
  // HARD solids
  K_STR: 4.2, // strength weight
  SIGMA_REF: 100, // MPa — strength log knee
  K_TOUGH: 0.8, // work-of-fracture weight
  U_REF: 2, // MJ/m^3 — toughness log knee
  K_KIC: 0.9, // fracture-toughness weight
  KIC_REF: 1, // MPa*sqrt(m)
  K_GATE: 2, // MPa*sqrt(m) — below this, brittle solids lose hardness credit
  K_DENS: 1.4, // massiveness weight
  K_HARD_METAL: 0.47, // x Mohs^2
  K_HARD_MINERAL: 0.35, // x Mohs^2 (minerals lean on gated hardness)
  K_HARD_BIOHARD: 0.47, // x Mohs^2
  ALPHA_C_METAL: 0.35, // compressive credit
  ALPHA_C_MINERAL: 0.3,
  ALPHA_C_BIOHARD: 0.3,
  BASE_BIOHARD: 2.5, // hierarchical bio-composites (bone/antler) toughen beyond
  // what their raw constituents measure (Wegst & Ashby 2004)
  // WOOD
  KW_STR: 5.2,
  KW_MOR_REF: 20, // MPa
  KW_DENS: 2.8, // x density (g/cc) — density ~ Janka hardness proxy
  // POLYMER
  KP_STR: 5.19,
  KP_SIGMA_REF: 25,
  KP_TOUGH: 3.06,
  KP_U_REF: 5,
  // COMPOSITE
  KC_STR: 11.7,
  KC_SIGMA_REF: 60,
  // FABRIC
  KF_STR: 14.4,
  KF_SIGMA_REF: 350, // MPa — everyday natural fiber strength
  WEAVE_PENALTY: 10, // a weave parts around a point load; solid sheets don't
  // SOFT solids
  KS_STR: 13.6,
  KS_SIGMA_REF: 10,
  ELASTOMER_RETURN: 0.3, // rubber returns stored energy instead of absorbing it
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Material data
// ─────────────────────────────────────────────────────────────────────────────

type Cls =
  | 'metal'
  | 'mineral'
  | 'biohard'
  | 'wood'
  | 'polymer'
  | 'composite'
  | 'fabric'
  | 'leather' // soft solid sheet (leather/hide/skin/tissue)
  | 'tissue'
  | 'elastomer';

interface Mat {
  name: string;
  cls: Cls;
  /** tensile strength, MPa (for fabric: FIBER tensile; for wood: MOR bending) */
  tensile: number;
  /** compressive strength, MPa */
  compressive?: number;
  /** fracture toughness K_IC, MPa*sqrt(m) */
  kic?: number;
  /** work of fracture / tensile toughness U, MJ/m^3 (~0.5*(sig_y+sig_u)*strain) */
  u?: number;
  /** elongation at break, % */
  elong: number;
  /** Mohs hardness */
  mohs?: number;
  /** density, g/cc */
  density: number;
  /** anisotropy factor for aligned-fiber bio (transverse cut weakness) */
  aniso?: number;
  /** canon anchor resist (calibration rows only) */
  canon?: number;
  /** if physics and canon disagree, the trait/form story that carries it */
  traitNote?: string;
  /** extra suggested traits beyond the rule-derived ones */
  hints?: string[];
  /** organic → Flammable; natural fiber/leather/wood → Absorbent */
  organic?: boolean;
  absorbent?: boolean;
  /** heat behavior override: 'res' | 'proof' */
  heat?: 'res' | 'proof';
  /** electrically conductive metal */
  conductive?: boolean;
  /** data citation */
  cite: string;
}

// ── Calibration set (canon anchors; stock values supersede old repo table) ──
const CALIBRATION: Mat[] = [
  // Fabrics — fiber tensile MPa (Morton & Hearle; DuPont Kevlar data sheet)
  { name: 'Cotton (fabric)', cls: 'fabric', tensile: 400, elong: 7, density: 1.54, canon: 1, organic: true, absorbent: true, cite: 'cotton fiber 287-597 MPa, elong 7%' },
  { name: 'Wool (fabric)', cls: 'fabric', tensile: 175, elong: 35, density: 1.31, canon: 1, organic: true, absorbent: true, hints: ['Cold Resistant'], cite: 'wool fiber 150-200 MPa, elong 25-45%' },
  { name: 'Denim (heavy cotton)', cls: 'fabric', tensile: 450, elong: 7, density: 1.54, canon: 2, organic: true, cite: 'cotton fiber, heavy 2/1 twill construction' },
  { name: 'Canvas (heavy cotton/hemp)', cls: 'fabric', tensile: 500, elong: 6, density: 1.5, canon: 3, organic: true, cite: 'cotton duck / hemp fiber 550-900 MPa blend, tight plain weave' },
  { name: 'Silk (fabric)', cls: 'fabric', tensile: 650, elong: 18, density: 1.3, canon: 5, organic: true, absorbent: true, cite: 'Bombyx mori silk 500-740 MPa, elong 15-25%' },
  { name: 'Polyester (fabric)', cls: 'fabric', tensile: 550, elong: 15, density: 1.38, canon: 2, traitNote: 'computed 4 vs canon 2: canon docks commodity PET cloth (thin dress-weight bolt); PASS at worst-case band', cite: 'PET fiber 400-700 MPa' },
  { name: 'Nylon webbing', cls: 'fabric', tensile: 700, elong: 20, density: 1.14, canon: 5, cite: 'nylon 6,6 industrial fiber 600-900 MPa' },
  { name: 'Kevlar (aramid panel stock)', cls: 'fabric', tensile: 3620, elong: 3.6, density: 1.44, canon: 25, heat: 'res', hints: ['Protective'], cite: 'Kevlar 29 fiber 3620 MPa, elong 3.6% (DuPont)' },

  // Soft solids — leather family (Kanagy; tanning literature)
  { name: 'Hide (thick, rawhide)', cls: 'leather', tensile: 15, elong: 30, density: 0.95, canon: 12, organic: true, absorbent: true, cite: 'rawhide/thick hide 10-20 MPa' },
  { name: 'Leather (common, veg-tan)', cls: 'leather', tensile: 25, elong: 40, density: 0.95, canon: 17, organic: true, absorbent: true, cite: 'veg-tanned bovine leather 20-30 MPa, elong 30-60%' },

  // Elastomers / foams
  { name: 'Rubber (vulcanized sheet)', cls: 'elastomer', tensile: 20, elong: 450, density: 1.1, canon: 6, hints: ['Electric Proof'], cite: 'vulcanized NR 15-25 MPa, elong 300-600%' },
  { name: 'Foam padding (PU)', cls: 'elastomer', tensile: 0.35, elong: 150, density: 0.05, canon: 2, organic: true, cite: 'flexible PU foam 0.1-0.5 MPa' },

  // Polymers (MatWeb typical, rigid grades)
  { name: 'PVC (rigid)', cls: 'polymer', tensile: 52, u: 12, kic: 3.5, elong: 30, density: 1.4, canon: 5, traitNote: 'computed ~10 vs canon 5: stock is thin-wall PIPE — form factor, not bulk PVC; bulk uPVC really is tougher than canon 5', cite: 'uPVC 45-55 MPa, elong 25-80%, K_IC 2-4' },
  { name: 'Acrylic (PMMA sheet)', cls: 'polymer', tensile: 70, u: 2, kic: 1.1, elong: 4, density: 1.18, canon: 8, cite: 'PMMA 65-75 MPa, elong 2-5%, K_IC 0.7-1.6' },
  { name: 'Polycarbonate (sheet)', cls: 'polymer', tensile: 65, u: 50, kic: 3.2, elong: 110, density: 1.2, canon: 14, cite: 'PC 60-70 MPa, elong 80-150% (impact champion), K_IC 2.2-3.5' },

  // Woods (FPL Wood Handbook: MOR bending, 12% MC)
  { name: 'Plywood (softwood sheet)', cls: 'wood', tensile: 40, elong: 2, density: 0.55, canon: 8, organic: true, absorbent: true, cite: 'structural plywood MOR 30-50 MPa' },
  { name: 'Lumber, softwood (pine/fir)', cls: 'wood', tensile: 85, elong: 3, density: 0.5, canon: 10, organic: true, absorbent: true, cite: 'loblolly pine MOR 88 MPa, doug fir 85 MPa' },
  { name: 'Hardwood (oak/maple)', cls: 'wood', tensile: 100, elong: 3, density: 0.75, canon: 12, organic: true, absorbent: true, heat: 'res', cite: 'white oak MOR 105 MPa, sugar maple 109 MPa, rho 0.68-0.75' },

  // Minerals / masonry / glass (Callister; ACI; Engineering ToolBox)
  { name: 'Drywall (gypsum board)', cls: 'mineral', tensile: 1.5, compressive: 5, kic: 0.1, u: 0.005, elong: 0.5, mohs: 2, density: 0.7, canon: 3, hints: ['Fragile'], cite: 'gypsum core ~1-2 MPa tensile, 4-6 MPa compressive' },
  { name: 'Window glass (soda-lime)', cls: 'mineral', tensile: 40, compressive: 1000, kic: 0.75, u: 0.01, elong: 0, mohs: 5.5, density: 2.5, canon: 2, traitNote: 'computed ~9 (bulk) vs canon 2: Brittle + thin-pane form carries it — the canonical example of trait-carried resist (Mike ruling)', cite: 'practical tensile 30-60 MPa, compressive ~1000, K_IC 0.7-0.8' },
  { name: 'Stone, common (granite)', cls: 'mineral', tensile: 15, compressive: 170, kic: 1.7, u: 0.06, elong: 0.3, mohs: 6.5, density: 2.7, canon: 16, cite: 'granite: tensile 10-20 MPa, compressive 130-200, K_IC 1-2, Mohs 6-7' },
  // Masonry RE-GRADED 2026-08-19 (Mike ruling on the flagged outlier): the
  // material number is now the substance's physics; the old 20/25 priced the
  // deployed wall, which lives at ITEM level (buildings.ts Foundation & Frame
  // baseResist 20 etc.). Stock catalog + DB updated the same day.
  { name: 'Brick (fired clay)', cls: 'mineral', tensile: 2.8, compressive: 35, kic: 1.0, u: 0.01, elong: 0.2, mohs: 3.5, density: 1.9, canon: 4, cite: 'fired clay brick: compressive 20-80 MPa, tensile ~2-4' },
  { name: 'Concrete (cured, normal)', cls: 'mineral', tensile: 3.5, compressive: 35, kic: 1.2, u: 0.015, elong: 0.15, mohs: 4, density: 2.4, canon: 6, cite: 'normal concrete: f\'c 30-40 MPa, tensile 3-5, K_IC 0.8-1.4' },
  { name: 'Obsidian', cls: 'mineral', tensile: 50, compressive: 130, kic: 0.4, u: 0.01, elong: 0, mohs: 5.5, density: 2.4, canon: 20, traitNote: 'computed ~5 vs canon 20: obsidian IS volcanic glass — physically near window glass. Canon 20 prices the legendary knapped EDGE (Sharp), not bulk resist', hints: ['Sharp', 'Unrepairable'], cite: 'volcanic glass: K_IC 0.3-0.5, Mohs 5-5.5' },
  { name: 'Quartz (crystal)', cls: 'mineral', tensile: 48, compressive: 1100, kic: 1.0, u: 0.02, elong: 0, mohs: 7, density: 2.65, canon: 20, traitNote: 'computed ~14 vs canon 20 (old repo, gem row): canon gem pricing adds lore premium; Brittle carries behavior', cite: 'quartz: Mohs 7, compressive ~1100 MPa, K_IC ~1.0' },
  { name: 'Diamond', cls: 'mineral', tensile: 2800, compressive: 110000, kic: 3.4, u: 0.5, elong: 0, mohs: 10, density: 3.5, canon: 23, traitNote: 'computed clamps to 50 vs canon 23: hardest natural material but LOW toughness — canon caps all gems ~20-23 because Brittle dominates play (a hammer beats a diamond). Trait-carried by design', cite: 'Mohs 10, K_IC 3.4, compressive ~110 GPa (indentation)' },

  // Bio-hard (Wegst & Ashby 2004; Currey, Bones)
  { name: 'Bone (cortical)', cls: 'biohard', tensile: 130, compressive: 170, kic: 3, u: 3, elong: 1.5, mohs: 2.5, density: 1.9, canon: 12, hints: ['Cold Resistant'], cite: 'cortical bone: tensile 100-150 MPa, compressive 150-200, K_IC 2-5' },
  { name: 'Antler', cls: 'biohard', tensile: 180, compressive: 150, kic: 7, u: 8, elong: 3, mohs: 2.5, density: 1.7, canon: 14, cite: 'antler: wetter collagen-rich bone, K_IC 6-8 (tougher than bone), tensile ~180' },

  // Metals (MatWeb / ASM typical; Mohs per mineralogical convention for metals)
  { name: 'Lead (ingot)', cls: 'metal', tensile: 18, u: 8, kic: 12, elong: 50, mohs: 1.5, density: 11.34, canon: 10, hints: ['Blunt'], cite: 'pure Pb: 12-18 MPa, elong 30-60%, Mohs 1.5, rho 11.34' },
  { name: 'Copper (pipe/wire, soft)', cls: 'metal', tensile: 220, u: 80, kic: 100, elong: 45, mohs: 3, density: 8.96, canon: 12, conductive: true, traitNote: 'computed ~19 vs canon 12: old repo valued copper 22 — physics agrees with the REPO. Stock re-ruled 12 for annealed plumbing/wire grade (yield ~70 MPa, bends long before breaking): Malleable/Flexible trait carries the discount', cite: 'annealed Cu: 210-250 MPa, elong 40-50%, very high K_IC (ductile)' },
  { name: 'Aluminum (6061-T6 sheet)', cls: 'metal', tensile: 310, u: 33, kic: 29, elong: 12, mohs: 2.75, density: 2.7, canon: 15, conductive: true, cite: '6061-T6: 310 MPa, elong 12-17%, K_IC 29, Mohs 2.75' },
  { name: 'Brass (C360 stock)', cls: 'metal', tensile: 340, u: 85, kic: 35, elong: 25, mohs: 3.5, density: 8.5, canon: 18, conductive: true, traitNote: 'computed ~21 vs canon 18: same copper-alloy Malleable discount as Cu (canon consistently docks soft decorative alloys); Delta ~3, worst-case band', cite: 'free-machining brass C360: 340-470 MPa, elong 18-25%' },
  { name: 'Cast iron (gray)', cls: 'metal', tensile: 210, compressive: 750, u: 1.5, kic: 15, elong: 0.6, mohs: 4.5, density: 7.2, canon: 28, heat: 'proof', traitNote: 'computed ~21 vs canon 28 (old repo said 25, Delta 4): canon premium for the hearth-metal (Heat Proof skillet lore); physically gray CI is weaker than mild steel in everything but compression — Brittle trait already flags the real behavior', cite: 'gray CI class 30: tensile 210, compressive 750, elong <1%, K_IC 6-20' },
  { name: 'Steel, rebar/structural (A615/A36)', cls: 'metal', tensile: 620, u: 100, kic: 80, elong: 14, mohs: 4.5, density: 7.85, canon: 30, conductive: true, heat: 'res', cite: 'Gr60 rebar: 620 MPa min tensile, elong 9-14%; A36 plate 400-550' },
  { name: 'Steel, low-carbon sheet (1018 CR)', cls: 'metal', tensile: 440, u: 90, kic: 140, elong: 20, mohs: 4.5, density: 7.85, canon: 35, conductive: true, heat: 'res', traitNote: 'computed ~28 vs stock 35 (canon band 30-35, repo 35): the default structural metal gets a canon Strong premium at the top of its band; model lands at band floor via rebar. Worst-case with band read', cite: '1018 cold-rolled: 440 MPa, elong 15-27%, K_IC very high (100-200)' },
  { name: 'Stainless steel (304 bar)', cls: 'metal', tensile: 585, u: 220, kic: 200, elong: 55, mohs: 4.5, density: 8.0, canon: 32, heat: 'res', cite: '304: 505-620 MPa, elong 40-60% (huge work-to-fracture), K_IC 100-220' },
  { name: 'Titanium (Ti-6Al-4V rod)', cls: 'metal', tensile: 950, u: 115, kic: 75, elong: 14, mohs: 6, density: 4.43, canon: 34, heat: 'res', hints: ['Cold Resistant'], cite: 'Ti-6Al-4V: 950-1050 MPa, elong 10-15%, K_IC 55-100, rho 4.43' },
  { name: 'High-carbon steel (1080 Q&T)', cls: 'metal', tensile: 965, u: 60, kic: 35, elong: 10, mohs: 6.5, density: 7.85, canon: 38, heat: 'res', hints: ['Sharp'], cite: '1080 quench+temper: 965-1100 MPa, elong 10-12%, K_IC 25-50, file-hard Mohs 6.5' },
  { name: 'Tungsten (rod)', cls: 'metal', tensile: 980, u: 18, kic: 8, elong: 2, mohs: 7.5, density: 19.25, canon: 42, heat: 'proof', cite: 'W: 980-1500 MPa, RT elong ~2% (brittle below DBTT), Mohs 7.5, rho 19.25' },

  // Composites (laminate/bulk values; CES/manufacturer data)
  { name: 'Fiberglass (chopped mat GFRP)', cls: 'composite', tensile: 100, elong: 1.5, density: 1.6, canon: 12, cite: 'chopped-strand mat laminate: 80-120 MPa' },
  { name: 'Carbon fiber (quasi-iso CFRP)', cls: 'composite', tensile: 600, elong: 1.5, density: 1.6, canon: 28, heat: 'res', cite: 'quasi-isotropic CFRP laminate: 500-700 MPa' },
];

// ── Derived set (no canon anchor — the model's predictions) ──
const DERIVED: Mat[] = [
  // Soft tissues (Yamada, Strength of Biological Materials; Fung)
  { name: 'Flesh (skin+muscle+fat composite)', cls: 'tissue', tensile: 2.5, elong: 60, density: 1.05, cite: 'layered composite; effective tear strength ~2-3 MPa' },
  { name: 'Skin (dermis)', cls: 'tissue', tensile: 8, elong: 60, density: 1.1, cite: 'human skin: 5-30 MPa (age/site), typical ~8; elong 35-115%' },
  { name: 'Muscle', cls: 'tissue', tensile: 0.2, elong: 60, density: 1.06, cite: 'skeletal muscle (passive, cross-fiber): 0.1-0.4 MPa' },
  { name: 'Fat (adipose)', cls: 'tissue', tensile: 0.05, elong: 100, density: 0.92, hints: ['Cold Resistant'], cite: 'adipose tissue: 0.02-0.1 MPa' },
  { name: 'Organ tissue (parenchyma)', cls: 'tissue', tensile: 0.1, elong: 50, density: 1.05, hints: ['Fragile'], cite: 'liver/kidney capsule+parenchyma: ~0.05-0.2 MPa' },
  { name: 'Brain', cls: 'tissue', tensile: 0.01, elong: 30, density: 1.04, hints: ['Fragile'], cite: 'brain tissue: ~0.005-0.02 MPa — softest tissue in the body' },
  { name: 'Cartilage (hyaline)', cls: 'tissue', tensile: 4, elong: 20, density: 1.1, cite: 'articular cartilage: tensile 1.5-8 MPa' },
  { name: 'Sinew / Tendon', cls: 'leather', tensile: 100, aniso: 0.15, elong: 12, density: 1.1, hints: ['Strong'], cite: 'tendon: ~100 MPa along fiber; cut easily across (aniso 0.15)' },
  // Bio-hard (Wegst & Ashby; Meyers et al., biological materials reviews)
  { name: 'Bone (recompute)', cls: 'biohard', tensile: 130, compressive: 170, kic: 3, u: 3, elong: 1.5, mohs: 2.5, density: 1.9, cite: 'as calibration row — must land ~12' },
  { name: 'Chitin (sclerotized cuticle)', cls: 'biohard', tensile: 60, compressive: 60, kic: 3, u: 2, elong: 3, mohs: 2.5, density: 1.3, organic: true, hints: ['Featherlight'], cite: 'sclerotized arthropod cuticle: 60-100 MPa, K_IC 2-4' },
  { name: 'Scale (keratin, reptile)', cls: 'biohard', tensile: 90, compressive: 90, kic: 4, u: 4, elong: 8, mohs: 2.5, density: 1.3, organic: true, hints: ['Protective'], cite: 'beta-keratin scale: 50-100 MPa, K_IC 3-6' },
  { name: 'Ivory (dentin)', cls: 'biohard', tensile: 120, compressive: 300, kic: 2, u: 2.5, elong: 2, mohs: 2.75, density: 1.85, cite: 'elephant dentin: tensile 100-140 MPa, compressive ~300, K_IC 1.6-2.6' },
  { name: 'Shell (nacre/mollusc)', cls: 'biohard', tensile: 140, compressive: 300, kic: 6, u: 1.5, elong: 1, mohs: 3, density: 2.7, hints: ['Protective'], cite: 'nacre: tensile 130-170 MPa, K_IC 3-9 (3000x its mineral!), Mohs ~3' },
  { name: 'Horn (bulk keratin)', cls: 'biohard', tensile: 140, compressive: 130, kic: 7, u: 10, elong: 6, mohs: 2.5, density: 1.3, organic: true, cite: 'bovid horn keratin: 120-150 MPa, K_IC 6-10 (extremely tough)' },
  // Cross-checks requested
  { name: 'Hardwood (recompute)', cls: 'wood', tensile: 100, elong: 3, density: 0.75, organic: true, cite: 'as calibration row' },
  { name: 'Carbon Fiber (recompute)', cls: 'composite', tensile: 600, elong: 1.5, density: 1.6, cite: 'as calibration row' },
  { name: 'Aluminum (recompute)', cls: 'metal', tensile: 310, u: 33, kic: 29, elong: 12, mohs: 2.75, density: 2.7, conductive: true, cite: 'as calibration row' },
  { name: 'Rubber (recompute)', cls: 'elastomer', tensile: 20, elong: 450, density: 1.1, hints: ['Electric Proof'], cite: 'as calibration row' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Model
// ─────────────────────────────────────────────────────────────────────────────

const ln = Math.log;

function computeResist(m: Mat): number {
  let r: number;
  switch (m.cls) {
    case 'fabric':
      r = C.KF_STR * ln(1 + m.tensile / C.KF_SIGMA_REF) - C.WEAVE_PENALTY;
      break;
    case 'wood':
      r = C.KW_STR * ln(1 + m.tensile / C.KW_MOR_REF) + C.KW_DENS * m.density;
      break;
    case 'polymer': {
      const u = m.u ?? 0.5 * m.tensile * (m.elong / 100);
      r = C.KP_STR * ln(1 + m.tensile / C.KP_SIGMA_REF) + C.KP_TOUGH * ln(1 + u / C.KP_U_REF);
      break;
    }
    case 'composite':
      r = C.KC_STR * ln(1 + m.tensile / C.KC_SIGMA_REF);
      break;
    case 'leather':
    case 'tissue':
    case 'elastomer': {
      const eff = m.tensile * (m.aniso ?? 1) * (m.cls === 'elastomer' ? C.ELASTOMER_RETURN : 1);
      r = C.KS_STR * ln(1 + eff / C.KS_SIGMA_REF);
      break;
    }
    case 'metal':
    case 'mineral':
    case 'biohard': {
      const kic = m.kic ?? 1;
      const gate = m.elong < 2 ? Math.min(1, kic / C.K_GATE) : 1;
      const alphaC =
        m.cls === 'metal' ? C.ALPHA_C_METAL : m.cls === 'mineral' ? C.ALPHA_C_MINERAL : C.ALPHA_C_BIOHARD;
      const sigEff = Math.max(m.tensile, (m.compressive ?? 0) * alphaC * gate);
      const u = m.u ?? 0.5 * m.tensile * (m.elong / 100);
      const kHard =
        m.cls === 'metal' ? C.K_HARD_METAL : m.cls === 'mineral' ? C.K_HARD_MINERAL : C.K_HARD_BIOHARD;
      r =
        C.K_STR * ln(1 + sigEff / C.SIGMA_REF) +
        C.K_TOUGH * ln(1 + u / C.U_REF) +
        C.K_KIC * ln(1 + kic / C.KIC_REF) +
        kHard * (m.mohs ?? 0) ** 2 * gate +
        C.K_DENS * ln(Math.max(1, m.density)) +
        (m.cls === 'biohard' ? C.BASE_BIOHARD : 0);
      break;
    }
  }
  return Math.min(50, Math.max(1, Math.round(r)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Trait suggestion (canon vocabulary from seeded stock + repo modifiers)
// ─────────────────────────────────────────────────────────────────────────────

function suggestTraits(m: Mat, resist: number): string[] {
  const t: string[] = [];
  const kic = m.kic ?? (m.elong >= 5 ? 99 : 1);
  // brittleness: no plastic reserve + poor crack resistance
  if (m.elong < 2 && kic < 2.5) t.push(resist <= 8 || m.tensile < 50 ? 'Fragile' : 'Brittle');
  else if (m.elong < 2 && m.cls !== 'composite') t.push('Brittle');
  else if (m.kic !== undefined && m.kic < 1.5 && m.elong < 5) t.push('Fragile'); // notch-brittle (PMMA)
  // flexibility (soft classes; graded by elongation, per repo Flexible N)
  const soft = ['fabric', 'leather', 'tissue', 'elastomer'].includes(m.cls);
  if (m.cls === 'fabric') {
    t.push(m.elong >= 5 ? 'Flexible 2' : 'Flexible 1'); // a weave drapes regardless of fiber strain
  } else if (soft) {
    if (m.elong >= 100) t.push('Flexible 3');
    else if (m.elong >= 30) t.push('Flexible 2');
    else if (m.elong >= 10) t.push('Flexible 1');
  } else if (m.cls === 'metal' && m.elong >= 40) t.push('Malleable');
  if (m.organic) t.push('Flammable');
  if (m.absorbent) t.push('Absorbent');
  if (m.tensile >= 500 || resist >= 25) t.push('Strong');
  if (m.density >= 10) t.push('Blunt');
  // Featherlight = specific strength (canon gives it to Al, Ti, CF — not to steel)
  if (!soft && m.cls !== 'wood' && m.cls !== 'mineral' && m.density <= 5 && m.tensile / m.density >= 100 && resist >= 14)
    t.push('Featherlight');
  if (m.heat === 'proof') t.push('Heat Proof');
  else if (m.heat === 'res') t.push('Heat Resistant');
  else if (m.cls === 'mineral' && (m.mohs ?? 0) >= 3) t.push('Heat Resistant');
  if (m.conductive) t.push('Electric Vulnerable');
  for (const h of m.hints ?? []) if (!t.includes(h)) t.push(h);
  return t;
}

// ─────────────────────────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────────────────────────

type Verdict = 'PASS' | 'PASS*' | 'TRAIT-EXPLAINED' | 'FLAG';

function verdictOf(m: Mat, computed: number): Verdict {
  const d = Math.abs(computed - (m.canon ?? computed));
  if (d <= 2) return 'PASS';
  if (d <= 3) return 'PASS*'; // worst-case band
  return m.traitNote ? 'TRAIT-EXPLAINED' : 'FLAG';
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

function main(): void {
  console.log('MATERIAL PHYSICS -> RESIST (1-50 mundane band)');
  console.log('Model: one scalar + traits. See header comment for formula.\n');

  console.log('=== CALIBRATION (canon anchors) ===');
  console.log(
    pad('Material', 36) + pad('Canon', 7) + pad('Comp', 6) + pad('Delta', 7) + pad('Verdict', 17) + 'Suggested traits'
  );
  console.log('-'.repeat(120));
  let pass = 0,
    passStar = 0,
    trait = 0,
    flag = 0;
  for (const m of CALIBRATION) {
    const r = computeResist(m);
    const v = verdictOf(m, r);
    if (v === 'PASS') pass++;
    else if (v === 'PASS*') passStar++;
    else if (v === 'TRAIT-EXPLAINED') trait++;
    else flag++;
    const delta = r - (m.canon ?? 0);
    console.log(
      pad(m.name, 36) +
        pad(String(m.canon), 7) +
        pad(String(r), 6) +
        pad((delta >= 0 ? '+' : '') + delta, 7) +
        pad(v, 17) +
        suggestTraits(m, r).join(', ')
    );
    if (v !== 'PASS' && m.traitNote) console.log('    > ' + m.traitNote);
  }
  console.log('-'.repeat(120));
  console.log(
    `PASS(+-2): ${pass}  PASS*(+-3): ${passStar}  TRAIT-EXPLAINED: ${trait}  FLAG: ${flag}  of ${CALIBRATION.length}\n`
  );

  console.log('=== DERIVED (model predictions — biological tissues & cross-checks) ===');
  console.log(pad('Material', 36) + pad('Resist', 8) + 'Suggested traits');
  console.log('-'.repeat(100));
  for (const m of DERIVED) {
    const r = computeResist(m);
    console.log(pad(m.name, 36) + pad(String(r), 8) + suggestTraits(m, r).join(', '));
  }
  console.log('-'.repeat(100));
  console.log('\nCitations: typical literature values per material (see `cite` fields in source).');
}

main();
