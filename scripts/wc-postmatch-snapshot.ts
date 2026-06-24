/**
 * Capture pre-pipeline state for the post-match summary.
 *
 * Usage: npx tsx scripts/wc-postmatch-snapshot.ts [article.html ...]
 */
import path from "node:path";
import {
  writePostMatchRunManifest,
  type PostMatchRunManifest,
} from "../src/lib/world-cup/post-match-run-manifest";
import { listWcPlayerStatsFixtures } from "../src/lib/world-cup/wc-player-stats-dir";
import { loadWcCalibrationConfig } from "../src/lib/world-cup/wc-calibration-config";
import { tryCreateServiceClient } from "../src/lib/supabase";

function loadEnvLocal() {
  const fs = require("fs") as typeof import("fs");
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
  const { count } = await supabase
    .from("matches")
    .select("id", { count: "exact", head: true })
    .eq("status", "finished")
    .or("competition.ilike.FIFA World Cup 2026%,competition.eq.World Cup");

  const articleFiles = process.argv
    .slice(2)
    .map((f) => f.trim())
    .filter((f) => f && !f.startsWith("-"));

  const manifest: PostMatchRunManifest = {
    startedAt: new Date().toISOString(),
    articleFiles,
    playerStatsFixtureCount: listWcPlayerStatsFixtures().length,
    calibrationBefore: {
      version: calibration.modelVersion,
      constants: calibration,
    },
    finishedMatchCountBefore: count ?? 0,
    pipelineRun: true,
  };
  writePostMatchRunManifest(manifest);

  console.log(`Snapshot saved (${manifest.calibrationBefore.version}, ${count ?? 0} finished matches).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
