/**
 * Rebuild per-league GLPM confidence layers from locked market evaluations.
 *
 * Usage: npx tsx scripts/glpm-calibrate-confidence.ts
 *        npx tsx scripts/glpm-calibrate-confidence.ts --league 8
 */
import { calibrateConfidenceLayer } from "../src/lib/value-opportunities/confidence-layer";
import { extractMarketConfidenceRows } from "../src/lib/value-opportunities/extract-confidence-eval-rows";
import { fetchAllRows } from "../src/lib/nations-league/fetch-all-rows";
import {
  GLPM_HOME_LEAGUE_IDS,
  glpmConfidenceVersionPrefix,
  loadGlpmCalibrationConfig,
  mergeGlpmCalibration,
} from "../src/lib/glpm/glpm-calibration-config";
import { GLPM_LEAGUE_META } from "../src/lib/glpm/live-scores/league-meta";
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

async function calibrateLeague(leagueSmId: number) {
  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const name = GLPM_LEAGUE_META[leagueSmId]?.name ?? `league ${leagueSmId}`;
  const current = await loadGlpmCalibrationConfig(leagueSmId, supabase);

  const marketRows = await fetchAllRows<{
    market_id: string;
    market_key: string;
    predicted: Record<string, unknown> | null;
    actual: Record<string, unknown> | null;
    match_date: string | null;
    league_sm_id: number;
  }>({
    supabase,
    table: "glpm_market_evaluations",
    select: "market_id, market_key, predicted, actual, match_date, league_sm_id",
    filter: (q) => q.eq("league_sm_id", leagueSmId),
  });

  const rows = extractMarketConfidenceRows(marketRows);
  if (!rows.length) {
    console.log(`[${name}] No locked evaluation rows yet - confidence layer left unchanged.`);
    return;
  }

  const layer = calibrateConfidenceLayer({
    rows,
    previous: current.confidenceLayer ?? null,
    versionPrefix: glpmConfidenceVersionPrefix(leagueSmId),
  });

  const strongMarkets = Object.values(layer.markets)
    .filter((m) => m.strongFloor != null)
    .sort((a, b) => (a.strongFloor ?? 1) - (b.strongFloor ?? 1));
  const weakOrBetter = Object.values(layer.markets).filter((m) =>
    m.bins.some((b) => b.n > 0 && b.tier !== "none")
  );

  const merged = mergeGlpmCalibration({
    ...current,
    confidenceLayer: layer,
  });

  const { error: insertErr } = await supabase.from("glpm_calibration_config").insert({
    league_sm_id: leagueSmId,
    version: layer.version,
    constants: merged,
    metrics: {
      note: `Confidence layer rebuilt on ${rows.length} locked lines (${layer.trainN} train / ${layer.holdoutN} holdout). ${strongMarkets.length} market(s) have a Strong band.`,
      confidence_train_n: layer.trainN,
      confidence_holdout_n: layer.holdoutN,
      confidence_markets: Object.keys(layer.markets).length,
      confidence_strong_markets: strongMarkets.map((m) => m.marketKey),
    },
    effective_from: new Date().toISOString(),
  });
  if (insertErr) throw new Error(`[${name}] ${insertErr.message}`);

  console.log(`[${name}] Saved confidence layer: ${layer.version}`);
  console.log(
    `  Train lines: ${layer.trainN}. Holdout: ${layer.holdoutN}. Markets: ${Object.keys(layer.markets).length}. Usable bands: ${weakOrBetter.length}.`
  );
  if (!strongMarkets.length) {
    console.log("  No Strong bands yet.");
  } else {
    for (const market of strongMarkets.slice(0, 8)) {
      console.log(
        `  Strong ${market.marketKey}: model ${formatFloor(market.strongFloor)} (n=${market.n})`
      );
    }
  }
}

async function main() {
  loadEnvLocal();
  const argv = process.argv.slice(2);
  const leagueIdx = argv.indexOf("--league");
  const only =
    leagueIdx >= 0 && argv[leagueIdx + 1] != null
      ? [Number(argv[leagueIdx + 1])].filter(Number.isFinite)
      : GLPM_HOME_LEAGUE_IDS;

  for (const leagueSmId of only) {
    await calibrateLeague(leagueSmId);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
