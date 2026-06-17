/**
 * Recompute xG-Elo / WCTR / talent ratings for WC 2026 nations.
 *
 * Usage: npx tsx scripts/recompute-national-xg-elo.ts
 */
import { WORLD_CUP_2026_TEAMS } from "../src/lib/data/world-cup-2026-teams";
import { loadInternationalFormMatchesForTeam } from "../src/lib/world-cup/load-international-form";
import { enrichFormMatchesWithProcessMetrics } from "../src/lib/world-cup/enrich-form-process-metrics";
import { loadProcessMetricsForTeam } from "../src/lib/data/match-process-metrics";
import { persistNationalTeamRatings } from "../src/lib/world-cup/load-national-ratings";
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

  const allMatches = [];
  const teamIds: number[] = [];
  const teamNames = new Map<number, string>();

  for (const team of WORLD_CUP_2026_TEAMS) {
    teamIds.push(team.id);
    teamNames.set(team.id, team.name);
    const [form, metrics] = await Promise.all([
      loadInternationalFormMatchesForTeam(supabase, String(team.id), team.name, { limit: 80 }),
      loadProcessMetricsForTeam(supabase, team.id, 150),
    ]);
    allMatches.push(...enrichFormMatchesWithProcessMetrics(form, metrics));
  }

  const deduped = [
    ...new Map(
      allMatches.map((m) => [`${m.date}|${m.home_team_id}|${m.away_team_id}`, m])
    ).values(),
  ];

  await persistNationalTeamRatings(deduped, teamIds, teamNames);
  console.log(`Persisted ratings for ${teamIds.length} teams from ${deduped.length} matches.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
