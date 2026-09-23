/**
 * Seed nations_league_groups from data/nations-league-2026/groups.json
 * and ensure teams rows exist.
 *
 * Prefer `npm run nl:seed-fixtures` which also upserts all league-phase +
 * knockout placeholder matches into `matches`.
 *
 * Usage: npx tsx scripts/nl-seed-groups.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  findNationsLeagueTeamByName,
  NATIONS_LEAGUE_2026_TEAMS,
} from "../src/lib/data/nations-league-2026-teams";
import { loadNlGroupDraw, leagueTierFromGroupCode } from "../src/lib/nations-league/group-draw";
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
  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const { error: teamErr } = await supabase.from("teams").upsert(
    NATIONS_LEAGUE_2026_TEAMS.map((t) => ({ id: String(t.id), name: t.name }))
  );
  if (teamErr) throw teamErr;

  const draw = loadNlGroupDraw();
  const rows: Array<{
    league_tier: string;
    group_code: string;
    team_id: string;
    sort_order: number;
  }> = [];

  for (const [groupCode, names] of Object.entries(draw)) {
    const tier = leagueTierFromGroupCode(groupCode);
    if (!tier) continue;
    names.forEach((name, idx) => {
      const team = findNationsLeagueTeamByName(name);
      if (!team) {
        console.warn("Unknown team in draw:", name);
        return;
      }
      rows.push({
        league_tier: tier,
        group_code: groupCode,
        team_id: String(team.id),
        sort_order: idx,
      });
    });
  }

  const { error } = await supabase.from("nations_league_groups").upsert(rows);
  if (error) throw error;

  console.log(`Seeded ${rows.length} nations_league_groups rows.`);
  // Keep groups.json in sync note
  const out = path.join(process.cwd(), "data/nations-league-2026/groups.json");
  if (fs.existsSync(out)) console.log("Draw file:", out);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
