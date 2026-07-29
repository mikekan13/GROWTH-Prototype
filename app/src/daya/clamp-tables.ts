/**
 * Per-domain clamp constraint tables — the data half of the clamping
 * boundary (src/daya/clamp.ts owns the generation logic). Each domain maps
 * skill band -> what a persona-harness entity plausibly does NOT know, how
 * it talks about the domain, and what mistakes it plausibly makes under
 * pressure. Phase 1 seeds six everyday domains; add more entries here as
 * entities need them — nothing elsewhere in the codebase needs to change.
 */
import type { SkillBand } from './clamp';

export interface ClampDomainBand {
  doesNotKnow: string[];
  vocabulary: string;
  errorModes: string[];
}

export interface ClampDomainTable {
  label: string; // human-readable domain name used in prompt phrasing
  bands: Record<SkillBand, ClampDomainBand>;
}

export const CLAMP_DOMAINS: Record<string, ClampDomainTable> = {
  medicine: {
    label: 'medicine and first aid',
    bands: {
      untrained: {
        doesNotKnow: ['clinical diagnosis', 'anatomy beyond common knowledge', 'medication dosing'],
        vocabulary: 'plain everyday words — "it hurts here", "it\'s bleeding a lot", never clinical terms',
        errorModes: ['confuses adjacent symptoms', 'reaches for a folk remedy', 'admits it doesn\'t know rather than guessing with false confidence'],
      },
      novice: {
        doesNotKnow: ['advanced pharmacology', 'surgical procedure', 'presentation of rare conditions'],
        vocabulary: 'first-aid-course terms — "sprain", "pressure bandage", "shock", basic triage words',
        errorModes: ['misjudges how serious an unfamiliar injury is', 'applies the wrong first-aid step under stress'],
      },
      competent: {
        doesNotKnow: ['specialist subfields outside general practice', 'the newest treatment protocols'],
        vocabulary: 'working clinical vocabulary a trained field medic would use',
        errorModes: ['second-guesses a correct read under time pressure', 'misses a rare complication a specialist would catch'],
      },
      expert: {
        doesNotKnow: ['frontier research', 'sub-specialties well outside their own'],
        vocabulary: 'precise clinical vocabulary, teaching register when explaining to a layperson',
        errorModes: ['overconfident on the rare edge case that sits just outside true expertise'],
      },
      master: {
        doesNotKnow: ['nothing within the domain\'s Earth-normal ceiling short of the genuine research frontier'],
        vocabulary: 'full professional register, explains rather than guesses',
        errorModes: ['errs only from truly novel circumstance, never from simple recall failure'],
      },
    },
  },
  mechanical: {
    label: 'mechanical and vehicle repair',
    bands: {
      untrained: {
        doesNotKnow: ['engine internals', 'what a diagnostic code means', 'which part does what under the hood'],
        vocabulary: 'plain terms — "the engine", "it\'s making a noise", never part names',
        errorModes: ['tightens or checks the wrong thing first', 'mistakes a cosmetic issue for a serious one'],
      },
      novice: {
        doesNotKnow: ['transmission or electrical-system internals', 'anything requiring a shop lift'],
        vocabulary: 'shade-tree-mechanic terms — "belt", "battery terminal", "fluid level"',
        errorModes: ['fixes a symptom instead of the cause', 'strips a fastener from over-tightening'],
      },
      competent: {
        doesNotKnow: ['manufacturer-specific quirks outside their usual makes', 'bleeding-edge hybrid/EV systems'],
        vocabulary: 'working trade vocabulary, comfortable with a service manual',
        errorModes: ['misdiagnoses an intermittent fault that isn\'t reproducing on the bench'],
      },
      expert: {
        doesNotKnow: ['systems from a manufacturer they\'ve never serviced', 'prototype/one-off builds'],
        vocabulary: 'precise trade vocabulary, reads a schematic fluently',
        errorModes: ['takes longer than expected on a genuinely novel platform'],
      },
      master: {
        doesNotKnow: ['nothing within known automotive/mechanical systems short of a one-off prototype'],
        vocabulary: 'full professional register, can improvise a fix from first principles',
        errorModes: ['very rarely wrong, and only on something no one has built before'],
      },
    },
  },
  law: {
    label: 'law and legal process',
    bands: {
      untrained: {
        doesNotKnow: ['court procedure', 'what a given statute actually says', 'the difference between civil and criminal process'],
        vocabulary: 'plain terms — "get in trouble", "go to court", never citations',
        errorModes: ['assumes a TV-legal-drama version of how things work', 'overstates or understates the stakes'],
      },
      novice: {
        doesNotKnow: ['case law', 'jurisdiction-specific procedural rules', 'contract drafting'],
        vocabulary: 'informed-layperson terms picked up from direct experience, not statute numbers',
        errorModes: ['cites a rule of thumb that doesn\'t hold in this specific jurisdiction'],
      },
      competent: {
        doesNotKnow: ['practice areas outside their own', 'appellate-level strategy'],
        vocabulary: 'working legal vocabulary, comfortable citing the relevant statute',
        errorModes: ['confidently misapplies a rule from an adjacent but distinct area of law'],
      },
      expert: {
        doesNotKnow: ['practice areas they\'ve never worked', 'foreign legal systems outside their training'],
        vocabulary: 'precise legal vocabulary, explains implications clearly',
        errorModes: ['takes longer than expected researching a genuinely novel fact pattern'],
      },
      master: {
        doesNotKnow: ['nothing within settled law short of an unresolved, first-impression question'],
        vocabulary: 'full professional register, argues from first principles when precedent runs out',
        errorModes: ['errs only on questions the law itself hasn\'t settled yet'],
      },
    },
  },
  science: {
    label: 'physical science and general research literacy',
    bands: {
      untrained: {
        doesNotKnow: ['formal terminology', 'how to read a study', 'units and orders of magnitude'],
        vocabulary: 'plain terms and rough intuitions, no formulas',
        errorModes: ['reaches for the popular-science version even when it\'s a bit wrong', 'confuses correlation with causation'],
      },
      novice: {
        doesNotKnow: ['advanced mathematics behind the models', 'primary-literature nuance'],
        vocabulary: 'general-education-science terms — the kind picked up from documentaries and intro courses',
        errorModes: ['misremembers a specific number but has the right general shape of the idea'],
      },
      competent: {
        doesNotKnow: ['subfields well outside their trained specialty', 'unpublished frontier results'],
        vocabulary: 'working technical vocabulary, comfortable with the field\'s standard models',
        errorModes: ['extrapolates a known result slightly past where it actually applies'],
      },
      expert: {
        doesNotKnow: ['subfields they\'ve never worked in', 'results that haven\'t been published yet'],
        vocabulary: 'precise technical vocabulary, explains from first principles when asked',
        errorModes: ['is behind on a very recent result outside their narrow specialty'],
      },
      master: {
        doesNotKnow: ['nothing within the settled, published record of the field'],
        vocabulary: 'full professional register, reasons from first principles on open questions',
        errorModes: ['errs only where the field itself has not yet settled the answer'],
      },
    },
  },
  combat: {
    label: 'combat and tactics',
    bands: {
      untrained: {
        doesNotKnow: ['formation discipline', 'weapon maintenance', 'reading terrain for advantage'],
        vocabulary: 'plain, scared, or excited layperson language — no tactical jargon',
        errorModes: ['freezes or overcommits under real pressure', 'misjudges range or timing badly'],
      },
      novice: {
        doesNotKnow: ['coordinated small-unit tactics', 'advanced weapon handling'],
        vocabulary: 'basic drilled terms — "cover", "flank", "fall back" — used a little stiffly',
        errorModes: ['sticks to the drilled plan even when the situation has changed'],
      },
      competent: {
        doesNotKnow: ['large-unit command', 'exotic or unfamiliar weapon systems'],
        vocabulary: 'working tactical vocabulary, reads a fight fluently at the small-unit level',
        errorModes: ['underestimates an opponent using an unfamiliar style'],
      },
      expert: {
        doesNotKnow: ['command of forces far larger than they\'ve led', 'genuinely alien fighting styles'],
        vocabulary: 'precise tactical vocabulary, thinks several moves ahead',
        errorModes: ['takes a beat longer than ideal against something truly unprecedented'],
      },
      master: {
        doesNotKnow: ['nothing within known modes of conflict short of the truly unprecedented'],
        vocabulary: 'full professional register, teaches while fighting',
        errorModes: ['errs only against something no doctrine has ever accounted for'],
      },
    },
  },
  streetwise: {
    label: 'streetwise and social survival',
    bands: {
      untrained: {
        doesNotKnow: ['how to read a con', 'local underworld structure', 'which risks are actually dangerous'],
        vocabulary: 'plain, naive language — takes things at face value',
        errorModes: ['trusts the wrong person', 'misses an obvious warning sign a local would catch'],
      },
      novice: {
        doesNotKnow: ['organized-crime hierarchy', 'how to fence goods or find a black-market contact'],
        vocabulary: 'street-level slang picked up secondhand, used a little imprecisely',
        errorModes: ['reads a situation as more or less dangerous than it actually is'],
      },
      competent: {
        doesNotKnow: ['networks outside their own city or scene', 'high-level organized crime'],
        vocabulary: 'fluent street vocabulary, reads a room quickly',
        errorModes: ['misjudges an unfamiliar scene by the rules of their own turf'],
      },
      expert: {
        doesNotKnow: ['scenes they\'ve never worked', 'networks with no local footprint'],
        vocabulary: 'precise, economical street vocabulary — says little, reads everything',
        errorModes: ['takes a moment to recalibrate in a genuinely unfamiliar city'],
      },
      master: {
        doesNotKnow: ['nothing within known criminal and social undercurrents short of an entirely new scene'],
        vocabulary: 'full fluency, moves through any room unremarked',
        errorModes: ['errs only where the scene itself is unprecedented'],
      },
    },
  },
};

/** Fallback used when a request doesn't specify a domain, or names one not
 * yet seeded above — deliberately generic rather than throwing, since new
 * domains get added here over time as entities need them. */
export const CLAMP_GENERAL_DOMAIN: ClampDomainTable = {
  label: 'this subject',
  bands: {
    untrained: {
      doesNotKnow: ['specialist terminology', 'anything beyond common knowledge'],
      vocabulary: 'plain everyday language',
      errorModes: ['guesses from general impressions', 'admits not knowing rather than bluffing confidently'],
    },
    novice: {
      doesNotKnow: ['advanced technique', 'edge cases outside the basics'],
      vocabulary: 'hobbyist-level terms',
      errorModes: ['gets the basics right but stumbles on anything advanced'],
    },
    competent: {
      doesNotKnow: ['specialist subfields outside their usual work'],
      vocabulary: 'working practical vocabulary',
      errorModes: ['occasionally misjudges something just outside their usual scope'],
    },
    expert: {
      doesNotKnow: ['subfields they\'ve never worked in'],
      vocabulary: 'precise professional vocabulary',
      errorModes: ['rarely wrong, and only on genuinely unfamiliar ground'],
    },
    master: {
      doesNotKnow: ['nothing within the domain\'s Earth-normal ceiling'],
      vocabulary: 'full professional register',
      errorModes: ['errs only from truly novel circumstance'],
    },
  },
};
