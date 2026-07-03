/**
 * Evaluate all per-market ML models against finished WC matches.
 *
 * Usage: npx tsx scripts/wc-evaluate-market-models.ts
 */
import { alignFinishedMatchForDisplay } from "../src/lib/world-cup/align-finished-match-for-display";
import type { HubPredictionRow } from "../src/lib/world-cup/hub-main-predict";
import { ingestSourceForMatch, loadIngestSourceByMatchId } from "../src/lib/world-cup/load-ingest-source-by-match";
import { orientHubPredictionToMatch } from "../src/lib/world-cup/orient-hub-prediction-to-match";
import {
  aggregateMarketEvaluations,
  evaluateMarketsForMatch,
} from "../src/lib/world-cup/market-models/evaluate";
import { MARKET_MODEL_LABELS } from "../src/lib/world-cup/market-models/registry";
import { loadWcCalibrationConfig } from "../src/lib/world-cup/wc-calibration-config";
import { tryCreateServiceClient } from "../src/lib/supabase";

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

async function main() {
  loadEnvLocal();
  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const calibration = await loadWcCalibrationConfig();

  const { data: matches, error: matchErr } = await supabase
    .from("matches")
    .select(
      "id, home_goals, away_goals, home_team_id, away_team_id, date, round, competition, status"
    )
    .eq("status", "finished")
    .or("competition.ilike.FIFA World Cup 2026%,competition.eq.World Cup");

  if (matchErr) throw new Error(matchErr.message);

  const ingestByMatch = await loadIngestSourceByMatchId(
    supabase,
    (matches ?? []).map((m) => String(m.id))
  );

  const teamIds = [
    ...new Set(
      (matches ?? []).flatMap((m) => [m.home_team_id, m.away_team_id].filter(Boolean) as string[])
    ),
  ];
  const { data: teams } = await supabase.from("teams").select("id, name").in("id", teamIds);
  const teamNames = new Map((teams ?? []).map((t) => [String(t.id), String(t.name)]));

  const { data: preds, error: predErr } = await supabase
    .from("world_cup_predictions")
    .select("*");
  if (predErr) throw new Error(predErr.message);

  const predByMatch = new Map((preds ?? []).map((p) => [p.match_id as string, p]));
  const allRows: ReturnType<typeof evaluateMarketsForMatch> = [];
  let upserted = 0;

  for (const m of matches ?? []) {
    if (m.home_goals == null || m.away_goals == null) continue;
    const predRow = predByMatch.get(String(m.id));
    if (!predRow) continue;

    const ingest = ingestSourceForMatch(ingestByMatch, String(m.id));
    const display = alignFinishedMatchForDisplay(
      {
        id: String(m.id),
        date: m.date,
        home_team_id: m.home_team_id,
        away_team_id: m.away_team_id,
        home_goals: m.home_goals,
        away_goals: m.away_goals,
        ...ingest,
      },
      teamNames
    );
    if (!display) continue;

    const hubPred: HubPredictionRow = orientHubPredictionToMatch(
      {
        home_win_pct: Number(predRow.home_win_pct),
        draw_pct: Number(predRow.draw_pct),
        away_win_pct: Number(predRow.away_win_pct),
        predicted_score_home: Number(predRow.predicted_score_home),
        predicted_score_away: Number(predRow.predicted_score_away),
        under_2_5_pct: Number(predRow.under_2_5_pct),
        over_2_5_pct: Number(predRow.over_2_5_pct),
        model_version: String(predRow.model_version),
        snapshot: (predRow.snapshot as Record<string, unknown>) ?? {},
      },
      display.homeTeamId,
      display.awayTeamId
    );

    const snapshot = hubPred.snapshot;
    const isKnockout = String(m.round ?? "").toLowerCase().includes("knockout") ||
      String(m.round ?? "").match(/round of|quarter|semi|final/i) != null;

    const { data: ingestRow } = await supabase
      .from("world_cup_post_match_ingests")
      .select("parsed")
      .eq("match_id", String(m.id))
      .order("ingested_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const parsed = (ingestRow?.parsed ?? {}) as Record<string, unknown>;
    if (parsed.home_xg != null) snapshot.actual_home_xg = Number(parsed.home_xg);
    if (parsed.away_xg != null) snapshot.actual_away_xg = Number(parsed.away_xg);

    const estSnap = snapshot.estimated_stats as
      | { corners: number; fouls: number; yellowCards: number; redCards: number }
      | undefined;

    const rows = evaluateMarketsForMatch({
      pred: { ...hubPred, snapshot },
      actualHome: display.homeGoals,
      actualAway: display.awayGoals,
      calibration,
      modelVersion: calibration.modelVersion,
      isKnockout,
      actualEvents: {
        corners: parsed.corners != null ? Number(parsed.corners) : null,
        fouls: parsed.fouls != null ? Number(parsed.fouls) : null,
        yellow: parsed.yellow_cards != null ? Number(parsed.yellow_cards) : null,
        red: parsed.red_cards != null ? Number(parsed.red_cards) : null,
      },
      estimatedEvents: estSnap ?? null,
    }).map((r) => ({ ...r, matchId: String(m.id) }));

    allRows.push(...rows);

    for (const row of rows) {
      const { error: upsertErr } = await supabase.from("ml_market_evaluations").upsert(
        {
          match_id: row.matchId,
          market_id: row.marketId,
          predicted: row.predicted,
          actual: row.actual,
          loss_metric: row.lossMetric,
          loss_value: row.lossValue,
          model_version: row.modelVersion,
        },
        { onConflict: "match_id,market_id" }
      );
      if (!upsertErr) upserted += 1;
    }
  }

  console.log(`Market model evaluations upserted: ${upserted} rows across ${matches?.length ?? 0} matches.\n`);

  const marketIds = [...new Set(allRows.map((r) => r.marketId))];
  for (const marketId of marketIds) {
    const agg = aggregateMarketEvaluations(allRows, marketId);
    const label = MARKET_MODEL_LABELS[marketId] ?? marketId;
    if (agg.count === 0) continue;
    const extra =
      marketId === "correct_score" && agg.hits != null
        ? `, top-2 hits ${agg.hits}/${agg.count} (${((agg.hits / agg.count) * 100).toFixed(0)}%)`
        : "";
    console.log(`  ${label}: n=${agg.count}, avg loss=${agg.avgLoss.toFixed(4)}${extra}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
