import { normalizeNationalTeamName } from "@/lib/data/world-cup-2026-teams";
import type { GroupStandingRow, WcMatchRow } from "@/lib/world-cup/standings";
import { OFFICIAL_WC_2026_SQUADS } from "@/lib/data/world-cup-2026-official-squads";

export interface MotivationParams {
  sigmaHome: number;
  sigmaAway: number;
  rhoOffset: number;
  scenario: string;
  /** Host-nation crowd / stakes multiplier on home sigma (distinct from xG host boost). */
  hostMotivationHome?: number;
  stakesIndex?: number;
  md3Permutation?: {
    scenarios: Array<{ label: string; weight: number }>;
    finalSigmaHome: number;
    finalSigmaAway: number;
    finalRhoOffset: number;
  };
}

const ROTATION_MIN = 0.92;
const ROTATION_MAX = 0.95;

/** xG multiplier when a co-host plays in a home-nation venue. */
export function resolveHostNationXgBoost(matchCity: string | null, homeName: string): number {
  const city = (matchCity ?? "").toLowerCase();
  const home = normalizeNationalTeamName(homeName).toLowerCase();
  if (home.includes("mexico") && city.includes("mexico")) return 1.05;
  if (
    home.includes("united states") &&
    (city.includes("usa") || city.includes("york") || city.includes("angeles"))
  ) {
    return 1.04;
  }
  if (home.includes("canada") && (city.includes("toronto") || city.includes("vancouver"))) {
    return 1.04;
  }
  return 1;
}

/** Motivation sigma boost for co-hosts (separate ML feature from xG host boost). */
export function resolveHostMotivationBoost(matchCity: string | null, homeName: string): number {
  const xgBoost = resolveHostNationXgBoost(matchCity, homeName);
  if (xgBoost <= 1) return 1;
  return xgBoost >= 1.05 ? 1.05 : 1.03;
}

export function encodeStakesIndex(input: {
  isKnockout: boolean;
  isMatchday3: boolean;
}): number {
  if (input.isKnockout) return 2;
  if (input.isMatchday3) return 1.5;
  return 1;
}

export function buildMotivationFeatureSnapshot(input: {
  motivation: MotivationParams;
  hostMotivationHome: number;
  stakesIndex: number;
}): Record<string, number | boolean | string> {
  const { motivation, hostMotivationHome, stakesIndex } = input;
  return {
    motivation_sigma_home: motivation.sigmaHome,
    motivation_sigma_away: motivation.sigmaAway,
    motivation_sigma_diff: motivation.sigmaHome - motivation.sigmaAway,
    motivation_rho_offset: motivation.rhoOffset,
    motivation_scenario: motivation.scenario,
    is_mutual_draw: motivation.scenario.includes("mutual_draw"),
    is_rotation: motivation.scenario.includes("rotation"),
    is_host_nation_home: hostMotivationHome > 1,
    host_motivation_boost: hostMotivationHome,
    stakes_index: stakesIndex,
  };
}

function squadDepthFactor(teamName: string): number {
  const squad = OFFICIAL_WC_2026_SQUADS.teams[teamName];
  if (!squad?.players?.length) return ROTATION_MAX;
  const topLeagueMarkers = ["Premier League", "La Liga", "Bundesliga", "Serie A", "Ligue 1"];
  let score = 0;
  for (const p of squad.players) {
    if (topLeagueMarkers.some((m) => p.club.includes(m))) score += 1;
  }
  const ratio = score / squad.players.length;
  return ROTATION_MAX - (ROTATION_MAX - ROTATION_MIN) * (1 - ratio);
}

function isGroupWinnerClinched(row: GroupStandingRow, standings: GroupStandingRow[]): boolean {
  if (row.rank !== 1 || row.played < 2) return false;
  const second = standings.find((r) => r.rank === 2);
  if (!second) return row.points >= 6 && row.goalDifference >= 5;
  const maxSecondPts = second.points + (3 - second.played) * 3;
  return row.points > maxSecondPts + 3 || (row.points > maxSecondPts && row.goalDifference > second.goalDifference + 5);
}

function bothAdvanceOnDraw(
  homeId: string,
  awayId: string,
  standings: GroupStandingRow[]
): boolean {
  const home = standings.find((r) => r.teamId === homeId);
  const away = standings.find((r) => r.teamId === awayId);
  if (!home || !away) return false;
  const homeDrawPts = home.points + 1;
  const awayDrawPts = away.points + 1;
  return homeDrawPts >= 4 && awayDrawPts >= 4 && home.rank <= 2 && away.rank <= 2;
}

type MiniOutcome = "W" | "D" | "L";

function applyMiniResult(
  rows: GroupStandingRow[],
  teamA: string,
  teamB: string,
  outcomeA: MiniOutcome
): GroupStandingRow[] {
  const clone = rows.map((r) => ({ ...r }));
  const a = clone.find((r) => r.teamId === teamA);
  const b = clone.find((r) => r.teamId === teamB);
  if (!a || !b) return clone;

  a.played += 1;
  b.played += 1;
  if (outcomeA === "W") {
    a.won += 1;
    a.points += 3;
    a.goalsFor += 1;
    b.lost += 1;
    b.goalsAgainst += 1;
  } else if (outcomeA === "L") {
    b.won += 1;
    b.points += 3;
    b.goalsFor += 1;
    a.lost += 1;
    a.goalsAgainst += 1;
  } else {
    a.drawn += 1;
    b.drawn += 1;
    a.points += 1;
    b.points += 1;
  }
  a.goalDifference = a.goalsFor - a.goalsAgainst;
  b.goalDifference = b.goalsFor - b.goalsAgainst;

  return clone
    .sort((x, y) => {
      if (y.points !== x.points) return y.points - x.points;
      if (y.goalDifference !== x.goalDifference) return y.goalDifference - x.goalDifference;
      return y.goalsFor - x.goalsFor;
    })
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

export function isMatchday3Pair(fixtures: WcMatchRow[]): boolean {
  if (fixtures.length !== 2) return false;
  const g = fixtures[0].group_code;
  return Boolean(g && fixtures.every((f) => f.group_code === g));
}

export function resolveGroupMatchday3Strategy(
  fixtures: [WcMatchRow, WcMatchRow],
  standingsBeforeMd3: GroupStandingRow[],
  baselineProb: { pHomeWin: number; pDraw: number; pAwayWin: number }
): { matchA: MotivationParams; matchB: MotivationParams } {
  const [fa, fb] = fixtures;
  const teamIdsA = [fa.home_team_id!, fa.away_team_id!];
  const teamIdsB = [fb.home_team_id!, fb.away_team_id!];

  const scenarios: Array<{
    label: string;
    weight: number;
    rho: number;
    sigmaA: number;
    sigmaB: number;
  }> = [];

  const grid: Array<[MiniOutcome, MiniOutcome]> = [
    ["W", "W"],
    ["W", "D"],
    ["D", "W"],
    ["D", "D"],
  ];

  for (const [oa, ob] of grid) {
    let rows = [...standingsBeforeMd3];
    rows = applyMiniResult(rows, teamIdsA[0], teamIdsA[1], oa);
    rows = applyMiniResult(rows, teamIdsB[0], teamIdsB[1], ob);

    const weight =
      (oa === "W" ? baselineProb.pHomeWin : oa === "D" ? baselineProb.pDraw : baselineProb.pAwayWin) *
      (ob === "W" ? baselineProb.pHomeWin : ob === "D" ? baselineProb.pDraw : baselineProb.pAwayWin);

    const mutualA = bothAdvanceOnDraw(teamIdsA[0], teamIdsA[1], rows);
    const mutualB = bothAdvanceOnDraw(teamIdsB[0], teamIdsB[1], rows);

    scenarios.push({
      label: `${oa}/${ob}`,
      weight,
      rho: mutualA || mutualB ? -0.08 : 0,
      sigmaA: 1,
      sigmaB: 1,
    });
  }

  const totalW = scenarios.reduce((s, x) => s + x.weight, 0) || 1;
  let rhoOffset = 0;
  for (const s of scenarios) rhoOffset += (s.weight / totalW) * s.rho;

  const matchA = resolveSingleFixtureMotivation(
    fa.home_team_id!,
    fa.away_team_id!,
    standingsBeforeMd3,
    fa.home_team_name ?? "Home",
    fa.away_team_name ?? "Away"
  );
  const matchB = resolveSingleFixtureMotivation(
    fb.home_team_id!,
    fb.away_team_id!,
    standingsBeforeMd3,
    fb.home_team_name ?? "Home",
    fb.away_team_name ?? "Away"
  );

  matchA.rhoOffset = Math.min(matchA.rhoOffset, rhoOffset);
  matchB.rhoOffset = Math.min(matchB.rhoOffset, rhoOffset);
  matchA.scenario = "md3_joint_permutation";
  matchB.scenario = "md3_joint_permutation";
  matchA.md3Permutation = {
    scenarios: scenarios.map((s) => ({ label: s.label, weight: s.weight / totalW })),
    finalSigmaHome: matchA.sigmaHome,
    finalSigmaAway: matchA.sigmaAway,
    finalRhoOffset: matchA.rhoOffset,
  };
  matchB.md3Permutation = matchA.md3Permutation;

  return { matchA, matchB };
}

export function resolveSingleFixtureMotivation(
  homeTeamId: string,
  awayTeamId: string,
  standings: GroupStandingRow[],
  homeName: string,
  awayName: string
): MotivationParams {
  let sigmaHome = 1;
  let sigmaAway = 1;
  let rhoOffset = 0;
  let scenario = "standard";

  if (bothAdvanceOnDraw(homeTeamId, awayTeamId, standings)) {
    scenario = "mutual_draw_benefit";
    rhoOffset = -0.12;
  }

  const homeRow = standings.find((r) => r.teamId === homeTeamId);
  const awayRow = standings.find((r) => r.teamId === awayTeamId);
  if (homeRow && isGroupWinnerClinched(homeRow, standings)) {
    sigmaHome = squadDepthFactor(homeName);
    scenario = scenario === "mutual_draw_benefit" ? "mutual_draw_and_rotation" : "rotation";
  }
  if (awayRow && isGroupWinnerClinched(awayRow, standings)) {
    sigmaAway = squadDepthFactor(awayName);
    scenario = scenario === "mutual_draw_benefit" ? "mutual_draw_and_rotation" : "rotation";
  }

  return { sigmaHome, sigmaAway, rhoOffset, scenario };
}

export function countFinishedGroupMatches(teamId: string, matches: WcMatchRow[]): number {
  return matches.filter(
    (m) =>
      m.status === "finished" &&
      m.group_code &&
      (m.home_team_id === teamId || m.away_team_id === teamId)
  ).length;
}

export function isMatchday3Fixture(teamId: string, matches: WcMatchRow[]): boolean {
  return countFinishedGroupMatches(teamId, matches) === 2;
}
