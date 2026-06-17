/**
 * Backfill ml_training_examples from WC prediction snapshots and international history.
 *
 * Usage: npx tsx scripts/ml-backfill-training-examples.ts
 */
import { getFifaRankingPoints, resolveNationalTeamForStrength } from "../src/lib/prediction/fifa-team-strength";
import { ensureFifaRankingsLoaded } from "../src/lib/data/fifa-rankings-store";
import { computeGrahamProcessRatesFromMatches } from "../src/lib/world-cup/graham-process-rates";
import { computeGrahamMomentumIndex } from "../src/lib/world-cup/graham-momentum";
import { computeXgEloFromMatches, getXgEloRating } from "../src/lib/world-cup/graham-xg-elo";
import { computeWctrFromMatches, getWctrRating } from "../src/lib/world-cup/graham-tournament-rating";
import type { InternationalFormMatch } from "../src/lib/world-cup/load-international-form";
import { GRAHAM_MU_XG } from "../src/lib/world-cup/graham-model-config";
import { tryCreateServiceClient } from "../src/lib/supabase";
import type { SportApiEvent } from "../src/lib/types/sportapi";

function loadEnvLocal() {
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const [key, ...rest] = t.split("=");
    const val = rest.join("=").trim().replace(/^["']|["']$/g, "");
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

type MetricsRow = {
  event_id: number;
  match_date: string | null;
  home_team_id: number | null;
  away_team_id: number | null;
  home_xg: number | null;
  away_xg: number | null;
  payload: Record<string, unknown> | null;
};

function metricsToFormMatch(row: MetricsRow, scores?: { home: number; away: number }): InternationalFormMatch | null {
  if (!row.home_team_id || !row.away_team_id || !row.match_date) return null;
  const homeGoals = scores?.home ?? Math.round(Number(row.home_xg ?? 0));
  const awayGoals = scores?.away ?? Math.round(Number(row.away_xg ?? 0));
  const competition = String(row.payload?.competition ?? "International");
  return {
    date: row.match_date,
    home_team_id: String(row.home_team_id),
    away_team_id: String(row.away_team_id),
    home_goals: homeGoals,
    away_goals: awayGoals,
    competition,
    home_xg: row.home_xg,
    away_xg: row.away_xg,
    event_id: row.event_id,
  };
}

function fifaRating(teamId: number, teamName?: string): number {
  const resolved = resolveNationalTeamForStrength(teamId, teamName);
  return getFifaRankingPoints(resolved.teamId, resolved.teamName ?? teamName) ?? 1400;
}

function buildFeaturesFromHistory(input: {
  homeTeamId: number;
  awayTeamId: number;
  priorMatches: InternationalFormMatch[];
  homeTalentLog?: number;
  awayTalentLog?: number;
}): Record<string, unknown> {
  const teamIds = [input.homeTeamId, input.awayTeamId];
  const teamNames = new Map<number, string>([
    [input.homeTeamId, String(input.homeTeamId)],
    [input.awayTeamId, String(input.awayTeamId)],
  ]);

  const homeForm = input.priorMatches.filter(
    (m) => m.home_team_id === String(input.homeTeamId) || m.away_team_id === String(input.homeTeamId)
  );
  const awayForm = input.priorMatches.filter(
    (m) => m.home_team_id === String(input.awayTeamId) || m.away_team_id === String(input.awayTeamId)
  );

  const homeRates = computeGrahamProcessRatesFromMatches(
    String(input.homeTeamId),
    homeForm,
    Date.now()
  );
  const awayRates = computeGrahamProcessRatesFromMatches(
    String(input.awayTeamId),
    awayForm,
    Date.now()
  );

  const mu = GRAHAM_MU_XG;
  const recentFormHome = mu * homeRates.attack * awayRates.defense;
  const recentFormAway = mu * awayRates.attack * homeRates.defense;
  const deltaRecentForm = recentFormHome - recentFormAway;

  const xgEloMap = computeXgEloFromMatches(input.priorMatches, teamIds, teamNames);
  const wctrMap = computeWctrFromMatches(input.priorMatches, teamIds, teamNames);

  const deltaXgElo =
    getXgEloRating(xgEloMap, input.homeTeamId) - getXgEloRating(xgEloMap, input.awayTeamId);
  const deltaTournament =
    getWctrRating(wctrMap, input.homeTeamId) - getWctrRating(wctrMap, input.awayTeamId);
  const deltaFifa = fifaRating(input.homeTeamId) - fifaRating(input.awayTeamId);
  const momentum = computeGrahamMomentumIndex({
    homeFormMatches: homeForm,
    awayFormMatches: awayForm,
    homeTeamId: String(input.homeTeamId),
    awayTeamId: String(input.awayTeamId),
  });

  const deltaTalent =
    (input.homeTalentLog ?? 0) - (input.awayTalentLog ?? 0);

  return {
    delta_xg_elo: deltaXgElo,
    delta_talent: deltaTalent,
    delta_tournament: deltaTournament,
    delta_recent_form: deltaRecentForm,
    delta_fifa: deltaFifa,
    momentum_index: momentum,
    home_attack: homeRates.attack,
    home_defense: homeRates.defense,
    away_attack: awayRates.attack,
    away_defense: awayRates.defense,
    lineup_impact_home: null,
    lineup_impact_away: null,
    lineup_data_available: false,
  };
}

function eventScores(event: SportApiEvent): { home: number; away: number } | null {
  const home = event.homeScore?.current ?? event.homeScore?.display ?? null;
  const away = event.awayScore?.current ?? event.awayScore?.display ?? null;
  if (home == null || away == null) return null;
  return { home, away };
}

async function main() {
  loadEnvLocal();
  await ensureFifaRankingsLoaded();
  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  let upserted = 0;

  const { data: wcPreds } = await supabase
    .from("world_cup_predictions")
    .select("match_id, snapshot");

  const { data: wcMatches } = await supabase
    .from("matches")
    .select(
      "id, date, competition, home_goals, away_goals, home_team_id, away_team_id, knockout"
    )
    .eq("status", "finished")
    .or("competition.ilike.FIFA World Cup 2026%,competition.eq.World Cup");

  const wcMatchById = new Map((wcMatches ?? []).map((m) => [String(m.id), m]));

  for (const pred of wcPreds ?? []) {
    const match = wcMatchById.get(String(pred.match_id));
    if (!match || match.home_goals == null || match.away_goals == null) continue;
    const snapshot = (pred.snapshot as Record<string, unknown>) ?? {};
    const { data: agg } = await supabase
      .from("world_cup_team_match_aggregates")
      .select("discipline_load, chance_index, defensive_solidity")
      .eq("match_id", String(pred.match_id));

    let yellow = 0;
    let fouls = 0;
    let corners = 0;
    for (const row of agg ?? []) {
      const payload = row as { discipline_load?: number; chance_index?: number };
      yellow += Number(payload.discipline_load ?? 0);
    }

    const { data: ingests } = await supabase
      .from("world_cup_post_match_ingests")
      .select("parsed")
      .eq("match_id", String(pred.match_id))
      .limit(1);

    const parsed = (ingests?.[0]?.parsed as Record<string, unknown>) ?? {};
    fouls = Number(parsed.total_fouls ?? parsed.fouls ?? 0) || null;
    corners = Number(parsed.total_corners ?? parsed.corners ?? 0) || null;
    yellow = Number(parsed.total_yellow ?? parsed.yellow_cards ?? yellow) || yellow;

    const optaFeatures = (snapshot.opta_features as Record<string, unknown>) ?? {
      chance_index_diff: 0,
      defensive_solidity_diff: 0,
    };

    const { error } = await supabase.from("ml_training_examples").upsert(
      {
        match_id: String(pred.match_id),
        match_date: String(match.date).slice(0, 10),
        competition: match.competition,
        is_knockout: Boolean(match.knockout),
        features: snapshot,
        opta_features: optaFeatures,
        actual_home_goals: match.home_goals,
        actual_away_goals: match.away_goals,
        actual_yellow: yellow || null,
        actual_fouls: fouls || null,
        actual_corners: corners || null,
        source: "wc_prediction_snapshot",
        feature_as_of: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "match_id" }
    );
    if (error) throw new Error(error.message);
    upserted += 1;
  }

  const { data: metricsRows, error: metricsErr } = await supabase
    .from("national_match_process_metrics")
    .select("event_id, match_date, home_team_id, away_team_id, home_xg, away_xg, payload")
    .order("match_date", { ascending: true });

  if (metricsErr) throw new Error(metricsErr.message);

  const eventScoreCache = new Map<number, { home: number; away: number }>();
  const positiveEventIds = (metricsRows ?? [])
    .map((r) => r.event_id)
    .filter((id) => id > 0);

  for (let i = 0; i < positiveEventIds.length; i += 100) {
    const batch = positiveEventIds.slice(i, i + 100);
    const { data: events } = await supabase
      .from("synced_events")
      .select("event_id, payload")
      .in("event_id", batch);
    for (const row of events ?? []) {
      const scores = eventScores(row.payload as SportApiEvent);
      if (scores) eventScoreCache.set(row.event_id, scores);
    }
  }

  const history: InternationalFormMatch[] = [];
  for (const row of metricsRows ?? []) {
    const metricsRow = row as MetricsRow;
    const scores = eventScoreCache.get(metricsRow.event_id);
    const formMatch = metricsToFormMatch(metricsRow, scores);
    if (!formMatch || !metricsRow.home_team_id || !metricsRow.away_team_id) continue;

    const features = buildFeaturesFromHistory({
      homeTeamId: metricsRow.home_team_id,
      awayTeamId: metricsRow.away_team_id,
      priorMatches: history,
    });

    const matchId = `intl-${metricsRow.event_id}`;
    const competition = String(metricsRow.payload?.competition ?? "International");
    const isKnockout = /knockout|round of|quarter|semi|final/i.test(competition);

    const { error } = await supabase.from("ml_training_examples").upsert(
      {
        match_id: matchId,
        match_date: String(metricsRow.match_date).slice(0, 10),
        competition,
        is_knockout: isKnockout,
        features,
        opta_features: null,
        actual_home_goals: formMatch.home_goals,
        actual_away_goals: formMatch.away_goals,
        actual_yellow: null,
        actual_fouls: null,
        actual_corners: null,
        source: "backfill",
        feature_as_of: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "match_id" }
    );
    if (error) throw new Error(error.message);
    upserted += 1;
    history.push(formMatch);
  }

  console.log(`Upserted ${upserted} ml_training_examples rows.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
