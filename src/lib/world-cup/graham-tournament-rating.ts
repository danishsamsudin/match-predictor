import type { InternationalFormMatch } from "@/lib/world-cup/load-international-form";
import { GRAHAM_WCTR_BASE_K } from "@/lib/world-cup/graham-model-config";
import {
  applyXgEloMatchUpdates,
  XG_ELO_DEFAULT_RATING,
} from "@/lib/world-cup/graham-xg-elo";
import { internationalMatchTierWeight } from "@/lib/world-cup/international-strength";

/** Fallback when a team has no tournament matches in the sample. */
export const WCTR_DEFAULT_RATING = XG_ELO_DEFAULT_RATING;

export function tournamentMatchWeight(competition: string | null | undefined): number {
  const c = (competition ?? "").toLowerCase();
  if (/friendl|preparatory|preparation|test match/.test(c)) return 0;
  if (/final$|finals$/.test(c) && /world cup|euro|copa|gold cup|afcon|asian cup/.test(c)) {
    return 1.25;
  }
  if (/quarter|semi|round of 16|last 16|knockout|play-?off|playoff/.test(c)) return 1.15;
  if (/world cup|euro|copa|nations league|continental|afcon|gold cup|asian cup|finals/.test(c)) {
    return 1.1;
  }
  if (/qualif|wcq|afc|caf|concacaf|conmebol|uefa/.test(c)) return 0.85;
  return 0;
}

export function filterTournamentMatches(matches: InternationalFormMatch[]): InternationalFormMatch[] {
  return matches.filter((m) => tournamentMatchWeight(m.competition) > 0);
}

function initialWctrRating(_teamId: number, _teamName?: string): number {
  return WCTR_DEFAULT_RATING;
}

/**
 * World Cup Tournament Rating — xG-Elo on competitive internationals only.
 * Unlike xG-Elo (all matches incl. friendlies, FIFA-seeded), WCTR starts at a
 * neutral 1500 and only moves on tournament matches with tier-weighted K.
 */
export function computeWctrFromMatches(
  allMatches: InternationalFormMatch[],
  teamIds: number[],
  teamNames: Map<number, string>
): Map<number, number> {
  const tournamentMatches = filterTournamentMatches(allMatches);
  if (!tournamentMatches.length) {
    const fallback = new Map<number, number>();
    for (const id of teamIds) {
      fallback.set(id, initialWctrRating(id, teamNames.get(id)));
    }
    return fallback;
  }

  return applyXgEloMatchUpdates(tournamentMatches, teamIds, teamNames, {
    initialRating: initialWctrRating,
    matchK: (m) => GRAHAM_WCTR_BASE_K * tournamentMatchWeight(m.competition),
  });
}

export function getWctrRating(
  ratings: Map<number, number>,
  teamId: number,
  teamName?: string
): number {
  return ratings.get(teamId) ?? initialWctrRating(teamId, teamName);
}

/** Re-export tier helper for snapshots. */
export { internationalMatchTierWeight };
