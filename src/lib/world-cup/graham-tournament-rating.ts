import type { InternationalFormMatch } from "@/lib/world-cup/load-international-form";
import { computeXgEloFromMatches, initialXgEloRating } from "@/lib/world-cup/graham-xg-elo";
import { internationalMatchTierWeight } from "@/lib/world-cup/international-strength";

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

export function computeWctrFromMatches(
  allMatches: InternationalFormMatch[],
  teamIds: number[],
  teamNames: Map<number, string>
): Map<number, number> {
  const weighted = allMatches.flatMap((m) => {
    const w = tournamentMatchWeight(m.competition);
    if (w <= 0) return [];
    const copies = Math.max(1, Math.round(w * 2));
    return Array.from({ length: copies }, () => m);
  });

  if (!weighted.length) {
    const fallback = new Map<number, number>();
    for (const id of teamIds) {
      fallback.set(id, initialXgEloRating(id, teamNames.get(id)));
    }
    return fallback;
  }

  return computeXgEloFromMatches(weighted, teamIds, teamNames);
}

export function getWctrRating(
  ratings: Map<number, number>,
  teamId: number,
  teamName?: string
): number {
  return ratings.get(teamId) ?? initialXgEloRating(teamId, teamName);
}

/** Re-export tier helper for snapshots. */
export { internationalMatchTierWeight };
