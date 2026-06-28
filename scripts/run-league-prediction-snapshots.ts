/**
 * Run daily league prediction snapshots (fixtures kicking off today UTC).
 *
 * Usage: npx tsx scripts/run-league-prediction-snapshots.ts
 *        npx tsx scripts/run-league-prediction-snapshots.ts --date=2026-08-15
 */
import { runLeaguePredictionSnapshots } from "../src/lib/prediction/run-league-prediction-snapshots";

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
  const dateArg = process.argv.find((a) => a.startsWith("--date="));
  const snapshotDate = dateArg?.split("=")[1]?.trim().slice(0, 10);

  const result = await runLeaguePredictionSnapshots({ snapshotDate });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
