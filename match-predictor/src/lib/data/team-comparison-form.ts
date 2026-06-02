import type { FixtureResult } from "@/lib/types/football";
import { matchPointsForTeam } from "@/lib/prediction/form-momentum";

export type FormResultChar = "W" | "D" | "L";

export function resultCharForFixture(
  match: FixtureResult,
  teamId: number
): FormResultChar | null {
  const points = matchPointsForTeam(match, teamId);
  if (points === 3) return "W";
  if (points === 1) return "D";
  if (points === 0) return "L";
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
