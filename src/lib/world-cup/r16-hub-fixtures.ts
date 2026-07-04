import r16FixtureData from "../../../data/world-cup-2026/r16-fixtures.json";
import { normalizeNationalTeamName } from "@/lib/data/world-cup-2026-teams";
import { resolveStadiumVenue } from "@/lib/world-cup/stadium-metadata";
import {
  isKnockoutSlotPlaceholder,
  R32_MATCH_ID_PREFIX,
  r32MatchId,
} from "@/lib/world-cup/r32-hub-fixtures";
import type { WcMatchRow } from "@/lib/world-cup/standings";

export type R16FixtureRecord = {
  match_number: number;
  date: string;
  kickoff_time: string;
  stadium: string;
  city: string;
  venue_raw: string;
  home_team: string;
  away_team: string;
  home_goals?: number | null;
  away_goals?: number | null;
  status?: string | null;
};

export { R32_MATCH_ID_PREFIX as R16_MATCH_ID_PREFIX, r32MatchId as r16MatchId };

export function loadR16Fixtures(): R16FixtureRecord[] {
  const file = r16FixtureData as { fixtures?: R16FixtureRecord[] };
  return [...(file.fixtures ?? [])].sort((a, b) => a.match_number - b.match_number);
}

function resolveTeamId(
  name: string,
  teamNames: Map<string, string>
): string | null {
  if (isKnockoutSlotPlaceholder(name)) {
    return `${R32_MATCH_ID_PREFIX}slot-${name.replace(/\s+/g, "").toUpperCase()}`;
  }
  const key = normalizeNationalTeamName(name);
  for (const [id, teamName] of teamNames) {
    if (normalizeNationalTeamName(teamName) === key) return id;
  }
  return null;
}

export function buildR16HubMatchRows(
  teamNames: Map<string, string>
): Array<WcMatchRow & { home_team_name: string; away_team_name: string }> {
  return loadR16Fixtures().map((fx) => {
    const venueMeta = resolveStadiumVenue(fx.city) ?? resolveStadiumVenue(fx.stadium);
    const finished =
      fx.status === "finished" ||
      (fx.home_goals != null && fx.away_goals != null);
    return {
      id: r32MatchId(fx.match_number),
      date: fx.date,
      time: fx.kickoff_time,
      competition: "FIFA World Cup 2026",
      round: "R16",
      group_code: null,
      status: finished ? "finished" : "scheduled",
      home_team_id: resolveTeamId(fx.home_team, teamNames),
      away_team_id: resolveTeamId(fx.away_team, teamNames),
      home_goals: fx.home_goals ?? null,
      away_goals: fx.away_goals ?? null,
      home_team_name: fx.home_team,
      away_team_name: fx.away_team,
      venue: fx.venue_raw,
      venue_city: fx.city,
      venue_label: fx.stadium,
      venue_altitude_meters: venueMeta?.altitude_meters ?? null,
    };
  });
}

export function isR16HubMatchId(id: string | null | undefined): boolean {
  if (!id?.startsWith(R32_MATCH_ID_PREFIX)) return false;
  const num = Number(id.slice(R32_MATCH_ID_PREFIX.length));
  return num >= 89 && num <= 96;
}

export function r16FixtureHasBothTeams(
  fx: Pick<R16FixtureRecord, "home_team" | "away_team">
): boolean {
  return (
    !isKnockoutSlotPlaceholder(fx.home_team) && !isKnockoutSlotPlaceholder(fx.away_team)
  );
}
