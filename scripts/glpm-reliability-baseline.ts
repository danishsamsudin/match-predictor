/**
 * Build and save a GLPM reliability baseline from glpm_market_evaluations.
 *
 * Usage: npx tsx scripts/glpm-reliability-baseline.ts
 *        npx tsx scripts/glpm-reliability-baseline.ts --out data/glpm/calibration/baselines/latest.json
 */
import fs from "fs";
import path from "path";
import { fetchAllRows } from "../src/lib/nations-league/fetch-all-rows";
import {
  buildReliabilityBaseline,
  type ReliabilityEvalRow,
} from "../src/lib/glpm/reliability-baseline";
import { GLPM_LEAGUE_META } from "../src/lib/glpm/live-scores/league-meta";
import { tryCreateServiceClient } from "../src/lib/supabase";

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
  const outArg = process.argv.indexOf("--out");
  const outPath =
    outArg >= 0 && process.argv[outArg + 1]
      ? process.argv[outArg + 1]
      : path.join(
          process.cwd(),
          "data/glpm/calibration/baselines",
          `baseline-${new Date().toISOString().slice(0, 10)}.json`
        );

  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const rows = await fetchAllRows<ReliabilityEvalRow>({
    supabase,
    table: "glpm_market_evaluations",
    select:
      "league_sm_id, market_id, market_key, predicted, actual, loss_value, match_date, match_sm_id",
  });

  const report = buildReliabilityBaseline(rows);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  const latest = path.join(path.dirname(outPath), "latest.json");
  fs.writeFileSync(latest, JSON.stringify(report, null, 2));

  console.log(
    JSON.stringify(
      {
        outPath,
        latest,
        nRows: report.nRows,
        overall: report.overall,
        leagues: report.leagues.map((l) => ({
          leagueSmId: l.leagueSmId,
          name: GLPM_LEAGUE_META[l.leagueSmId]?.name ?? String(l.leagueSmId),
          nRows: l.nRows,
          byFamily: l.byFamily,
        })),
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
