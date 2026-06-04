import {
  formatFifaSnapshotLabel,
  getFifaRankingAtDate,
  getLatestFifaDataSource,
  getLatestFifaRankingForTeam,
  getLatestFifaRankingForTeamId,
  getLatestFifaSnapshot,
  isTop20FifaRank,
} from "@/lib/data/fifa-rankings-store";
import type {
  TeamAttackingInsights,
  TeamBettingInsights,
  TeamBettingTrendInsights,
  TeamDefensiveInsights,
  TeamFifaRankingInsights,
  TeamFormRecord,
  TeamMatchHistoryRow,
  TeamQualifyingInsights,
  TeamRecentPerformanceInsights,
  TeamSquadProfileInsights,
  TeamVsTop20Insights,
} from "@/lib/types/team-betting-insights";
import { BETTING_INSIGHTS_WINDOW } from "@/lib/data/team-comparison-utils";

export { BETTING_INSIGHTS_WINDOW };

const WCQ_COMPETITION_RE =
  /wcq|world cup qual|qualification|qualifying|play-?off|playoff|inter-confederation/i;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function roundPct(n: number): number {
  return Math.round(n * 10) / 10;
}

function resultFromScore(gf: number, ga: number): "W" | "D" | "L" {
  if (gf > ga) return "W";
  if (gf < ga) return "L";
  return "D";
}

function isWcqCompetition(competition: string | null): boolean {
  if (!competition?.trim()) return false;
  return WCQ_COMPETITION_RE.test(competition);
}

export function sortMatchesNewestFirst(rows: TeamMatchHistoryRow[]): TeamMatchHistoryRow[] {
  return [...rows].sort((a, b) => b.date.localeCompare(a.date));
}

export function dedupeMatchHistory(rows: TeamMatchHistoryRow[]): TeamMatchHistoryRow[] {
  const seen = new Set<string>();
  const out: TeamMatchHistoryRow[] = [];
  for (const row of sortMatchesNewestFirst(rows)) {
    const key = `${row.date}|${row.opponent.toLowerCase()}|${row.goalsFor}-${row.goalsAgainst}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

export function computeFormRecord(rows: TeamMatchHistoryRow[]): TeamFormRecord {
  let wins = 0;
  let draws = 0;
  let losses = 0;
  for (const row of rows) {
    const r = resultFromScore(row.goalsFor, row.goalsAgainst);
    if (r === "W") wins += 1;
    else if (r === "D") draws += 1;
    else losses += 1;
  }
  return { wins, draws, losses };
}

export function computeRecentPerformance(
  rows: TeamMatchHistoryRow[],
  window = BETTING_INSIGHTS_WINDOW
): TeamRecentPerformanceInsights | null {
  const sample = rows.slice(0, window);
  if (!sample.length) return null;

  let gf = 0;
  let ga = 0;
  let cleanSheets = 0;
  let fts = 0;

  for (const row of sample) {
    gf += row.goalsFor;
    ga += row.goalsAgainst;
    if (row.goalsAgainst === 0) cleanSheets += 1;
    if (row.goalsFor === 0) fts += 1;
  }

  const n = sample.length;
  return {
    windowSize: n,
    windowLabel: `Last ${n} match${n === 1 ? "" : "es"}`,
    record: computeFormRecord(sample),
    goalDifferential: gf - ga,
    goalsForPerGame: round1(gf / n),
    goalsAgainstPerGame: round1(ga / n),
    cleanSheetPct: roundPct((cleanSheets / n) * 100),
    failedToScorePct: roundPct((fts / n) * 100),
  };
}

export function computeBettingTrends(
  rows: TeamMatchHistoryRow[],
  window = BETTING_INSIGHTS_WINDOW
): TeamBettingTrendInsights | null {
  const sample = rows.slice(0, window);
  if (!sample.length) return null;

  let btts = 0;
  let over25 = 0;

  for (const row of sample) {
    if (row.goalsFor > 0 && row.goalsAgainst > 0) btts += 1;
    if (row.goalsFor + row.goalsAgainst > 2) over25 += 1;
  }

  const n = sample.length;
  return {
    windowSize: n,
    bttsYesPct: roundPct((btts / n) * 100),
    over25Pct: roundPct((over25 / n) * 100),
  };
}

export function computeVsTop20Performance(
  rows: TeamMatchHistoryRow[],
  window = BETTING_INSIGHTS_WINDOW
): TeamVsTop20Insights | null {
  const sample = rows.slice(0, window);
  const elite: TeamMatchHistoryRow[] = [];

  for (const row of sample) {
    const opp = getFifaRankingAtDate(row.opponent, row.date);
    if (opp && isTop20FifaRank(opp.rank)) elite.push(row);
  }

  if (!elite.length) return null;

  const record = computeFormRecord(elite);
  const points = record.wins * 3 + record.draws;
  const n = elite.length;
  return {
    matchesPlayed: n,
    wins: record.wins,
    draws: record.draws,
    losses: record.losses,
    ppg: round1(points / n),
    winPct: roundPct((record.wins / n) * 100),
  };
}

export function computeQualifyingInsights(
  rows: TeamMatchHistoryRow[]
): TeamQualifyingInsights | null {
  const wcq = rows.filter((r) => isWcqCompetition(r.competition));
  if (!wcq.length) return null;

  const record = computeFormRecord(wcq);
  const points = record.wins * 3 + record.draws;
  return {
    matchesPlayed: wcq.length,
    points,
    ppg: round1(points / wcq.length),
    wins: record.wins,
    draws: record.draws,
    losses: record.losses,
  };
}

export interface FbrefTeamAggregateInput {
  shooting: Array<Record<string, unknown>>;
  keeper: Array<Record<string, unknown>>;
  misc: Array<Record<string, unknown>>;
  standard: Array<Record<string, unknown>>;
}

function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Eleven players share each minute of team match time. */
const PLAYERS_ON_PITCH = 11;

const PER_90_STAT_KEY_RE = /(?:^|_)(?:per_?90|90s)(?:$|_)|\/90/i;

/** FBref minutes: `minutes_90s` is in 90-minute units (8.0 = 720 minutes). */
export function resolvePlayerMinutes(row: Record<string, unknown>): number {
  const nineties = num(row.minutes_90s);
  const direct = num(row.minutes ?? row.min ?? row.gk_minutes);
  if (direct > 0) {
    // Mislabeled exports sometimes put 90s in `minutes` (e.g. 6 instead of 540).
    if (direct < 90 && nineties > 0 && nineties * 90 > direct) {
      return nineties * 90;
    }
    return direct;
  }
  if (nineties > 0) return nineties * 90;
  return 0;
}

function countingStatValue(
  row: Record<string, unknown>,
  valueKeys: string[]
): number {
  for (const key of valueKeys) {
    if (PER_90_STAT_KEY_RE.test(key)) continue;
    const value = num(row[key]);
    if (value > 0) return value;
  }
  return 0;
}

/**
 * FBref player season rows can repeat for the same player + competition when
 * imports are re-run. Keep the row with the most minutes per key.
 */
export function dedupeStandardStatRows(
  rows: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  const best = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const playerKey = String(
      row.player_id ?? row.player_name ?? row.player ?? ""
    )
      .trim()
      .toLowerCase();
    const compKey = String(row.competition ?? "").trim().toLowerCase();
    const key = `${playerKey}|${compKey}`;
    const prev = best.get(key);
    const mins = resolvePlayerMinutes(row);
    const prevMins = prev ? resolvePlayerMinutes(prev) : -1;
    if (!prev || mins > prevMins) best.set(key, row);
  }
  return [...best.values()];
}

function sumDedupedStat(
  rows: Array<Record<string, unknown>>,
  valueKeys: string[]
): number {
  let total = 0;
  for (const row of dedupeStandardStatRows(rows)) {
    if (resolvePlayerMinutes(row) <= 0) continue;
    total += countingStatValue(row, valueKeys);
  }
  return total;
}

/** Team rate per 90 minutes of match time (not per player-minute). */
export function teamStatPer90FromRows(
  rows: Array<Record<string, unknown>>,
  valueKeys: string[]
): number | null {
  const deduped = dedupeStandardStatRows(rows);
  let total = 0;
  let playerMinutes = 0;
  for (const row of deduped) {
    const mins = resolvePlayerMinutes(row);
    if (mins <= 0) continue;
    total += countingStatValue(row, valueKeys);
    playerMinutes += mins;
  }
  const teamMatchMinutes = playerMinutes / PLAYERS_ON_PITCH;
  if (teamMatchMinutes <= 0 || total <= 0) return null;
  return round1((total / teamMatchMinutes) * 90);
}

/** Team yellow cards per 90 minutes of match time (not per player-minute). */
export function teamYellowCardsPer90FromStandard(
  rows: Array<Record<string, unknown>>
): number | null {
  return teamStatPer90FromRows(rows, ["cards_yellow", "crdy"]);
}

/**
 * Save % from keeper counting stats (saves / shots on target faced).
 * Cannot reach 100% when goals against are recorded.
 */
export function teamGoalkeeperSavePctFromKeeper(
  rows: Array<Record<string, unknown>>
): number | null {
  const deduped = dedupeStandardStatRows(rows);
  let saves = 0;
  let sotAgainst = 0;
  let goalsAgainst = 0;

  for (const row of deduped) {
    if (resolvePlayerMinutes(row) <= 0) continue;
    saves += num(row.gk_saves);
    sotAgainst += num(row.gk_shots_on_target_against);
    goalsAgainst += num(row.gk_goals_against);
  }

  if (sotAgainst > 0) {
    const pct = (saves / sotAgainst) * 100;
    if (goalsAgainst > 0 && pct >= 100) {
      const denom = saves + goalsAgainst;
      return denom > 0 ? roundPct((saves / denom) * 100) : null;
    }
    return roundPct(pct);
  }

  if (saves + goalsAgainst > 0) {
    return roundPct((saves / (saves + goalsAgainst)) * 100);
  }

  let saveWeighted = 0;
  let saveWeight = 0;
  for (const row of deduped) {
    let pct = num(row.gk_save_pct ?? row.save_pct);
    const mins = resolvePlayerMinutes(row);
    if (pct <= 0 || mins <= 0) continue;
    if (pct > 0 && pct <= 1) pct *= 100;
    saveWeighted += pct * mins;
    saveWeight += mins;
  }
  if (saveWeight <= 0) return null;
  let result = roundPct(saveWeighted / saveWeight);
  if (goalsAgainst > 0 && result >= 100) {
    const denom = saves + goalsAgainst;
    result = denom > 0 ? roundPct((saves / denom) * 100) : result;
  }
  return result;
}

export function aggregateFbrefTeamStats(
  input: FbrefTeamAggregateInput
): {
  attacking: TeamAttackingInsights;
  defensive: TeamDefensiveInsights;
  squad: TeamSquadProfileInsights;
} {
  const goalsShots = sumDedupedStat(input.shooting, ["goals", "gls"]);
  const shots = sumDedupedStat(input.shooting, ["shots", "sh"]);

  const shotConversionPct =
    shots > 0 ? roundPct((goalsShots / shots) * 100) : null;

  let topScorerName: string | null = null;
  let topGoals = 0;
  let teamGoals = 0;
  let weightedAge = 0;
  let ageMinutes = 0;
  let squadPlayersUsed = 0;
  let pensMade = 0;
  let pensAtt = 0;

  for (const row of dedupeStandardStatRows(input.standard)) {
    const mins = resolvePlayerMinutes(row);
    const goals = num(row.goals ?? row.gls);
    const name = String(row.player_name ?? row.player ?? "").trim();
    const age = num(row.age);

    if (mins > 0) {
      squadPlayersUsed += 1;
      teamGoals += goals;
      if (goals > topGoals) {
        topGoals = goals;
        topScorerName = name || null;
      }
      if (age > 0) {
        weightedAge += age * mins;
        ageMinutes += mins;
      }
    }

    pensMade += num(row.pens_made);
    pensAtt += num(row.pens_att);
  }

  for (const row of input.shooting) {
    pensMade += num(row.pens_made);
    pensAtt += num(row.pens_att);
  }

  const topScorerSharePct =
    teamGoals > 0 && topGoals > 0 ? roundPct((topGoals / teamGoals) * 100) : null;

  return {
    attacking: {
      shotConversionPct,
      shotsPer90: teamStatPer90FromRows(input.shooting, ["shots", "sh"]),
      shotsOnTargetPer90: teamStatPer90FromRows(input.shooting, [
        "shots_on_target",
      ]),
      crossesPer90: teamStatPer90FromRows(input.misc, ["crosses", "crs"]),
      topScorerSharePct,
      topScorerName,
    },
    defensive: {
      goalkeeperSavePct: teamGoalkeeperSavePctFromKeeper(input.keeper),
      tacklesPer90: teamStatPer90FromRows(input.misc, [
        "tackles_won",
        "tklw",
        "tackles",
      ]),
      interceptionsPer90: teamStatPer90FromRows(input.misc, [
        "interceptions",
        "int",
      ]),
      shotsConcededPerGame: null,
    },
    squad: {
      averageAge: ageMinutes > 0 ? round1(weightedAge / ageMinutes) : null,
      squadPlayersUsed,
      penaltyConversionPct:
        pensAtt > 0 ? roundPct((pensMade / pensAtt) * 100) : null,
      yellowCardsPer90: teamYellowCardsPer90FromStandard(input.standard),
    },
  };
}

export function computeRestDaysBefore(
  kickoffDate: string,
  lastMatchDate: string | null
): number | null {
  if (!lastMatchDate) return null;
  const kickoff = new Date(`${kickoffDate.slice(0, 10)}T12:00:00`);
  const last = new Date(`${lastMatchDate.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(kickoff.getTime()) || Number.isNaN(last.getTime())) return null;
  const diffMs = kickoff.getTime() - last.getTime();
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  return Math.max(0, days);
}

export function computeTeamBettingInsights(input: {
  matches: TeamMatchHistoryRow[];
  fbref?: FbrefTeamAggregateInput | null;
  shotsConcededPerGame?: number | null;
  source: TeamBettingInsights["source"];
  teamName?: string;
  fifaRanking?: TeamFifaRankingInsights | null;
}): TeamBettingInsights {
  const history = dedupeMatchHistory(input.matches);
  const recent = computeRecentPerformance(history);
  const bettingTrends = computeBettingTrends(history);
  const qualifying = computeQualifyingInsights(history);
  const vsTop20 = computeVsTop20Performance(history);

  let attacking: TeamAttackingInsights | null = null;
  let defensive: TeamDefensiveInsights | null = null;
  let squad: TeamSquadProfileInsights | null = null;

  if (input.fbref) {
    const agg = aggregateFbrefTeamStats(input.fbref);
    attacking = agg.attacking;
    defensive = {
      ...agg.defensive,
      shotsConcededPerGame: input.shotsConcededPerGame ?? null,
    };
    squad = agg.squad;
  } else if (input.shotsConcededPerGame != null) {
    defensive = {
      goalkeeperSavePct: null,
      tacklesPer90: null,
      interceptionsPer90: null,
      shotsConcededPerGame: input.shotsConcededPerGame,
    };
  }

  return {
    source: input.source,
    fifaRanking: input.fifaRanking ?? null,
    vsTop20,
    recent,
    bettingTrends,
    qualifying,
    attacking,
    defensive,
    squad,
  };
}

export function buildFifaRankingInsights(
  teamName: string,
  teamId?: number
): TeamFifaRankingInsights | null {
  const entry =
    teamId != null
      ? getLatestFifaRankingForTeamId(teamId, teamName)
      : getLatestFifaRankingForTeam(teamName);
  const snapshot = getLatestFifaSnapshot();
  if (!entry || !snapshot) return null;
  return {
    rank: entry.rank,
    points: round2(entry.points),
    snapshotLabel: formatFifaSnapshotLabel(snapshot, getLatestFifaDataSource()),
  };
}
