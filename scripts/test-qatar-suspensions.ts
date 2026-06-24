import { tryCreateServiceClient } from "../src/lib/supabase";
import {
  computeWcSuspendedPlayerNames,
  loadWcDisciplineHistoryForTeam,
  loadWcSuspendedPlayerNamesForTeam,
  priorFinishedWcMatchesForTeam,
} from "../src/lib/world-cup/wc-tournament-discipline";
import type { WcMatchRow } from "../src/lib/world-cup/standings";

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
  if (!supabase) throw new Error("no supabase");

  const { data: teams } = await supabase.from("teams").select("id, name");
  const teamNames = new Map((teams ?? []).map((t) => [String(t.id), t.name as string]));
  const { data: rows } = await supabase
    .from("matches")
    .select("id, date, status, round, home_team_id, away_team_id, home_goals, away_goals")
    .or("competition.ilike.%World Cup%");

  const matches: WcMatchRow[] = (rows ?? []).map((row) => ({
    id: String(row.id),
    date: row.date,
    time: null,
    status: row.status,
    round: row.round,
    home_team_id: row.home_team_id,
    away_team_id: row.away_team_id,
    home_goals: row.home_goals,
    away_goals: row.away_goals,
    home_team_name: row.home_team_id ? teamNames.get(String(row.home_team_id)) : undefined,
    away_team_name: row.away_team_id ? teamNames.get(String(row.away_team_id)) : undefined,
    group_code: null,
  }));

  const prior = priorFinishedWcMatchesForTeam(matches, 4792, "2026-06-24");
  const history = await loadWcDisciplineHistoryForTeam(supabase, 4792, prior);
  console.log("Discipline history:", history);
  const suspended = computeWcSuspendedPlayerNames({ priorMatches: prior, disciplineHistory: history });
  console.log("Suspended (computed):", [...suspended]);
  const loaded = await loadWcSuspendedPlayerNamesForTeam({
    supabase,
    teamApiId: 4792,
    finishedMatches: matches,
    beforeDate: "2026-06-24",
  });
  console.log("Suspended (loaded):", [...loaded]);
}

main();
