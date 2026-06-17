import type { FixtureLineup } from "@/lib/types/football";

/** True when lineup has exactly 11 unique starter player ids. */
export function isValidCustomLineup(lineup: FixtureLineup): boolean {
  if (!Array.isArray(lineup.startXI) || lineup.startXI.length !== 11) return false;
  const ids = lineup.startXI.map((s) => s.player.id).filter(Number.isFinite);
  if (ids.length !== 11) return false;
  return new Set(ids).size === 11;
}

/** Require two teams with valid 11-a-side XIs for manual_xi predictions. */
export function validateManualCustomLineups(
  lineups: FixtureLineup[] | undefined,
  homeTeamId: number,
  awayTeamId: number
): string | null {
  if (!lineups?.length) {
    return "manual_xi requires customLineups with home and away starting XIs.";
  }
  const home = lineups.find((l) => l.team.id === homeTeamId);
  const away = lineups.find((l) => l.team.id === awayTeamId);
  if (!home || !away) {
    return "customLineups must include entries for both homeTeamId and awayTeamId.";
  }
  if (!isValidCustomLineup(home)) {
    return "Home customLineup must have 11 unique starters.";
  }
  if (!isValidCustomLineup(away)) {
    return "Away customLineup must have 11 unique starters.";
  }
  return null;
}

export function neutralLineupImpact(note: string) {
  return {
    homeXgMultiplier: 1,
    awayXgMultiplier: 1,
    homeDefenseMultiplier: 1,
    awayDefenseMultiplier: 1,
    notes: [note],
  };
}
