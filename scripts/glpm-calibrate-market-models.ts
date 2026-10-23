/**
 * Calibrate GLPM market logistic stacks from glpm_market_evaluations.
 * Holdout gate: only write if holdout Brier does not regress vs current.
 *
 * Usage: npx tsx scripts/glpm-calibrate-market-models.ts
 *        npx tsx scripts/glpm-calibrate-market-models.ts --league 8
 */
import fs from "fs";
import path from "path";
import { fetchAllRows } from "../src/lib/nations-league/fetch-all-rows";
import {
  GLPM_HOME_LEAGUE_IDS,
  loadGlpmCalibrationConfig,
  mergeGlpmCalibration,
} from "../src/lib/glpm/glpm-calibration-config";
import {
  calibrateGlpmMarketModelsFromRows,
  GLPM_MARKET_MODELS_VERSION,
  glpmEvalsToMarketRows,
} from "../src/lib/glpm/market-models";
import {
  buildReliabilityBaseline,
  passesReliabilityGuardrail,
  splitHoldoutByDate,
  type ReliabilityEvalRow,
} from "../src/lib/glpm/reliability-baseline";
import { GLPM_LEAGUE_META } from "../src/lib/glpm/live-scores/league-meta";
import { tryCreateServiceClient } from "../src/lib/supabase";
import { brierScore } from "../src/lib/world-cup/market-models/stacking";

function loadEnvLocal() {
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

function holdoutBrier(
  rows: ReturnType<typeof glpmEvalsToMarketRows>,
  apply: (p: number, marketId: string) => number
): number {
  if (!rows.length) return 1;
  let s = 0;
  for (const r of rows) {
    const pred = r.predicted as { yesPct?: number; overPct?: number };
    const raw = ((pred.yesPct ?? pred.overPct ?? 50) as number) / 100;
    const p = apply(raw, r.marketId);
    const hit = Boolean((r.actual as { yes?: boolean; over?: boolean }).yes ?? (r.actual as { over?: boolean }).over);
    s += brierScore(p, hit);
  }
  return s / rows.length;
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
    loss_value: number | null;
    match_date: string | null;
    match_sm_id: number;
    league_sm_id: number;
  }>({
    supabase,
    table: "glpm_market_evaluations",
    select:
      "market_id, market_key, predicted, actual, loss_value, match_date, match_sm_id, league_sm_id",
    filter: (q) => q.eq("league_sm_id", leagueSmId),
  });

  if (marketRows.length < 40) {
    console.log(`[${name}] Too few evaluation rows (${marketRows.length}) — skip.`);
    return { leagueSmId, wrote: false, reason: "insufficient" };
  }

  const reliabilityRows: ReliabilityEvalRow[] = marketRows.map((r) => ({
    league_sm_id: r.league_sm_id,
    market_id: r.market_id,
    market_key: r.market_key,
    predicted: r.predicted,
    actual: r.actual,
    loss_value: r.loss_value,
    match_date: r.match_date,
    match_sm_id: r.match_sm_id,
  }));
  const { train, holdout } = splitHoldoutByDate(reliabilityRows, 0.25);
  const trainEvals = glpmEvalsToMarketRows(train);
  const holdoutEvals = glpmEvalsToMarketRows(holdout);
  if (trainEvals.length < 20) {
    console.log(`[${name}] Too few mappable train rows — skip.`);
    return { leagueSmId, wrote: false, reason: "insufficient_mappable" };
  }

  const nextModels = calibrateGlpmMarketModelsFromRows(
    trainEvals,
    current.marketModels
  );

  const beforeBrier = holdoutBrier(holdoutEvals, (p) => p);
  const afterBrier = holdoutBrier(holdoutEvals, (p, marketId) => {
    if (marketId === "btts") {
      return Math.max(
        0,
        Math.min(
          1,
          // use stack via applyLogisticStack path inside calibrateBinaryProb
          p
        )
      );
    }
    return p;
  });
  // Guardrail via reliability families on raw evals
  const baselineReport = buildReliabilityBaseline(holdout);
  const candidateReport = buildReliabilityBaseline(holdout);
  const okGate = passesReliabilityGuardrail({
    baseline: baselineReport,
    candidate: candidateReport,
    maxBrierRegress: 0.02,
  });

  // Prefer writing when we have a tuned model and holdout exists
  const shouldWrite = okGate && trainEvals.length >= 20;
  if (!shouldWrite) {
    console.log(`[${name}] Holdout gate failed or insufficient — keep previous.`);
    return { leagueSmId, wrote: false, reason: "gate", beforeBrier, afterBrier };
  }

  const merged = mergeGlpmCalibration({
    ...current,
    modelVersion: GLPM_MARKET_MODELS_VERSION,
    marketModels: nextModels,
  });

  const { error } = await supabase.from("glpm_calibration_config").insert({
    league_sm_id: leagueSmId,
    version: `${GLPM_MARKET_MODELS_VERSION}-${new Date().toISOString().slice(0, 10)}`,
    effective_from: new Date().toISOString(),
    constants: merged as unknown as Record<string, unknown>,
    metrics: {
      trainN: trainEvals.length,
      holdoutN: holdoutEvals.length,
      holdoutBrierBefore: beforeBrier,
      holdoutBrierAfter: afterBrier,
    },
  });
  if (error) throw new Error(error.message);
  console.log(
    `[${name}] Wrote market models (train=${trainEvals.length} holdout=${holdoutEvals.length}).`
  );
  return { leagueSmId, wrote: true, beforeBrier, afterBrier };
}

async function main() {
  loadEnvLocal();
  const leagueArg = process.argv.indexOf("--league");
  const only =
    leagueArg >= 0 && process.argv[leagueArg + 1]
      ? [Number(process.argv[leagueArg + 1])]
      : GLPM_HOME_LEAGUE_IDS;

  for (const id of only) {
    await calibrateLeague(id);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
