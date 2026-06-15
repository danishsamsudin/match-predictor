/**
 * Rebuild WC tournament form composites from ingested player stats.
 *
 * Usage: npx tsx scripts/wc-recompute-wc-form.ts
 */
import { recomputeWcTournamentForm } from "../src/lib/world-cup/ingest-opta-player-stats";
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

  const { players, teams } = await recomputeWcTournamentForm(supabase);
  console.log(`Recomputed tournament form: ${players} players across ${teams} teams.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
