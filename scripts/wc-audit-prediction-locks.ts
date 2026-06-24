/**
 * Audit WC prediction locks: computed_at vs kickoff, snapshot completeness.
 *
 * Usage: npx tsx scripts/wc-audit-prediction-locks.ts
 */
import { resolveWcKickoffUtcMs } from "../src/lib/world-cup/match-kickoff";
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

const REQUIRED_SNAPSHOT_KEYS = [
  "home_xg",
  "away_xg",
  "rho",
  "sigma_home",
  "sigma_away",
  "scenario",
];

async function main() {
  loadEnvLocal();
  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const { data: matches, error } = await supabase
    .from("matches")
    .select("id, date, time, status, home_goals, away_goals, venue_city")
    .or("competition.ilike.FIFA World Cup 2026%,competition.eq.World Cup")
    .eq("status", "finished");

  if (error) throw new Error(error.message);

  const wcClient = supabase as unknown as {
    from: (table: string) => {
      select: (cols: string) => Promise<{
        data: Array<Record<string, unknown>> | null;
        error: { message: string } | null;
      }>;
    };
  };

  const { data: preds, error: predErr } = await wcClient
    .from("world_cup_predictions")
    .select("match_id, computed_at, snapshot, model_version");

  if (predErr) throw new Error(predErr.message);

  const predByMatch = new Map((preds ?? []).map((p) => [String(p.match_id), p]));
  const critical: string[] = [];
  const warnings: string[] = [];

  for (const m of matches ?? []) {
    const id = String(m.id);
    const pred = predByMatch.get(id);
    if (!pred) {
      critical.push(`${id}: missing world_cup_predictions row`);
      continue;
    }

    const kickoffMs = resolveWcKickoffUtcMs({
      date: m.date,
      time: m.time,
      venueCity: m.venue_city,
    });
    const computedAt = pred.computed_at ? Date.parse(String(pred.computed_at)) : NaN;
    if (Number.isFinite(kickoffMs) && Number.isFinite(computedAt) && computedAt > kickoffMs) {
      critical.push(`${id}: prediction computed after kickoff`);
    }

    const snapshot = (pred.snapshot as Record<string, unknown>) ?? {};
    for (const key of REQUIRED_SNAPSHOT_KEYS) {
      if (snapshot[key] == null) {
        warnings.push(`${id}: snapshot missing ${key}`);
      }
    }
  }

  console.log(`Audited ${matches?.length ?? 0} finished WC matches.`);
  if (warnings.length) {
    console.log(`\nWarnings (${warnings.length}):`);
    for (const w of warnings.slice(0, 20)) console.log(`  • ${w}`);
    if (warnings.length > 20) console.log(`  … and ${warnings.length - 20} more`);
  }
  if (critical.length) {
    console.error(`\nCritical failures (${critical.length}):`);
    for (const c of critical) console.error(`  • ${c}`);
    process.exit(1);
  }
  console.log("\nNo critical prediction-lock failures.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
