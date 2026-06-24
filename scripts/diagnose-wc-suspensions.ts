/**
 * Diagnose WC suspension wiring for a fixture (default: Qatar).
 * Usage: npx tsx scripts/diagnose-wc-suspensions.ts [teamName]
 */
import { tryCreateServiceClient } from "../src/lib/supabase";
import { WORLD_CUP_2026_TEAMS } from "../src/lib/data/world-cup-2026-teams";
import { resolveApiTeamId } from "../src/lib/world-cup/resolve-api-team-id";
import {
  loadWcDisciplineHistoryForTeam,
  loadWcSuspendedPlayerNamesForTeam,
  priorFinishedWcMatchesForTeam,
} from "../src/lib/world-cup/wc-tournament-discipline";
import { resolveWcModelStartingXi } from "../src/lib/world-cup/resolve-wc-model-starting-xi";
import type { WcMatchRow } from "../src/lib/world-cup/standings";
import { loadEnvLocal } from "./load-env-local";

async function loadFinishedMatches(supabase: NonNullable<ReturnType<typeof tryCreateServiceClient>>) {
  const { data: teams } = await supabase.from("teams").select("id, name");
  const teamNames = new Map((teams ?? []).map((t) => [String(t.id), t.name as string]));

  const { data: rows } = await supabase
    .from("matches")
    .select("id, date, time, status, round, competition, group_code, home_team_id, away_team_id, home_goals, away_goals, venue_city")
    .or("competition.ilike.FIFA World Cup 2026%,competition.eq.World Cup");

  return (rows ?? []).map((row) => ({
    id: String(row.id),
    date: row.date,
    time: row.time,
    group_code: row.group_code,
    round: row.round,
    status: row.status,
    home_team_id: row.home_team_id,
    away_team_id: row.away_team_id,
    home_goals: row.home_goals,
    away_goals: row.away_goals,
    home_team_name: row.home_team_id ? teamNames.get(String(row.home_team_id)) : undefined,
    away_team_name: row.away_team_id ? teamNames.get(String(row.away_team_id)) : undefined,
    venue_city: row.venue_city,
  })) as WcMatchRow[];
}

async function main() {
  loadEnvLocal();
  const teamName = process.argv[2] ?? "Qatar";
  const team = WORLD_CUP_2026_TEAMS.find((t) => t.name.toLowerCase() === teamName.toLowerCase());
  if (!team) {
    console.error(`Unknown team: ${teamName}`);
    process.exit(1);
  }

  const supabase = tryCreateServiceClient();
  if (!supabase) {
    console.error("No Supabase client — check .env.local");
    process.exit(1);
  }

  const finishedMatches = await loadFinishedMatches(supabase);
  const upcoming = finishedMatches
    .filter((m) => (m.status ?? "").toLowerCase() !== "finished")
    .filter(
      (m) =>
        resolveApiTeamId(m.home_team_id ?? "", m.home_team_name ?? "") === team.id ||
        resolveApiTeamId(m.away_team_id ?? "", m.away_team_name ?? "") === team.id
    )
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

  const nextMatch = upcoming[0];
  const prior = priorFinishedWcMatchesForTeam(
    finishedMatches,
    team.id,
    nextMatch?.date ?? null
  );

  console.log(`\n=== WC Suspension diagnostic: ${team.name} (api ${team.id}) ===\n`);
  console.log(`Finished WC matches in DB: ${finishedMatches.filter((m) => m.status === "finished").length}`);
  console.log(`Prior matches for ${team.name}: ${prior.length}`);
  for (const m of prior) {
    console.log(`  - ${m.date} ${m.home_team_name} vs ${m.away_team_name} (${m.id.slice(0, 8)}…)`);
  }

  const { data: cardRows } = await supabase
    .from("world_cup_player_match_stats")
    .select("match_id, player_name, stats")
    .eq("team_api_id", team.id)
    .in(
      "match_id",
      prior.map((m) => m.id)
    );

  const withCards = (cardRows ?? []).filter((r) => {
    const s = (r.stats ?? {}) as Record<string, unknown>;
    const y = Number(s.cards_yellow ?? s.YC ?? 0);
    const red = Number(s.cards_red ?? s.RC ?? 0);
    return y > 0 || red > 0;
  });

  console.log(`\nPlayer match stats rows with cards: ${withCards.length}`);
  for (const r of withCards.slice(0, 20)) {
    const s = r.stats as Record<string, unknown>;
    console.log(
      `  ${r.player_name}: Y=${s.cards_yellow ?? s.YC ?? 0} R=${s.cards_red ?? s.RC ?? 0} (match ${String(r.match_id).slice(0, 8)}…)`
    );
  }

  const history = await loadWcDisciplineHistoryForTeam(supabase, team.id, prior);
  console.log(`\nDiscipline history entries: ${history.length}`);

  const suspended = await loadWcSuspendedPlayerNamesForTeam({
    supabase,
    teamApiId: team.id,
    finishedMatches,
    beforeDate: nextMatch?.date ?? null,
  });

  console.log(`\nSuspended for next match: ${suspended.size ? [...suspended].join(", ") : "(none)"}`);

  if (nextMatch) {
    console.log(
      `\nNext fixture: ${nextMatch.date} ${nextMatch.home_team_name} vs ${nextMatch.away_team_name}`
    );

    const { data: pred } = await supabase
      .from("world_cup_predictions")
      .select("home_win_pct, draw_pct, away_win_pct, snapshot, computed_at")
      .eq("match_id", nextMatch.id)
      .maybeSingle();

    if (pred) {
      const snap = pred.snapshot as Record<string, unknown>;
      const opta = (snap.opta_features ?? {}) as Record<string, unknown>;
      console.log(`\nStored prediction (computed ${pred.computed_at}):`);
      console.log(
        `  1X2: ${(Number(pred.home_win_pct) * 100).toFixed(1)}% / ${(Number(pred.draw_pct) * 100).toFixed(1)}% / ${(Number(pred.away_win_pct) * 100).toFixed(1)}%`
      );
      console.log(`  home_xg: ${snap.home_xg} away_xg: ${snap.away_xg}`);
      console.log(`  home_suspended_players: ${JSON.stringify(opta.home_suspended_players ?? null)}`);
      console.log(`  away_suspended_players: ${JSON.stringify(opta.away_suspended_players ?? null)}`);
      console.log(`  model_xi_source_home: ${opta.model_xi_source_home}`);
      console.log(`  model_xi_warnings: ${JSON.stringify(opta.model_xi_warnings ?? [])}`);
    } else {
      console.log("\nNo world_cup_predictions row for next fixture.");
    }
  }

  const xi = await resolveWcModelStartingXi({
    supabase,
    teamApiId: team.id,
    teamName: team.name,
    excludedPlayerNames: suspended,
  });
  console.log(`\nModel XI source: ${xi.source}`);
  console.log(`Starters: ${xi.playerNames.join(", ")}`);
  if (xi.warnings.length) console.log(`Warnings: ${xi.warnings.join(" | ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
