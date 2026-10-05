/**
 * Rebuild Nations League confidence floors from locked evaluation history.
 *
 * Usage: npx tsx scripts/nl-calibrate-confidence.ts
 */
import { calibrateConfidenceLayer } from "../src/lib/nations-league/confidence-layer";
import {
  extractMarketConfidenceRows,
  extractPlayerPropConfidenceRows,
} from "../src/lib/nations-league/extract-confidence-eval-rows";
import { fetchAllRows } from "../src/lib/nations-league/fetch-all-rows";
import {
  loadNlCalibrationConfig,
  NL_CALIBRATION_DEFAULTS,
} from "../src/lib/nations-league/nl-calibration-config";
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

function formatFloor(value: number | null): string {
  if (value == null) return "none yet";
  return `${(value * 100).toFixed(0)}%+`;
}

async function main() {
  loadEnvLocal();
  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const current = await loadNlCalibrationConfig();

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

  if (!rows.length) {
    console.log("No locked evaluation rows yet - confidence layer left unchanged.");
    return;
  }

  const layer = calibrateConfidenceLayer({
    rows,
    previous: current.confidenceLayer ?? null,
  });

  const strongMarkets = Object.values(layer.markets)
    .filter((m) => m.strongFloor != null)
    .sort((a, b) => (a.strongFloor ?? 1) - (b.strongFloor ?? 1));
  const weakOrBetter = Object.values(layer.markets).filter((m) =>
    m.bins.some((b) => b.n > 0 && b.tier !== "none")
  );

  const version = layer.version;
  const { error: insertErr } = await supabase.from("nations_league_calibration_config").insert({
    version,
    constants: {
      ...NL_CALIBRATION_DEFAULTS,
      ...current,
      confidenceLayer: layer,
      modelVersion: current.modelVersion,
    },
    metrics: {
      note: `Confidence layer rebuilt on ${rows.length} locked lines (${layer.trainN} train / ${layer.holdoutN} holdout). ${strongMarkets.length} market(s) have a Strong band.`,
      confidence_train_n: layer.trainN,
      confidence_holdout_n: layer.holdoutN,
      confidence_markets: Object.keys(layer.markets).length,
      confidence_strong_markets: strongMarkets.map((m) => m.marketKey),
    },
    effective_from: new Date().toISOString(),
  });
  if (insertErr) throw new Error(insertErr.message);

  console.log(`Saved confidence layer: ${version}`);
  console.log(
    `  Train lines: ${layer.trainN}. Holdout lines: ${layer.holdoutN}. Markets: ${Object.keys(layer.markets).length}. With a usable band: ${weakOrBetter.length}.`
  );
  if (!strongMarkets.length) {
    console.log("  No Strong bands yet - history is still too thin or poorly calibrated for decision-ready picks.");
  } else {
    for (const market of strongMarkets.slice(0, 12)) {
      console.log(
        `  Strong ${market.marketKey}: model ${formatFloor(market.strongFloor)} (n=${market.n})`
      );
    }
  }
  const sampleWeak = weakOrBetter
    .flatMap((m) =>
      m.bins
        .filter((b) => b.tier === "weak" || b.tier === "moderate")
        .map((b) => `${m.marketKey}@${b.label}=${b.tier}`)
    )
    .slice(0, 8);
  if (sampleWeak.length) {
    console.log(`  Sample usable bands: ${sampleWeak.join("; ")}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
