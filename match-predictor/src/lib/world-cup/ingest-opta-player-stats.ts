import { getFifaRankingPoints } from "@/lib/prediction/fifa-team-strength";
import {
  buildCompositesForFixture,
  computePlayerTournamentForm,
  type TeamTerritoryInput,
} from "@/lib/world-cup/wc-tournament-composites";
import {
  parseOptaPlayerStatsFixture,
  type ParsedOptaFixture,
} from "@/lib/world-cup/opta-player-stats-parser";
import { resolveWcMatchFromParsedTeams } from "@/lib/world-cup/resolve-wc-match";
import {
  assertPlayerStatsHtmlBundle,
  listWcPlayerStatsFixtures,
  type WcPlayerStatsFixtureFiles,
} from "@/lib/world-cup/wc-player-stats-dir";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PlayerStatsIngestResult = {
  fixtureKey: string;
  matchId: string | null;
  parsed: ParsedOptaFixture;
  skipped?: boolean;
  skipReason?: string;
};

function opponentStrength(teamApiId: number): number {
  const fifa = getFifaRankingPoints(teamApiId) ?? 1400;
  return Math.max(0.65, Math.min(1.45, fifa / 1400));
}

async function loadTerritoryFromIngest(
  supabase: SupabaseClient,
  matchId: string
): Promise<{ home: TeamTerritoryInput | null; away: TeamTerritoryInput | null }> {
  const { data } = await supabase
    .from("world_cup_post_match_ingests")
    .select("parsed")
    .eq("match_id", matchId)
    .order("ingested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const parsed = data?.parsed as {
    matchSummary?: {
      stats?: Array<{ key: string; home: number | null; away: number | null }>;
    };
    widgetStats?: {
      home?: { possessionPct?: number | null; finalThirdEntries?: number | null; penaltyAreaEntries?: number | null };
      away?: { possessionPct?: number | null; finalThirdEntries?: number | null; penaltyAreaEntries?: number | null };
    };
  } | null;

  const ws = parsed?.widgetStats;
  if (ws?.home || ws?.away) {
    return {
      home: {
        possessionPct: ws.home?.possessionPct ?? null,
        finalThirdEntries: ws.home?.finalThirdEntries ?? null,
        penaltyAreaEntries: ws.home?.penaltyAreaEntries ?? null,
      },
      away: {
        possessionPct: ws.away?.possessionPct ?? null,
        finalThirdEntries: ws.away?.finalThirdEntries ?? null,
        penaltyAreaEntries: ws.away?.penaltyAreaEntries ?? null,
      },
    };
  }

  const stats = parsed?.matchSummary?.stats ?? [];
  const poss = stats.find((s) => s.key === "possession");
  if (poss) {
    return {
      home: { possessionPct: poss.home, finalThirdEntries: null, penaltyAreaEntries: null },
      away: { possessionPct: poss.away, finalThirdEntries: null, penaltyAreaEntries: null },
    };
  }
  return { home: null, away: null };
}

async function loadXgForMatch(
  supabase: SupabaseClient,
  homeApiId: number,
  awayApiId: number
): Promise<{ homeXg: number | null; awayXg: number | null }> {
  const { data } = await supabase
    .from("national_match_process_metrics")
    .select("home_xg, away_xg, home_team_id, away_team_id")
    .or(`home_team_id.eq.${homeApiId},away_team_id.eq.${awayApiId}`)
    .order("match_date", { ascending: false })
    .limit(20);

  for (const row of data ?? []) {
    if (row.home_team_id === homeApiId && row.away_team_id === awayApiId) {
      return {
        homeXg: row.home_xg != null ? Number(row.home_xg) : null,
        awayXg: row.away_xg != null ? Number(row.away_xg) : null,
      };
    }
  }
  return { homeXg: null, awayXg: null };
}

export async function ingestOptaPlayerStatsFixture(
  supabase: SupabaseClient,
  files: WcPlayerStatsFixtureFiles,
  options?: { skipIfIngested?: boolean }
): Promise<PlayerStatsIngestResult> {
  for (const p of [files.matchSummary, files.optaSummary, files.matchDetails]) {
    if (p) assertPlayerStatsHtmlBundle(p);
  }

  const parsed = parseOptaPlayerStatsFixture(files);
  if (!parsed.homeTeamApiId || !parsed.awayTeamApiId) {
    throw new Error(
      `Could not resolve teams for ${files.homeName} vs ${files.awayName}`
    );
  }

  const resolved = await resolveWcMatchFromParsedTeams(supabase, {
    homeTeamApiId: parsed.homeTeamApiId,
    awayTeamApiId: parsed.awayTeamApiId,
    matchDate: parsed.matchDate,
  });

  if (!resolved) {
    throw new Error(
      `No WC match found for ${parsed.homeTeamName} vs ${parsed.awayTeamName}`
    );
  }

  const matchId = resolved.matchId;

  let skipIngestLog = false;
  if (options?.skipIfIngested) {
    const { data: existing } = await supabase
      .from("world_cup_player_stats_ingests")
      .select("id")
      .eq("match_id", matchId)
      .limit(1);
    if (existing?.length) skipIngestLog = true;
  }

  const [{ homeXg, awayXg }, territory] = await Promise.all([
    loadXgForMatch(supabase, parsed.homeTeamApiId, parsed.awayTeamApiId),
    loadTerritoryFromIngest(supabase, matchId),
  ]);

  const composites = buildCompositesForFixture({
    matchId,
    parsed,
    homeTerritory: territory.home,
    awayTerritory: territory.away,
    homeXg,
    awayXg,
    homeOpponentStrength: opponentStrength(parsed.awayTeamApiId),
    awayOpponentStrength: opponentStrength(parsed.homeTeamApiId),
  });

  const playerRows = parsed.players.map((p) => {
    const teamApiId =
      p.side === "home"
        ? parsed.homeTeamApiId!
        : p.side === "away"
          ? parsed.awayTeamApiId!
          : parsed.homeTeamApiId!;
    return {
      match_id: matchId,
      opta_player_id: p.optaPlayerId,
      player_name: p.playerName,
      team_api_id: teamApiId,
      side: p.side ?? "home",
      is_starter: p.isStarter,
      position: p.position,
      minutes: p.minutes != null ? Math.round(p.minutes) : null,
      opta_points: p.optaPoints,
      match_rank: p.matchRank != null ? Math.round(p.matchRank) : null,
      stats: p.stats,
      ingested_at: new Date().toISOString(),
    };
  });

  if (playerRows.length) {
    const { error: pErr } = await supabase
      .from("world_cup_player_match_stats")
      .upsert(playerRows, { onConflict: "match_id,opta_player_id" });
    if (pErr) throw new Error(pErr.message);
  }

  if (composites.length) {
    const { error: cErr } = await supabase.from("world_cup_team_match_aggregates").upsert(
      composites.map((c) => ({
        match_id: c.matchId,
        team_api_id: c.teamApiId,
        side: c.side,
        chance_index: c.chanceIndex,
        finishing_delta: c.finishingDelta,
        defensive_solidity: c.defensiveSolidity,
        territory_index: c.territoryIndex,
        gk_save_index: c.gkSaveIndex,
        discipline_load: c.disciplineLoad,
        opponent_strength: c.opponentStrength,
        payload: c.payload,
        computed_at: new Date().toISOString(),
      })),
      { onConflict: "match_id,team_api_id" }
    );
    if (cErr) throw new Error(cErr.message);
  }

  const playerXgSum = parsed.players.reduce(
    (s, p) => s + (Number(p.stats.expectedGoals ?? p.stats.xg) || 0),
    0
  );
  const xgDrift =
    homeXg != null && awayXg != null
      ? Math.abs(playerXgSum - (homeXg + awayXg))
      : null;
  if (xgDrift != null && xgDrift > 0.8) {
    parsed.warnings.push(`player xG sum drift ${xgDrift.toFixed(2)} vs article`);
  }

  if (!skipIngestLog) {
    await supabase.from("world_cup_player_stats_ingests").insert({
      match_id: matchId,
      source_paths: parsed.sourcePaths,
      parsed_summary: {
        homeTeamName: parsed.homeTeamName,
        awayTeamName: parsed.awayTeamName,
        playerCount: parsed.players.length,
        composites: composites.map((c) => ({
          teamApiId: c.teamApiId,
          chanceIndex: c.chanceIndex,
          defensiveSolidity: c.defensiveSolidity,
        })),
        xgDrift,
      },
      warnings: parsed.warnings,
    });
  }

  return {
    fixtureKey: files.fixtureKey,
    matchId,
    parsed,
    skipped: skipIngestLog,
    skipReason: skipIngestLog ? "already_ingested" : undefined,
  };
}

export async function recomputeWcTournamentForm(
  supabase: SupabaseClient
): Promise<{ players: number; teams: number }> {
  const { data: matches } = await supabase
    .from("matches")
    .select("id, date")
    .eq("status", "finished")
    .or("competition.ilike.FIFA World Cup 2026%,competition.eq.World Cup");

  const matchDates = new Map((matches ?? []).map((m) => [String(m.id), m.date as string]));

  const { data: playerStats, error } = await supabase
    .from("world_cup_player_match_stats")
    .select("*");

  if (error) throw new Error(error.message);

  const rows = (playerStats ?? []).map((row) => ({
    matchId: String(row.match_id),
    matchDate: matchDates.get(String(row.match_id)) ?? null,
    teamApiId: Number(row.team_api_id),
    player: {
      optaPlayerId: String(row.opta_player_id),
      playerName: String(row.player_name),
      side: row.side as "home" | "away",
      teamOptaId: null,
      isStarter: Boolean(row.is_starter),
      position: row.position as string | null,
      minutes: row.minutes != null ? Number(row.minutes) : null,
      optaPoints: row.opta_points != null ? Number(row.opta_points) : null,
      matchRank: row.match_rank != null ? Number(row.match_rank) : null,
      stats: (row.stats as Record<string, number | string | boolean | null>) ?? {},
    },
  }));

  const formRows = computePlayerTournamentForm(rows);

  if (formRows.length) {
    const { error: uErr } = await supabase.from("world_cup_player_tournament_form").upsert(
      formRows.map((f) => ({
        team_api_id: f.teamApiId,
        opta_player_id: f.optaPlayerId,
        player_name: f.playerName,
        matches_played: Math.max(0, Math.round(f.matchesPlayed)),
        minutes_total: Math.max(0, Math.round(f.minutesTotal)),
        avg_opta_points: f.avgOptaPoints,
        chance_index_per90: f.chanceIndexPer90,
        defensive_actions_per90: f.defensiveActionsPer90,
        gk_save_index: f.gkSaveIndex,
        yellow_cards: Math.max(0, Math.round(f.yellowCards)),
        was_last_starter: f.wasLastStarter,
        availability_factor: f.availabilityFactor,
        payload: f.payload,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "team_api_id,opta_player_id" }
    );
    if (uErr) throw new Error(uErr.message);
  }

  const teams = new Set(formRows.map((f) => f.teamApiId)).size;
  return { players: formRows.length, teams };
}

export async function ingestAllOptaPlayerStats(
  supabase: SupabaseClient
): Promise<PlayerStatsIngestResult[]> {
  const fixtures = listWcPlayerStatsFixtures();
  const results: PlayerStatsIngestResult[] = [];
  for (const fixture of fixtures) {
    results.push(
      await ingestOptaPlayerStatsFixture(supabase, fixture, { skipIfIngested: true })
    );
  }
  await recomputeWcTournamentForm(supabase);
  return results;
}

export function formatPlayerStatsIngestLine(result: PlayerStatsIngestResult): string {
  if (result.skipped) {
    return `${result.parsed.homeTeamName} vs ${result.parsed.awayTeamName} — skipped (${result.skipReason})`;
  }
  const p = result.parsed;
  return `${p.homeTeamName} vs ${p.awayTeamName} — ${p.players.length} players (${result.matchId})`;
}
