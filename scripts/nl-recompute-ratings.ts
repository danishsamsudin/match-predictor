/**
 * Recompute xG-Elo / WCTR / talent for all 54 Nations League nations.
 * Usage: npx tsx scripts/nl-recompute-ratings.ts
 */
import { NATIONS_LEAGUE_2026_TEAMS } from "../src/lib/data/nations-league-2026-teams";
import { loadInternationalFormMatchesForTeam } from "../src/lib/world-cup/load-international-form";
import { enrichFormMatchesWithProcessMetrics } from "../src/lib/world-cup/enrich-form-process-metrics";
import { loadProcessMetricsForTeam } from "../src/lib/data/match-process-metrics";
import { persistNationalTeamRatings } from "../src/lib/world-cup/load-national-ratings";
import { applyNlFormWeights } from "../src/lib/nations-league/nl-form-weights";
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

  console.log(
    `Recomputing NL ratings for ${NATIONS_LEAGUE_2026_TEAMS.length} nations...`
  );

  const allMatches = [];
  const teamIds: number[] = [];
  const teamNames = new Map<number, string>();
  let teamsLoaded = 0;

  for (const team of NATIONS_LEAGUE_2026_TEAMS) {
    teamIds.push(team.id);
    teamNames.set(team.id, team.name);
    const [form, metrics] = await Promise.all([
      loadInternationalFormMatchesForTeam(supabase, String(team.id), team.name, {
        limit: 100,
      }),
      loadProcessMetricsForTeam(supabase, team.id, 200),
    ]);
    const enriched = applyNlFormWeights(
      enrichFormMatchesWithProcessMetrics(form, metrics)
    );
    allMatches.push(...enriched);
    teamsLoaded += 1;
    if (teamsLoaded % 10 === 0 || teamsLoaded === NATIONS_LEAGUE_2026_TEAMS.length) {
      console.log(
        `  Loaded form for ${teamsLoaded}/${NATIONS_LEAGUE_2026_TEAMS.length} teams (${allMatches.length} form rows so far)`
      );
    }
  }

  const deduped = [
    ...new Map(
      allMatches.map((m) => [`${m.date}|${m.home_team_id}|${m.away_team_id}`, m])
    ).values(),
  ];

  console.log(`Persisting ratings from ${deduped.length} unique matches...`);
  await persistNationalTeamRatings(deduped, teamIds, teamNames);
  console.log(
    `Persisted NL ratings for ${teamIds.length} teams from ${deduped.length} matches.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
