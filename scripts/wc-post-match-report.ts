/**
 * Plain-English post-match summary after the full pipeline (evaluate → calibrate → ML → sync).
 *
 * Usage: npx tsx scripts/wc-post-match-report.ts
 */
import fs from "node:fs";
import path from "node:path";
import { buildPostMatchSummary } from "../src/lib/world-cup/build-post-match-summary";
import {
  readPostMatchRunManifest,
  type PostMatchRunManifest,
} from "../src/lib/world-cup/post-match-run-manifest";
import { loadWcCalibrationConfig } from "../src/lib/world-cup/wc-calibration-config";
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

async function fallbackManifest(): Promise<PostMatchRunManifest> {
  const calibration = await loadWcCalibrationConfig();
  return {
    startedAt: new Date().toISOString(),
    articleFiles: [],
    playerStatsFixtureCount: 0,
    calibrationBefore: { version: calibration.modelVersion, constants: calibration },
    finishedMatchCountBefore: 0,
  };
}

async function main() {
  loadEnvLocal();
  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const manifest = readPostMatchRunManifest() ?? (await fallbackManifest());
  const report = await buildPostMatchSummary(supabase, manifest);

  const divider = "=".repeat(72);
  console.log(`\n${divider}\n  WC POST-MATCH SUMMARY\n${divider}\n`);
  console.log(report);
  console.log(`\n${divider}\n`);

  const outDir = path.join(process.cwd(), "data/reports");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const outPath = path.join(outDir, `wc-post-match-${stamp}.md`);
  fs.writeFileSync(outPath, report, "utf8");
  console.log(`Full report saved to:\n  ${outPath}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
