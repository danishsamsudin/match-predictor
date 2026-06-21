import { playerNameLookupKeys } from "@/lib/data/resolve-squad-player-metrics";
import { normalizeText } from "@/lib/soccerdata/normalize";
import type { GoldenBootPredictionPayload } from "@/lib/world-cup/golden-boot-prediction";
import { resolveApiTeamId } from "@/lib/world-cup/resolve-api-team-id";
import type { SupabaseClient } from "@supabase/supabase-js";

type PlayerGoalRow = {
  team_api_id: number;
  player_name: string;
  stats: Record<string, unknown> | null;
};

type TeamGoalEntry = {
  displayName: string;
  goals: number;
};

export type TournamentGoalTotals = {
  byTeam: Map<string, Map<string, TeamGoalEntry>>;
  leaderboard: Array<{ teamId: string; playerName: string; goals: number }>;
};

function parseGoalValue(stats: Record<string, unknown> | null): number {
  if (!stats) return 0;
  const raw = stats.goals ?? stats.G;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function namesOverlap(a: string, b: string): boolean {
  const aKeys = new Set(playerNameLookupKeys(a).map(normalizeText));
  const bKeys = playerNameLookupKeys(b).map(normalizeText);
  return bKeys.some((key) => aKeys.has(key));
}

export function resolvePlayerGoals(
  teamGoals: Map<string, TeamGoalEntry> | undefined,
  playerName: string
): number {
  if (!teamGoals?.size) return 0;
  for (const entry of teamGoals.values()) {
    if (namesOverlap(playerName, entry.displayName)) return entry.goals;
  }
  return 0;
}

export async function loadTournamentGoalTotals(
  client: SupabaseClient | null,
  teamNames: Map<string, string>
): Promise<TournamentGoalTotals> {
  const empty: TournamentGoalTotals = { byTeam: new Map(), leaderboard: [] };
  if (!client) return empty;

  const apiToTeamId = new Map<number, string>();
  for (const [teamId, name] of teamNames) {
    const apiId = resolveApiTeamId(teamId, name);
    if (apiId > 0) apiToTeamId.set(apiId, teamId);
  }

  const { data, error } = await client
    .from("world_cup_player_match_stats")
    .select("team_api_id, player_name, stats");

  if (error || !data?.length) return empty;

  const byTeam = new Map<string, Map<string, TeamGoalEntry>>();

  for (const row of data as PlayerGoalRow[]) {
    const teamId = apiToTeamId.get(Number(row.team_api_id));
    if (!teamId) continue;

    const goals = parseGoalValue(row.stats);
    if (goals <= 0) continue;

    const playerName = String(row.player_name);
    const normKey = normalizeText(playerName);
    if (!byTeam.has(teamId)) byTeam.set(teamId, new Map());
    const teamMap = byTeam.get(teamId)!;

    const existing = teamMap.get(normKey);
    if (existing) {
      existing.goals += goals;
    } else {
      teamMap.set(normKey, { displayName: playerName, goals });
    }
  }

  const leaderboard: TournamentGoalTotals["leaderboard"] = [];
  for (const [teamId, teamGoals] of byTeam) {
    for (const entry of teamGoals.values()) {
      leaderboard.push({
        teamId,
        playerName: entry.displayName,
        goals: entry.goals,
      });
    }
  }

  leaderboard.sort((a, b) => {
    if (b.goals !== a.goals) return b.goals - a.goals;
    return a.playerName.localeCompare(b.playerName);
  });

  return { byTeam, leaderboard };
}

function rankLeaderboard(
  leaderboard: TournamentGoalTotals["leaderboard"]
): Map<string, number> {
  const ranks = new Map<string, number>();
  let rank = 0;
  let prevGoals: number | null = null;

  for (const entry of leaderboard) {
    if (prevGoals == null || entry.goals < prevGoals) {
      rank += 1;
      prevGoals = entry.goals;
    }
    ranks.set(`${entry.teamId}::${normalizeText(entry.playerName)}`, rank);
  }

  return ranks;
}

function liveRankForPlayer(
  ranks: Map<string, number>,
  teamId: string,
  playerName: string,
  goals: number
): number | null {
  if (goals <= 0) return null;
  const direct = ranks.get(`${teamId}::${normalizeText(playerName)}`);
  if (direct != null) return direct;
  for (const [key, rank] of ranks) {
    if (!key.startsWith(`${teamId}::`)) continue;
    const otherName = key.slice(teamId.length + 2);
    if (namesOverlap(playerName, otherName)) return rank;
  }
  return null;
}

export function enrichGoldenBootWithLiveGoals(
  predictions: GoldenBootPredictionPayload,
  totals: TournamentGoalTotals
): GoldenBootPredictionPayload {
  const ranks = rankLeaderboard(totals.leaderboard);
  const leaderGoals = totals.leaderboard[0]?.goals ?? 0;

  const candidates = predictions.candidates.map((row) => {
    const goalsSoFar = resolvePlayerGoals(totals.byTeam.get(row.teamId), row.playerName);
    const liveTournamentRank = liveRankForPlayer(
      ranks,
      row.teamId,
      row.playerName,
      goalsSoFar
    );

    return {
      ...row,
      goalsSoFar,
      liveTournamentRank,
      isLiveLeader: leaderGoals > 0 && goalsSoFar === leaderGoals,
    };
  });

  return {
    ...predictions,
    candidates,
    liveLeader:
      leaderGoals > 0
        ? {
            playerName: totals.leaderboard[0].playerName,
            teamId: totals.leaderboard[0].teamId,
            goals: leaderGoals,
          }
        : null,
  };
}

export async function applyLiveGoldenBootGoals(
  client: SupabaseClient | null,
  teamNames: Map<string, string>,
  predictions: GoldenBootPredictionPayload | null
): Promise<GoldenBootPredictionPayload | null> {
  if (!predictions?.candidates.length) return predictions;
  const totals = await loadTournamentGoalTotals(client, teamNames);
  return enrichGoldenBootWithLiveGoals(predictions, totals);
}

export function freezeGoldenBootPredictions(
  previous: GoldenBootPredictionPayload | null | undefined,
  fresh: GoldenBootPredictionPayload | null
): GoldenBootPredictionPayload | null {
  if (previous?.candidates.length) {
    return {
      ...previous,
      frozenAt: previous.frozenAt ?? new Date().toISOString(),
      warnings: fresh?.warnings ?? previous.warnings,
    };
  }
  if (!fresh) return null;
  return {
    ...fresh,
    frozenAt: fresh.frozenAt ?? new Date().toISOString(),
  };
}
