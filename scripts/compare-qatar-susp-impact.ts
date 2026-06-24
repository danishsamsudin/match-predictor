/**
 * Compare Qatar/Bosnia prediction with and without suspension exclusions.
 */
import { tryCreateServiceClient } from "../src/lib/supabase";
import { runHubMainPredict } from "../src/lib/world-cup/hub-main-predict";
import { resolveWcModelStartingXi } from "../src/lib/world-cup/resolve-wc-model-starting-xi";
import {
  computeWcSuspendedPlayerNames,
  loadWcDisciplineHistoryForTeam,
  priorFinishedWcMatchesForTeam,
} from "../src/lib/world-cup/wc-tournament-discipline";
import { filterWorldCup2026GroupStageMatches } from "../src/lib/world-cup/tournament-fixtures";
import { buildTeamIdToGroupMap } from "../src/lib/world-cup/group-draw";
import { resolveApiTeamId } from "../src/lib/world-cup/resolve-api-team-id";
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
  if (!supabase) throw new Error("No supabase");

  const { data: teams } = await supabase.from("teams").select("id, name");
  const teamNames = new Map((teams ?? []).map((t) => [String(t.id), t.name as string]));
  const teamToGroup = buildTeamIdToGroupMap(teamNames);

  const { data: rows } = await supabase
    .from("matches")
    .select(
      "id, date, time, status, round, competition, group_code, home_team_id, away_team_id, home_goals, away_goals, venue_city"
    )
    .or("competition.ilike.%World Cup%");

  const mapped: WcMatchRow[] = (rows ?? []).map((row) => ({
    id: String(row.id),
    date: row.date,
    time: row.time,
    status: row.status,
    round: row.round,
    competition: row.competition,
    group_code: row.group_code,
    home_team_id: row.home_team_id,
    away_team_id: row.away_team_id,
    home_goals: row.home_goals,
    away_goals: row.away_goals,
    venue_city: row.venue_city,
    home_team_name: row.home_team_id ? teamNames.get(String(row.home_team_id)) : undefined,
    away_team_name: row.away_team_id ? teamNames.get(String(row.away_team_id)) : undefined,
  }));

  const matches = filterWorldCup2026GroupStageMatches(mapped, teamToGroup);
  const match = matches.find((m) => m.id === "a7dd033a-2472-55a1-9a1c-9227d6b78253");
  if (!match) throw new Error("Match not found in filtered set");

  const qatarApi = 4792;
  const prior = priorFinishedWcMatchesForTeam(matches, qatarApi, match.date);
  const history = await loadWcDisciplineHistoryForTeam(supabase, qatarApi, prior);
  const suspended = computeWcSuspendedPlayerNames({ priorMatches: prior, disciplineHistory: history });
  console.log("Qatar suspended:", [...suspended]);

  const [xiBase, xiSusp] = await Promise.all([
    resolveWcModelStartingXi({ supabase, teamApiId: qatarApi, teamName: "Qatar" }),
    resolveWcModelStartingXi({
      supabase,
      teamApiId: qatarApi,
      teamName: "Qatar",
      excludedPlayerNames: suspended,
    }),
  ]);

  console.log("\nQatar XI source:", xiSusp.source);
  console.log("Base XI:", xiBase.playerNames.join(", "));
  console.log("With susp exclusions:", xiSusp.playerNames.join(", "));
  console.log("Warnings:", xiSusp.warnings);

  const [withXi, withoutXi] = await Promise.all([
    runHubMainPredict(match, { finishedMatches: matches, applyModelXi: true }),
    runHubMainPredict(match, { finishedMatches: matches, applyModelXi: false }),
  ]);

  const fmt = (p: typeof withXi) =>
    p
      ? `${(p.home_win_pct * 100).toFixed(1)}% / ${(p.draw_pct * 100).toFixed(1)}% / ${(p.away_win_pct * 100).toFixed(1)}%`
      : "null";

  console.log("\nWith model XI (suspensions applied):", fmt(withXi));
  console.log("Without model XI:", fmt(withoutXi));

  const snap = withXi?.snapshot as Record<string, unknown>;
  const opta = (snap?.opta_features ?? {}) as Record<string, unknown>;
  console.log("away_suspended in snapshot:", opta.away_suspended_players);
  console.log("lineup mults:", snap?.lineup_home_xg_mult, snap?.lineup_away_xg_mult);
}

main();
