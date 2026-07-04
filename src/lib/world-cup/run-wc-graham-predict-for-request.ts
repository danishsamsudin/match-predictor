import { computeLineupPlayerXgImpact } from "@/lib/prediction/lineup-player-xg-impact";
import { computePlayerPropsForMatch } from "@/lib/prediction/compute-player-props-for-match";
import { shouldOrientWcCompareToRequest } from "@/lib/prediction/align-player-props-orientation";
import { resolveLineupPlayerStats } from "@/lib/prediction/resolve-lineup-player-stats";
import { applyLineupImpactToHubPrediction } from "@/lib/world-cup/apply-wc-lineup-impact";
import {
  buildAnalyticsFromHubPrediction,
  grahamHubRowToPredictionResult,
} from "@/lib/world-cup/graham-prediction-adapter";
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
import { resolveWcLineupApiIds } from "@/lib/world-cup/resolve-wc-lineup-orientation";
import {
  swapHubPredictionRow,
  swapWcAnalyticsContext,
} from "@/lib/world-cup/swap-hub-prediction-orientation";
import { loadEnrichedFormForTeam } from "@/lib/world-cup/load-enriched-international-form";
import { loadIngestSourceByMatchId, ingestSourceForMatch } from "@/lib/world-cup/load-ingest-source-by-match";
import { enrichHubPredictionWithMarketModels } from "@/lib/world-cup/market-models/enrich-hub-prediction";
import { loadWcCalibrationConfig } from "@/lib/world-cup/wc-calibration-config";
import { computeWcEstimatedMatchStats } from "@/lib/world-cup/wc-estimated-match-stats";
import { computeWcLineupPlayerXgImpact } from "@/lib/world-cup/wc-lineup-player-xg-impact";
import { saveWcModelSquadPrediction } from "@/lib/world-cup/save-wc-model-squad-prediction";
import { resolveWcModelStartingXi } from "@/lib/world-cup/resolve-wc-model-starting-xi";
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
    .select("*")
    .eq("status", "finished")
    .or("competition.ilike.FIFA World Cup 2026%,competition.eq.World Cup");

  const ingestByMatch = await loadIngestSourceByMatchId(
    supabase,
    (rows ?? []).map((row) => String(row.id))
  );

  return (rows ?? []).map((row) => {
    const ingest = ingestSourceForMatch(ingestByMatch, String(row.id));
    return {
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
      ...ingest,
    };
  });
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
  const { lineupHomeApiId, lineupAwayApiId } = resolveWcLineupApiIds(resolved, request);

  if (lineupSource === "manual_xi" && request.customLineups?.length) {
    const wcHomeNames = request.customLineups
      .filter((l) => l.team.id === lineupHomeApiId)
      .flatMap((l) => l.startXI.map((p) => p.player.name));
    const wcAwayNames = request.customLineups
      .filter((l) => l.team.id === lineupAwayApiId)
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
      finishedMatches,
      upcomingMatchDate: match.date,
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
      ...hubRow,
      computed_at: new Date().toISOString(),
    });
  }

  const structuralHomeXg = Number(
    hubRow.snapshot.home_xg ?? hubRow.snapshot.lambda ?? 1.2
  );
  const structuralAwayXg = Number(
    hubRow.snapshot.away_xg ?? hubRow.snapshot.mu ?? 1.2
  );

  const [homeFormMatches, awayFormMatches] = await Promise.all([
    loadEnrichedFormForTeam(supabase, match.home_team_id!, homeName, finishedMatches),
    loadEnrichedFormForTeam(supabase, match.away_team_id!, awayName, finishedMatches),
  ]);

  const analyticsContext = await buildWcPredictionAnalyticsContext({
    snapshot: hubRow.snapshot,
    homeXg: structuralHomeXg,
    awayXg: structuralAwayXg,
    homeTeamApiId,
    awayTeamApiId,
    homeDbTeamId: match.home_team_id!,
    awayDbTeamId: match.away_team_id!,
    homeName,
    awayName,
    homeFormMatches,
    awayFormMatches,
    supabase,
  });

  const isKnockout = /round of|quarter-?final|semi-?final|third place|final\b|knockout/i.test(
    `${match.round ?? ""} ${match.competition ?? ""}`
  );

  let enriched = enrichHubPredictionWithMarketModels({
    hubRow,
    calibration,
    homeName,
    awayName,
    analyticsContext,
    isKnockout,
  });

  const estimated = computeWcEstimatedMatchStats({
    homeTeamApiId,
    awayTeamApiId,
    homeName,
    awayName,
    homeDbTeamId: match.home_team_id!,
    awayDbTeamId: match.away_team_id!,
    homeXg: enriched.displayHomeXg,
    awayXg: enriched.displayAwayXg,
    finishedMatches,
    calibration,
    isKnockout,
    refereeStrictness: Number(hubRow.snapshot.referee_strictness ?? 1),
  });

  enriched = enrichHubPredictionWithMarketModels({
    hubRow: enriched.hubRow,
    calibration,
    homeName,
    awayName,
    analyticsContext,
    estimated,
    isKnockout,
  });
  hubRow = enriched.hubRow;

  if (shouldRefreshHubPrediction(phase)) {
    await wcDb(supabase).from("world_cup_predictions").upsert({
      match_id: resolved.matchId,
      ...hubRow,
      computed_at: new Date().toISOString(),
    });
  }

  const orientToRequest = shouldOrientWcCompareToRequest(request, resolved);
  const displayHomeName = orientToRequest
    ? (request.homeTeamName ?? awayName)
    : homeName;
  const displayAwayName = orientToRequest
    ? (request.awayTeamName ?? homeName)
    : awayName;
  const displayHomeXg = orientToRequest ? enriched.displayAwayXg : enriched.displayHomeXg;
  const displayAwayXg = orientToRequest ? enriched.displayHomeXg : enriched.displayAwayXg;
  const displayHubRow = orientToRequest ? swapHubPredictionRow(hubRow) : hubRow;
  const displayAnalyticsContext = orientToRequest
    ? swapWcAnalyticsContext(analyticsContext)
    : analyticsContext;
  const propsHomeTeamId = orientToRequest ? request.homeTeamId : homeTeamApiId;
  const propsAwayTeamId = orientToRequest ? request.awayTeamId : awayTeamApiId;

  // Rebuild grid markets from display-oriented hub row so heatmap, margins, and
  // stat comparison stay aligned when compare-mode home/away differs from the DB fixture.
  const displayAnalytics = buildAnalyticsFromHubPrediction(
    displayHubRow,
    displayHomeName,
    displayAwayName,
    displayAnalyticsContext,
    calibration
  );

  const result = grahamHubRowToPredictionResult({
    pred: displayHubRow,
    homeName: displayHomeName,
    awayName: displayAwayName,
    estimated,
    lineupSource,
    lineupNotes,
    analyticsContext: displayAnalyticsContext,
    calibration,
    analytics: displayAnalytics,
  });

  const playerProps = await computePlayerPropsForMatch({
    homeTeamId: propsHomeTeamId,
    awayTeamId: propsAwayTeamId,
    homeTeamName: displayHomeName,
    awayTeamName: displayAwayName,
    homeLeagueId: request.homeLeagueId,
    awayLeagueId: request.awayLeagueId,
    entityType: "national",
    homeXg: displayHomeXg,
    awayXg: displayAwayXg,
    homeTeamExpectedSot: displayHomeXg * 4.2,
    awayTeamExpectedSot: displayAwayXg * 4.2,
    teamComparison: displayAnalyticsContext.teamComparison,
    customLineups: request.customLineups,
    homeFormMatches: orientToRequest ? awayFormMatches : homeFormMatches,
    awayFormMatches: orientToRequest ? homeFormMatches : awayFormMatches,
    homeDbTeamId: orientToRequest ? match.away_team_id! : match.home_team_id!,
    awayDbTeamId: orientToRequest ? match.home_team_id! : match.away_team_id!,
    modelVersion: result.modelVersion,
  }).catch(() => null);

  if (playerProps) {
    result.playerProps = playerProps;
    if (result.analytics) {
      result.analytics.playerProps = playerProps;
    }
  }

  if (lineupSource === "model_xi") {
    const [homeXi, awayXi] = await Promise.all([
      resolveWcModelStartingXi({
        supabase,
        teamApiId: homeTeamApiId,
        teamName: homeName,
      }),
      resolveWcModelStartingXi({
        supabase,
        teamApiId: awayTeamApiId,
        teamName: awayName,
      }),
    ]);
    await saveWcModelSquadPrediction({
      supabase,
      matchId: resolved.matchId,
      homeTeamApiId,
      awayTeamApiId,
      hubRow,
      result,
      playerProps,
      homeXi,
      awayXi,
    }).catch((err) => {
      console.warn("Failed to save model squad prediction:", err);
    });
  }

  return result;
}
