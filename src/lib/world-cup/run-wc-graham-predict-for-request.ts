import { computeLineupPlayerXgImpact } from "@/lib/prediction/lineup-player-xg-impact";
import { computePlayerPropsForMatch } from "@/lib/prediction/compute-player-props-for-match";
import { resolveLineupPlayerStats } from "@/lib/prediction/resolve-lineup-player-stats";
import { applyLineupImpactToHubPrediction } from "@/lib/world-cup/apply-wc-lineup-impact";
import { grahamHubRowToPredictionResult } from "@/lib/world-cup/graham-prediction-adapter";
import { runHubMainPredict } from "@/lib/world-cup/hub-main-predict";
import { INTERNATIONAL_BASE_GOALS } from "@/lib/world-cup/international-strength";
import { resolveMatchPhase, shouldRefreshHubPrediction } from "@/lib/world-cup/match-kickoff";
import type { ResolvedWcMatch } from "@/lib/world-cup/resolve-wc-match";
import { resolveApiTeamId } from "@/lib/world-cup/resolve-api-team-id";
import {
  resolveWcLineupPlayerStats,
} from "@/lib/world-cup/resolve-wc-lineup-player-stats";
import { applyWcModelXiToHubPrediction } from "@/lib/world-cup/wc-hub-model-xi";
import { buildWcPredictionAnalyticsContext } from "@/lib/world-cup/build-wc-prediction-analytics-context";
import { loadEnrichedFormForTeam } from "@/lib/world-cup/load-enriched-international-form";
import { loadWcCalibrationConfig } from "@/lib/world-cup/wc-calibration-config";
import { computeWcLineupPlayerXgImpact } from "@/lib/world-cup/wc-lineup-player-xg-impact";
import { computeWcEstimatedMatchStats } from "@/lib/world-cup/wc-estimated-match-stats";
import type { WcMatchRow } from "@/lib/world-cup/standings";
import type { PredictRequest, PredictionLineupSource, PredictionResult } from "@/lib/types/prediction";
import type { SupabaseClient } from "@supabase/supabase-js";

function wcDb(client: SupabaseClient) {
  return client as unknown as {
    from: (table: string) => {
      upsert: (row: unknown) => Promise<{ error: { message: string } | null }>;
    };
  };
}

async function loadFinishedWcMatches(
  supabase: SupabaseClient
): Promise<WcMatchRow[]> {
  const { data: teams } = await supabase.from("teams").select("id, name");
  const teamNames = new Map((teams ?? []).map((t) => [String(t.id), t.name as string]));

  const { data: rows } = await supabase
    .from("matches")
    .select(
      "*, ingest_source_home, ingest_source_away, ingest_source_home_goals, ingest_source_away_goals"
    )
    .eq("status", "finished")
    .or("competition.ilike.FIFA World Cup 2026%,competition.eq.World Cup");

  return (rows ?? []).map((row) => ({
    id: String(row.id),
    date: row.date,
    time: row.time,
    group_code: row.group_code,
    status: row.status,
    home_team_id: row.home_team_id,
    away_team_id: row.away_team_id,
    home_goals: row.home_goals,
    away_goals: row.away_goals,
    home_team_name: row.home_team_id
      ? teamNames.get(String(row.home_team_id))
      : undefined,
    away_team_name: row.away_team_id
      ? teamNames.get(String(row.away_team_id))
      : undefined,
    venue_city: row.venue_city ?? row.venue,
    venue: row.venue,
    competition: row.competition,
    round: row.round,
    ingest_source_home: row.ingest_source_home,
    ingest_source_away: row.ingest_source_away,
    ingest_source_home_goals: row.ingest_source_home_goals,
    ingest_source_away_goals: row.ingest_source_away_goals,
  }));
}

export async function runWcGrahamPredictForRequest(input: {
  request: PredictRequest;
  resolved: ResolvedWcMatch;
  supabase: SupabaseClient;
}): Promise<PredictionResult | null> {
  const { request, resolved, supabase } = input;
  const match = resolved.match;
  const homeName = match.home_team_name ?? request.homeTeamName ?? "Home";
  const awayName = match.away_team_name ?? request.awayTeamName ?? "Away";

  const finishedMatches = await loadFinishedWcMatches(supabase);
  const calibration = await loadWcCalibrationConfig();
  const baseHubRow = await runHubMainPredict(match, {
    finishedMatches,
    applyModelXi: false,
  });
  if (!baseHubRow) return null;

  let hubRow = baseHubRow;

  const lineupSource: PredictionLineupSource = request.lineupSource ?? "manual_xi";
  let lineupNotes: string[] = [];

  const homeTeamApiId = resolveApiTeamId(match.home_team_id!, homeName);
  const awayTeamApiId = resolveApiTeamId(match.away_team_id!, awayName);

  if (lineupSource === "manual_xi" && request.customLineups?.length) {
    const wcHomeNames = request.customLineups
      .filter((l) => l.team.id === request.homeTeamId)
      .flatMap((l) => l.startXI.map((p) => p.player.name));
    const wcAwayNames = request.customLineups
      .filter((l) => l.team.id === request.awayTeamId)
      .flatMap((l) => l.startXI.map((p) => p.player.name));

    const [wcHome, wcAway] = await Promise.all([
      resolveWcLineupPlayerStats({
        supabase,
        teamApiId: homeTeamApiId,
        playerNames: wcHomeNames,
      }),
      resolveWcLineupPlayerStats({
        supabase,
        teamApiId: awayTeamApiId,
        playerNames: wcAwayNames,
      }),
    ]);

    const baseHomeXg = Number(
      hubRow.snapshot.home_xg ?? hubRow.snapshot.lambda ?? 1.2
    );
    const baseAwayXg = Number(hubRow.snapshot.away_xg ?? hubRow.snapshot.mu ?? 1.2);

    const wcCoverage = Object.keys(wcHome).length + Object.keys(wcAway).length;
    if (wcCoverage >= 8) {
      const lineup = computeWcLineupPlayerXgImpact({
        homePlayers: wcHome,
        awayPlayers: wcAway,
        baseHomeXg,
        baseAwayXg,
        mu: INTERNATIONAL_BASE_GOALS,
        calibration,
        mode: "manual_xi",
      });
      lineupNotes = lineup.notes;
      hubRow = applyLineupImpactToHubPrediction(hubRow, lineup);
    } else {
      const playerStats = await resolveLineupPlayerStats({
        lineups: request.customLineups,
        homeTeamId: request.homeTeamId,
        awayTeamId: request.awayTeamId,
        homeTeamName: request.homeTeamName ?? homeName,
        awayTeamName: request.awayTeamName ?? awayName,
        homeLeagueId: request.homeLeagueId,
        awayLeagueId: request.awayLeagueId,
        entityType: "national",
        supabase,
      });

      const lineup = computeLineupPlayerXgImpact({
        homePlayers: playerStats.home,
        awayPlayers: playerStats.away,
        baseHomeXg,
        baseAwayXg,
        mu: INTERNATIONAL_BASE_GOALS,
      });
      lineupNotes = [...lineup.notes, "WC tournament form sparse — Scoutlyst/FBref fallback."];
      hubRow = applyLineupImpactToHubPrediction(hubRow, lineup);
    }
  } else if (lineupSource === "model_xi") {
    hubRow = await applyWcModelXiToHubPrediction({
      supabase,
      hubRow,
      homeTeamApiId,
      awayTeamApiId,
      homeTeamName: homeName,
      awayTeamName: awayName,
      calibration,
    });
    lineupNotes = ["Model XI — SoFIFA starting eleven from uploaded squad HTML."];
  }

  const phase = resolveMatchPhase({
    date: match.date,
    time: match.time,
    status: match.status,
    homeGoals: match.home_goals,
    awayGoals: match.away_goals,
  });

  if (shouldRefreshHubPrediction(phase)) {
    await wcDb(supabase).from("world_cup_predictions").upsert({
      match_id: resolved.matchId,
      ...baseHubRow,
      computed_at: new Date().toISOString(),
    });
  }

  const homeXg = Number(hubRow.snapshot.home_xg ?? hubRow.snapshot.lambda ?? 1.2);
  const awayXg = Number(hubRow.snapshot.away_xg ?? hubRow.snapshot.mu ?? 1.2);

  const [homeFormMatches, awayFormMatches] = await Promise.all([
    loadEnrichedFormForTeam(supabase, match.home_team_id!, homeName, finishedMatches),
    loadEnrichedFormForTeam(supabase, match.away_team_id!, awayName, finishedMatches),
  ]);

  const estimated = computeWcEstimatedMatchStats({
    homeTeamApiId,
    awayTeamApiId,
    homeName,
    awayName,
    homeDbTeamId: match.home_team_id!,
    awayDbTeamId: match.away_team_id!,
    homeXg,
    awayXg,
    finishedMatches,
    calibration,
    isKnockout: /round of|quarter-?final|semi-?final|third place|final\b|knockout/i.test(
      `${match.round ?? ""} ${match.competition ?? ""}`
    ),
  });

  const analyticsContext = buildWcPredictionAnalyticsContext({
    snapshot: hubRow.snapshot,
    homeXg,
    awayXg,
    homeTeamApiId,
    awayTeamApiId,
    homeDbTeamId: match.home_team_id!,
    awayDbTeamId: match.away_team_id!,
    homeName,
    awayName,
    homeFormMatches,
    awayFormMatches,
  });

  const result = grahamHubRowToPredictionResult({
    pred: hubRow,
    homeName,
    awayName,
    estimated,
    lineupSource,
    lineupNotes,
    analyticsContext,
  });

  const playerProps = await computePlayerPropsForMatch({
    homeTeamId: request.homeTeamId,
    awayTeamId: request.awayTeamId,
    homeTeamName: homeName,
    awayTeamName: awayName,
    homeLeagueId: request.homeLeagueId,
    awayLeagueId: request.awayLeagueId,
    entityType: "national",
    homeXg,
    awayXg,
    teamComparison: analyticsContext.teamComparison,
    customLineups: request.customLineups,
    homeFormMatches,
    awayFormMatches,
    homeDbTeamId: match.home_team_id!,
    awayDbTeamId: match.away_team_id!,
    modelVersion: result.modelVersion,
  }).catch(() => null);

  if (playerProps) {
    result.playerProps = playerProps;
    if (result.analytics) {
      result.analytics.playerProps = playerProps;
    }
  }

  return result;
}
