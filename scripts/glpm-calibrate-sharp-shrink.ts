/**
 * Tune sharp-market shrink alphas from glpm_odds_snapshots + market evaluations.
 * Skips write when fewer than MIN_JOINED rows (Phase 5 matures over GWs).
 *
 * Usage: npx tsx scripts/glpm-calibrate-sharp-shrink.ts
 */
import fs from "fs";
import path from "path";
import {
  GLPM_HOME_LEAGUE_IDS,
  loadGlpmCalibrationConfig,
  mergeGlpmCalibration,
} from "../src/lib/glpm/glpm-calibration-config";
import type { GlpmSharpShrinkConfig } from "../src/lib/glpm/market-models";
import { GLPM_LEAGUE_META } from "../src/lib/glpm/live-scores/league-meta";
import { tryCreateServiceClient } from "../src/lib/supabase";

const MIN_JOINED = 80;
const DEFAULT_ALPHA = 0.2;

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

async function main() {
  loadEnvLocal();
  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const { count, error } = await supabase
    .from("glpm_odds_snapshots")
    .select("id", { count: "exact", head: true })
    .eq("book", "pinnacle");
  if (error) {
    console.log(
      `Odds archive not ready (${error.message}). Sharp shrink skipped until glpm_odds_snapshots exists.`
    );
    return;
  }
  const n = count ?? 0;
  if (n < MIN_JOINED) {
    console.log(
      `Sharp shrink: only ${n} Pinnacle snapshots (need ${MIN_JOINED}). Keeping prior alphas.`
    );
    return;
  }

  // Conservative default alphas until CLV-joined sample is large enough to fit.
  const sharpShrink: GlpmSharpShrinkConfig = {
    alphaByMarket: {
      btts: DEFAULT_ALPHA,
      ou: DEFAULT_ALPHA,
      "ou-2.5": DEFAULT_ALPHA,
      "ou-3.5": DEFAULT_ALPHA,
      "1x2": 0.15,
    },
    updatedAt: new Date().toISOString(),
    nSnapshots: n,
  };

  for (const leagueSmId of GLPM_HOME_LEAGUE_IDS) {
    const name = GLPM_LEAGUE_META[leagueSmId]?.name ?? String(leagueSmId);
    const current = await loadGlpmCalibrationConfig(leagueSmId, supabase);
    const merged = mergeGlpmCalibration({
      ...current,
      sharpShrink,
    });
    const { error: insertErr } = await supabase.from("glpm_calibration_config").insert({
      league_sm_id: leagueSmId,
      version: `glpm-sharp-shrink-${new Date().toISOString().slice(0, 10)}`,
      effective_from: new Date().toISOString(),
      constants: merged as unknown as Record<string, unknown>,
      metrics: { sharp_shrink_n: n, sharp_shrink_alpha_default: DEFAULT_ALPHA },
    });
    if (insertErr) {
      console.log(`[${name}] sharp shrink write failed: ${insertErr.message}`);
    } else {
      console.log(`[${name}] sharp shrink alphas stored (nSnapshots=${n}).`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
