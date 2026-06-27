import {
  allocationLookupKey,
  assignKnockoutOpponents,
  hasAllocationMatrix,
} from "@/lib/world-cup/knockout-allocation";
import { normalizeNationalTeamName } from "@/lib/data/world-cup-2026-teams";
import { loadGroupDraw } from "@/lib/world-cup/group-draw";
import {
  alignRecentMatchDisplay,
} from "@/lib/world-cup/match-orientation";

export interface GroupStandingRow {
  teamId: string;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  rank: number;
}

export interface ThirdPlaceCandidate {
  teamId: string;
  groupCode: string;
  points: number;
  goalDifference: number;
  goalsFor: number;
  fairPlayPoints: number;
  fbrefTeamName: string;
}

export interface WcMatchRow {
  id: string;
  date: string | null;
  time: string | null;
  competition?: string | null;
  round?: string | null;
  venue?: string | null;
  venue_city?: string | null;
  /** Resolved host city for display / predictor (after stadium metadata). */
  venue_label?: string | null;
  venue_altitude_meters?: number | null;
  rest_hours_home?: number | null;
  rest_hours_away?: number | null;
  prior_home_tz?: string | null;
  prior_away_tz?: string | null;
  group_code: string | null;
  status: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_goals: number | null;
  away_goals: number | null;
  home_team_name?: string;
  away_team_name?: string;
  ingest_source_home?: string | null;
  ingest_source_away?: string | null;
  ingest_source_home_goals?: number | null;
  ingest_source_away_goals?: number | null;
}

export function computeThirdPlaceWildcards(
  candidates: ThirdPlaceCandidate[]
): (ThirdPlaceCandidate & { will_advance: boolean; wildcard_rank: number })[] {
  if (candidates.length !== 12) {
    console.warn(
      `Unexpected third-place candidate pool size: ${candidates.length}. Expected 12.`
    );
  }

  const sorted = [...candidates].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    if (b.fairPlayPoints !== a.fairPlayPoints) return b.fairPlayPoints - a.fairPlayPoints;
    return a.teamId.localeCompare(b.teamId);
  });

  return sorted.map((c, i) => ({
    ...c,
    will_advance: i < 8,
    wildcard_rank: i + 1,
  }));
}

function applyResult(
  table: Map<string, GroupStandingRow>,
  homeId: string,
  awayId: string,
  homeGoals: number,
  awayGoals: number,
  names: Map<string, string>
) {
  const home = table.get(homeId);
  const away = table.get(awayId);
  if (!home || !away) return;

  home.played += 1;
  away.played += 1;
  home.goalsFor += homeGoals;
  home.goalsAgainst += awayGoals;
  away.goalsFor += awayGoals;
  away.goalsAgainst += homeGoals;

  if (homeGoals > awayGoals) {
    home.won += 1;
    home.points += 3;
    away.lost += 1;
  } else if (homeGoals < awayGoals) {
    away.won += 1;
    away.points += 3;
    home.lost += 1;
  } else {
    home.drawn += 1;
    away.drawn += 1;
    home.points += 1;
    away.points += 1;
  }
  home.goalDifference = home.goalsFor - home.goalsAgainst;
  away.goalDifference = away.goalsFor - away.goalsAgainst;
  if (!home.teamName && names.has(homeId)) home.teamName = names.get(homeId)!;
  if (!away.teamName && names.has(awayId)) away.teamName = names.get(awayId)!;
}

export type CanonicalMatchResult = {
  homeTeamId: string;
  awayTeamId: string;
  homeGoals: number;
  awayGoals: number;
};

/**
 * Map a finished match to official schedule home/away before applying standings.
 * FBref schedule rows sometimes store reversed home/away while goals stay with DB columns.
 */
export function canonicalizeMatchResultForStandings(
  m: WcMatchRow & {
    ingest_source_home?: string | null;
    ingest_source_away?: string | null;
    ingest_source_home_goals?: number | null;
    ingest_source_away_goals?: number | null;
  },
  teamNameById: Map<string, string>
): CanonicalMatchResult | null {
  if (m.home_goals == null || m.away_goals == null) return null;
  if (!m.home_team_id || !m.away_team_id) return null;

  const dbHomeName = m.home_team_name ?? teamNameById.get(m.home_team_id) ?? "";
  const dbAwayName = m.away_team_name ?? teamNameById.get(m.away_team_id) ?? "";
  if (!dbHomeName.trim() || !dbAwayName.trim()) {
    return {
      homeTeamId: m.home_team_id,
      awayTeamId: m.away_team_id,
      homeGoals: m.home_goals,
      awayGoals: m.away_goals,
    };
  }

  const aligned = alignRecentMatchDisplay({
    date: m.date,
    homeTeamName: dbHomeName,
    awayTeamName: dbAwayName,
    homeGoals: m.home_goals,
    awayGoals: m.away_goals,
    summary: null,
    ingestSourceHome: m.ingest_source_home,
    ingestSourceAway: m.ingest_source_away,
    ingestSourceHomeGoals: m.ingest_source_home_goals,
    ingestSourceAwayGoals: m.ingest_source_away_goals,
  });

  if (aligned.homeGoals == null || aligned.awayGoals == null) return null;

  const homeTeamId = resolveTeamIdByName(aligned.homeTeamName, teamNameById);
  const awayTeamId = resolveTeamIdByName(aligned.awayTeamName, teamNameById);
  if (!homeTeamId || !awayTeamId) {
    return {
      homeTeamId: m.home_team_id,
      awayTeamId: m.away_team_id,
      homeGoals: aligned.homeGoals,
      awayGoals: aligned.awayGoals,
    };
  }

  return {
    homeTeamId,
    awayTeamId,
    homeGoals: aligned.homeGoals,
    awayGoals: aligned.awayGoals,
  };
}

export function computeGroupStandings(
  groupCode: string,
  teamIds: { teamId: string; teamName: string }[],
  matches: WcMatchRow[]
): GroupStandingRow[] {
  const table = new Map<string, GroupStandingRow>();
  const names = new Map(teamIds.map((t) => [t.teamId, t.teamName]));

  for (const t of teamIds) {
    table.set(t.teamId, {
      teamId: t.teamId,
      teamName: t.teamName,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
      rank: 0,
    });
  }

  const groupMatches = matches.filter(
    (m) =>
      m.group_code?.toUpperCase() === groupCode.toUpperCase() &&
      m.status === "finished" &&
      m.home_goals != null &&
      m.away_goals != null &&
      m.home_team_id &&
      m.away_team_id
  );

  for (const m of groupMatches) {
    const canonical = canonicalizeMatchResultForStandings(m, names);
    if (!canonical) continue;
    applyResult(
      table,
      canonical.homeTeamId,
      canonical.awayTeamId,
      canonical.homeGoals,
      canonical.awayGoals,
      names
    );
  }

  const rows = [...table.values()].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.teamName.localeCompare(b.teamName);
  });

  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

export function buildThirdPlaceCandidates(
  allGroupStandings: Record<string, GroupStandingRow[]>,
  fairPlayByTeam: Map<string, number>
): ThirdPlaceCandidate[] {
  const candidates: ThirdPlaceCandidate[] = [];
  for (const [groupCode, rows] of Object.entries(allGroupStandings)) {
    const third = rows.find((r) => r.rank === 3);
    if (!third) continue;
    candidates.push({
      teamId: third.teamId,
      groupCode,
      points: third.points,
      goalDifference: third.goalDifference,
      goalsFor: third.goalsFor,
      fairPlayPoints: fairPlayByTeam.get(third.teamId) ?? 0,
      fbrefTeamName: third.teamName,
    });
  }
  return candidates;
}

export interface KnockoutProjection {
  lookupKey: string | null;
  allocationFound: boolean;
  advancingThirdGroups: string[];
  slotAssignments: Record<string, string>;
  provisional: boolean;
}

export function buildKnockoutProjection(
  thirdPlaceRanking: (ThirdPlaceCandidate & {
    will_advance: boolean;
    wildcard_rank: number;
  })[],
  allMd3Finished: boolean
): KnockoutProjection {
  const advancingThirdGroups = thirdPlaceRanking
    .filter((c) => c.will_advance)
    .map((c) => c.groupCode.toUpperCase());

  const lookupKey = allocationLookupKey(advancingThirdGroups);
  const slotAssignments = assignKnockoutOpponents(advancingThirdGroups);

  return {
    lookupKey,
    allocationFound: Boolean(lookupKey && hasAllocationMatrix() && Object.keys(slotAssignments).length > 0),
    advancingThirdGroups,
    slotAssignments,
    provisional: !allMd3Finished,
  };
}

function resolveDrawTeamId(
  drawName: string,
  teamNameById: Map<string, string>
): { teamId: string; teamName: string } {
  const teamId = resolveTeamIdByName(drawName, teamNameById);
  if (teamId) {
    return { teamId, teamName: teamNameById.get(teamId) ?? drawName };
  }
  return { teamId: `name:${drawName}`, teamName: drawName };
}

function resolveTeamIdByName(
  name: string,
  teamNameById: Map<string, string>
): string | null {
  const key = normalizeNationalTeamName(name);
  for (const [id, teamName] of teamNameById) {
    if (normalizeNationalTeamName(teamName) === key) return id;
  }
  return null;
}

export function computeAllGroupStandings(
  matches: WcMatchRow[],
  teamNameById: Map<string, string>
): Record<string, GroupStandingRow[]> {
  const draw = loadGroupDraw();
  const result: Record<string, GroupStandingRow[]> = {};
  for (const [code, names] of Object.entries(draw)) {
    const teamIds = names.map((name) => resolveDrawTeamId(name, teamNameById));
    result[code] = computeGroupStandings(code, teamIds, matches);
  }
  return result;
}

export function computeStandingsProjection(
  matches: WcMatchRow[],
  teamNameById: Map<string, string>,
  fairPlayByTeam: Map<string, number>
): {
  groupMatrix: Record<string, GroupStandingRow[]>;
  thirdPlaceRanking: ReturnType<typeof computeThirdPlaceWildcards>;
  knockoutProjection: KnockoutProjection;
} {
  const groupMatrix = computeAllGroupStandings(matches, teamNameById);
  const thirdCandidates = buildThirdPlaceCandidates(groupMatrix, fairPlayByTeam);
  const thirdPlaceRanking = computeThirdPlaceWildcards(thirdCandidates);
  const md3Draw = loadGroupDraw();
  const allMd3Done = Object.keys(md3Draw).every((code) => {
    const groupMatches = matches.filter((m) => m.group_code === code);
    return groupMatches.filter((m) => m.status === "scheduled").length === 0;
  });
  const knockoutProjection = buildKnockoutProjection(thirdPlaceRanking, allMd3Done);
  return { groupMatrix, thirdPlaceRanking, knockoutProjection };
}
