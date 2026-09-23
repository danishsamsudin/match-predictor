import type { InternationalFormMatch } from "@/lib/world-cup/load-international-form";
import { nlFormSampleWeight } from "@/lib/nations-league/nl-graham-model-config";

/**
 * Stamp NL cycle × tier sample weights onto form matches.
 * Graham process rates multiply `sampleWeight` on top of base decay/tier;
 * we set sampleWeight so that base tier is neutralized toward NL tiers
 * by using weight = nlWeight / max(legacyTierApprox, eps) — simpler approach:
 * set sampleWeight = nlCycleWeight only and rely on existing tier for NL≈1.12.
 *
 * Preferred: set sampleWeight = nlFormSampleWeight / (decay*legacyTier) ≈ cycle * nlTier/legacyTier.
 * For clarity we set sampleWeight to the **cycle** component only when competition is NL,
 * and for non-NL use 1. Full nlFormSampleWeight is applied by replacing sampleWeight
 * as absolute extra multiplier with nlCycleWeight, since tier is already in process rates.
 *
 * Plan requires: w = tier * decay * cycle. Process rates already do decay * internationalTier.
 * So sampleWeight should be: (nlTier / internationalTier) * cycle ≈ cycle for NL,
 * and (nlTier / internationalTier) for WCQ/friendlies.
 */
export function applyNlFormWeights(
  matches: InternationalFormMatch[],
  referenceMs = Date.now()
): InternationalFormMatch[] {
  return matches.map((m) => {
    const full = nlFormSampleWeight(m.competition, m.date, referenceMs);
    // international-strength already applies decay * tier (~0.32–1.12).
    // We want final = nlFormSampleWeight. Approximate by:
    // sampleWeight = full / (decay * approxLegacyTier) but decay is reapplied —
    // so pass cycle * (nlTier/legacyTier) via computing ratio of nl full to
    // a reconstructed legacy weight.
    const legacyTier = legacyTierApprox(m.competition);
    const days = daysSince(m.date, referenceMs);
    const decay = Math.exp(-0.00048 * days);
    const legacy = Math.max(decay * legacyTier, 1e-6);
    return {
      ...m,
      sampleWeight: full / legacy,
    };
  });
}

function daysSince(dateStr: string | null | undefined, referenceMs: number): number {
  if (!dateStr) return 365 * 5;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return 365 * 5;
  return Math.max(0, (referenceMs - d.getTime()) / (1000 * 60 * 60 * 24));
}

function legacyTierApprox(competition: string | null | undefined): number {
  const c = (competition ?? "").toLowerCase();
  if (!c) return 0.85;
  if (/friendl|preparatory|preparation|test match/.test(c)) return 0.32;
  if (/qualif|play-?off|playoff|inter-confederation|wcq/.test(c)) return 1;
  if (/world cup|euro|copa|nations league|continental|afcon|gold cup|asian cup|finals/.test(c)) {
    return 1.12;
  }
  return 0.88;
}
