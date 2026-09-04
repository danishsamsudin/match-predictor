/**
 * Season-level Understat xG for PL 2025/26 (season sm_id 25583).
 * Used when match-level xG on glpm_match_team_stats is a shot-based proxy.
 */

import leagueTable from "../../../data/understat/pl-2025-26/league-table.json";

export const UNDERSTAT_PL_SEASON_ID = 25583;

export type UnderstatSeasonRow = {
  understatTeam: string;
  glpmName: string;
  matches: number;
  goals: number;
  xg: number;
  xga: number;
};

const US_TO_GLPM: Record<string, string> = {
  Arsenal: "Arsenal",
  "Aston Villa": "Aston Villa",
  Bournemouth: "AFC Bournemouth",
  Brentford: "Brentford",
  Brighton: "Brighton & Hove Albion",
  Burnley: "Burnley",
  Chelsea: "Chelsea",
  "Crystal Palace": "Crystal Palace",
  Everton: "Everton",
  Fulham: "Fulham",
  Leeds: "Leeds United",
  Liverpool: "Liverpool",
  "Manchester City": "Manchester City",
  "Manchester United": "Manchester United",
  "Newcastle United": "Newcastle United",
  "Nottingham Forest": "Nottingham Forest",
  Sunderland: "Sunderland",
  Tottenham: "Tottenham Hotspur",
  "West Ham": "West Ham United",
  "Wolverhampton Wanderers": "Wolverhampton Wanderers",
};

const ALIASES = new Map<string, UnderstatSeasonRow>();

function addAlias(key: string, row: UnderstatSeasonRow) {
  const k = key.trim().toLowerCase();
  if (k) ALIASES.set(k, row);
}

for (const raw of leagueTable as Array<{
  team: string;
  matches: number;
  goals: number;
  xG: number;
  xGA: number;
}>) {
  const glpmName = US_TO_GLPM[raw.team] ?? raw.team;
  const row: UnderstatSeasonRow = {
    understatTeam: raw.team,
    glpmName,
    matches: Number(raw.matches),
    goals: Number(raw.goals),
    xg: Number(raw.xG),
    xga: Number(raw.xGA),
  };
  addAlias(raw.team, row);
  addAlias(glpmName, row);
}

export function lookupUnderstatSeasonRow(
  teamName: string | null | undefined
): UnderstatSeasonRow | null {
  if (!teamName) return null;
  return ALIASES.get(teamName.trim().toLowerCase()) ?? null;
}
