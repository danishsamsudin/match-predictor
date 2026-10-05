/**
 * Inspect NL confidence layer + evaluation stock.
 * Usage: npx tsx scripts/nl-inspect-confidence.ts
 */
import {
  buildConfidenceCurves,
  lookupConfidence,
  valueRowIdToMarketKey,
} from "../src/lib/nations-league/confidence-layer";
import {
  extractMarketConfidenceRows,
  extractPlayerPropConfidenceRows,
} from "../src/lib/nations-league/extract-confidence-eval-rows";
import { fetchAllRows } from "../src/lib/nations-league/fetch-all-rows";
import { loadNlCalibrationConfig } from "../src/lib/nations-league/nl-calibration-config";
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
  const cal = await loadNlCalibrationConfig();
  const layer = cal.confidenceLayer;
  console.log("calibration version:", cal.modelVersion);
  console.log(
    "confidenceLayer:",
    layer?.version,
    "trainN=",
    layer?.trainN,
    "holdoutN=",
    layer?.holdoutN,
    "markets=",
    Object.keys(layer?.markets ?? {}).length
  );

  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const { count: mec } = await supabase
    .from("nations_league_market_evaluations")
    .select("*", { count: "exact", head: true });
  const { count: pc } = await supabase
    .from("nations_league_player_prop_evaluations")
    .select("*", { count: "exact", head: true });
  console.log("market_evaluations:", mec, "player_prop_evaluations:", pc);

  const marketRows = await fetchAllRows<{
    market_id: string;
    market_key: string;
    predicted: Record<string, unknown> | null;
    actual: Record<string, unknown> | null;
    match_date: string | null;
  }>({
    supabase,
    table: "nations_league_market_evaluations",
    select: "market_id, market_key, predicted, actual, match_date",
  });
  const propRows = await fetchAllRows<{
    market: string;
    predicted_prob: number | null;
    hit: boolean | null;
    match_date: string | null;
    prop_source: string | null;
  }>({
    supabase,
    table: "nations_league_player_prop_evaluations",
    select: "market, predicted_prob, hit, match_date, prop_source",
  });

  const lockedProps = propRows.filter((r) => r.prop_source !== "bootstrap");
  const rows = [
    ...extractMarketConfidenceRows(marketRows),
    ...extractPlayerPropConfidenceRows(lockedProps),
  ];
  console.log("extractable confidence rows:", rows.length);

  const curves = buildConfidenceCurves(rows);
  const keys = [
    "win_probability:home",
    "btts:yes",
    "goals_over_under:over_2.5",
    "double_chance:1x",
  ];
  for (const key of keys) {
    const m = curves[key];
    if (!m) {
      console.log(key, "MISSING from extract");
      continue;
    }
    const bins = m.bins
      .filter((b) => b.n > 0)
      .map(
        (b) =>
          `${b.label}:${b.tier}(n=${b.n},hr=${(b.hitRate * 100).toFixed(0)}%,w=${(b.wilsonLow * 100).toFixed(0)}%)`
      )
      .join(" | ");
    console.log(key, `n=${m.n}`, `strong=${m.strongFloor}`, bins);
  }

  const uiProbs: Array<[string, number]> = [
    ["1x2-home", 0.552],
    ["btts-yes", 0.666],
    ["ou-over-2.5", 0.672],
    ["dc-1x", 0.808],
  ];
  console.log("\nUI lookup against LIVE curves (not stored layer):");
  for (const [id, p] of uiProbs) {
    const key = valueRowIdToMarketKey(id)!;
    const live = lookupConfidence(key, p, {
      version: "live",
      computedAt: "",
      trainN: rows.length,
      holdoutN: 0,
      markets: curves,
    });
    const stored = lookupConfidence(key, p, layer);
    console.log(
      id,
      "→",
      key,
      "| live:",
      live.tier,
      `n=${live.n}`,
      `hr=${(live.historicalHitRate * 100).toFixed(1)}%`,
      "| stored:",
      stored.tier,
      `n=${stored.n}`
    );
  }

  const ids = [...new Set(marketRows.map((r) => r.market_id))];
  console.log("\nmarket_id set:", ids.sort().join(", "));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
