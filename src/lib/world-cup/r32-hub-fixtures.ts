import r32FixtureData from "../../../data/world-cup-2026/r32-fixtures.json";
import { normalizeNationalTeamName } from "@/lib/data/world-cup-2026-teams";
import { resolveStadiumVenue } from "@/lib/world-cup/stadium-metadata";
import type { WcMatchRow } from "@/lib/world-cup/standings";

export type R32FixtureRecord = {
  match_number: number;
  date: string;
  kickoff_time: string;
  stadium: string;
  city: string;
  venue_raw: string;
  home_team: string;
  away_team: string;
};

export const R32_MATCH_ID_PREFIX = "wc2026-ko-";

const SLOT_PLACEHOLDER_RE = /^(?:[123][A-L]|[23][A-L]{2,})$/i;

/** FIFA bracket slot notation (e.g. 2J, 3CEFHI, 1L) — not a confirmed nation yet. */
export function isKnockoutSlotPlaceholder(name: string | null | undefined): boolean {
  const trimmed = name?.trim();
  if (!trimmed) return true;
  if (/^tbd$/i.test(trimmed)) return true;
  if (/^to be determined$/i.test(trimmed)) return true;
  return SLOT_PLACEHOLDER_RE.test(trimmed.replace(/\s+/g, ""));
}

export function r32MatchId(matchNumber: number): string {
  return `${R32_MATCH_ID_PREFIX}${matchNumber}`;
}

export function loadR32Fixtures(): R32FixtureRecord[] {
  const file = r32FixtureData as { fixtures?: R32FixtureRecord[] };
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

export function buildR32HubMatchRows(
  teamNames: Map<string, string>
): Array<WcMatchRow & { home_team_name: string; away_team_name: string }> {
  return loadR32Fixtures().map((fx) => {
    const venueMeta = resolveStadiumVenue(fx.city) ?? resolveStadiumVenue(fx.stadium);
    return {
      id: r32MatchId(fx.match_number),
      date: fx.date,
      time: fx.kickoff_time,
      competition: "FIFA World Cup 2026",
      round: "R32",
      group_code: null,
      status: "scheduled",
      home_team_id: resolveTeamId(fx.home_team, teamNames),
      away_team_id: resolveTeamId(fx.away_team, teamNames),
      home_goals: null,
      away_goals: null,
      home_team_name: fx.home_team,
      away_team_name: fx.away_team,
      venue: fx.venue_raw,
      venue_city: fx.city,
      venue_label: fx.stadium,
      venue_altitude_meters: venueMeta?.altitude_meters ?? null,
    };
  });
}

export function isR32HubMatchId(id: string | null | undefined): boolean {
  return Boolean(id?.startsWith(R32_MATCH_ID_PREFIX));
}

export function r32FixtureHasBothTeams(fx: Pick<R32FixtureRecord, "home_team" | "away_team">): boolean {
  return (
    !isKnockoutSlotPlaceholder(fx.home_team) && !isKnockoutSlotPlaceholder(fx.away_team)
  );
}
