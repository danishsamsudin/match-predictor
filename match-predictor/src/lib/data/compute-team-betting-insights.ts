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

function sumByMinutes(
  rows: Array<Record<string, unknown>>,
  valueKeys: string[],
  minutesKeys: string[] = ["minutes", "min", "minutes_90s"]
): { total: number; minutes: number } {
  let total = 0;
  let minutes = 0;
  for (const row of rows) {
    const mins = minutesKeys.reduce((m, k) => m || num(row[k]), 0);
    if (mins <= 0) continue;
    const value = valueKeys.reduce((v, k) => v || num(row[k]), 0);
    total += value;
    minutes += mins;
  }
  return { total, minutes };
}

export function aggregateFbrefTeamStats(
  input: FbrefTeamAggregateInput
): {
  attacking: TeamAttackingInsights;
  defensive: TeamDefensiveInsights;
  squad: TeamSquadProfileInsights;
} {
  const goalsShots = sumByMinutes(input.shooting, ["goals", "gls"]);
  const shots = sumByMinutes(input.shooting, ["shots", "sh"]);
  const sot = sumByMinutes(input.shooting, ["shots_on_target", "sot"]);
  const crosses = sumByMinutes(input.misc, ["crosses", "crs"]);

  const shotConversionPct =
    shots.total > 0 ? roundPct((goalsShots.total / shots.total) * 100) : null;

  const per90 = (total: number, minutes: number) =>
    minutes > 0 ? round1((total / minutes) * 90) : null;

  let topScorerName: string | null = null;
  let topGoals = 0;
  let teamGoals = 0;
  let weightedAge = 0;
  let ageMinutes = 0;
  let squadPlayersUsed = 0;
  let pensMade = 0;
  let pensAtt = 0;
  let yellowTotal = 0;
  let yellowMinutes = 0;

  for (const row of input.standard) {
    const mins = num(row.minutes ?? row.min);
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
    yellowTotal += num(row.cards_yellow ?? row.crdy);
    if (mins > 0) yellowMinutes += mins;
  }

  for (const row of input.shooting) {
    pensMade += num(row.pens_made);
    pensAtt += num(row.pens_att);
  }

  const topScorerSharePct =
    teamGoals > 0 && topGoals > 0 ? roundPct((topGoals / teamGoals) * 100) : null;

  let saveWeighted = 0;
  let saveWeight = 0;
  for (const row of input.keeper) {
    const pct = num(row.gk_save_pct ?? row.save_pct);
    const mins = num(row.gk_minutes ?? row.minutes ?? row.min);
    if (pct > 0 && mins > 0) {
      saveWeighted += pct * mins;
      saveWeight += mins;
    }
  }

  const tackles = sumByMinutes(input.misc, ["tackles_won", "tklw", "tackles"]);
  const interceptions = sumByMinutes(input.misc, ["interceptions", "int"]);

  return {
    attacking: {
      shotConversionPct,
      shotsPer90: per90(shots.total, shots.minutes),
      shotsOnTargetPer90: per90(sot.total, sot.minutes),
      crossesPer90: per90(crosses.total, crosses.minutes),
      topScorerSharePct,
      topScorerName,
    },
    defensive: {
      goalkeeperSavePct: saveWeight > 0 ? roundPct(saveWeighted / saveWeight) : null,
      tacklesPer90: per90(tackles.total, tackles.minutes),
      interceptionsPer90: per90(interceptions.total, interceptions.minutes),
      shotsConcededPerGame: null,
    },
    squad: {
      averageAge: ageMinutes > 0 ? round1(weightedAge / ageMinutes) : null,
      squadPlayersUsed,
      penaltyConversionPct:
        pensAtt > 0 ? roundPct((pensMade / pensAtt) * 100) : null,
      yellowCardsPer90: per90(yellowTotal, yellowMinutes),
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
