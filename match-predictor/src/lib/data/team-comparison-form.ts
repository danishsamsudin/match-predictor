import type { FixtureResult } from "@/lib/types/football";

export type FormResultChar = "W" | "D" | "L";

export function resultCharForFixture(
  match: FixtureResult,
  teamId: number
): FormResultChar | null {
  const isHome = match.teams.home.id === teamId;
  const winner = isHome ? match.teams.home.winner : match.teams.away.winner;
  if (winner === true) return "W";
  if (winner === false) return "L";
  if (winner === null) return "D";
  return null;
}

/**
 * Last N results as a form string (e.g. "WDWLW"), oldest match on the left.
 * `fixtures` must be newest-first (same order as synced recent form).
 */
export function formStringFromRecentFixtures(
  fixtures: FixtureResult[],
  teamId: number,
  maxMatches = 5
): string | null {
  const chars = fixtures
    .slice(0, maxMatches)
    .map((match) => resultCharForFixture(match, teamId))
    .filter((char): char is FormResultChar => char != null);

  if (!chars.length) return null;
  return [...chars].reverse().join("");
}
