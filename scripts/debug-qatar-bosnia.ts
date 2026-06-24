/**
 * List WC matches and team ID resolution for Qatar/Bosnia debugging.
 */
import { tryCreateServiceClient } from "../src/lib/supabase";
import { resolveApiTeamId } from "../src/lib/world-cup/resolve-api-team-id";
import { priorFinishedWcMatchesForTeam } from "../src/lib/world-cup/wc-tournament-discipline";
import type { WcMatchRow } from "../src/lib/world-cup/standings";
import { loadEnvLocal } from "./load-env-local";

async function main() {
  loadEnvLocal();
  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("No supabase");

  const { data: teams } = await supabase.from("teams").select("id, name");
  const teamNames = new Map((teams ?? []).map((t) => [String(t.id), t.name as string]));

  const { data: rows } = await supabase
    .from("matches")
    .select("id, date, time, status, round, home_team_id, away_team_id, home_goals, away_goals, competition")
    .or("competition.ilike.%World Cup%");

  const matches: WcMatchRow[] = (rows ?? []).map((row) => ({
    id: String(row.id),
    date: row.date,
    time: row.time,
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

  console.log("Status values:", [...new Set(matches.map((m) => m.status))].join(", "));
  console.log("\nQatar / Bosnia matches:");
  for (const m of matches) {
    const hn = m.home_team_name ?? "?";
    const an = m.away_team_name ?? "?";
    if (!/qatar|bosnia/i.test(`${hn} ${an}`)) continue;
    const h = resolveApiTeamId(m.home_team_id ?? "", hn);
    const a = resolveApiTeamId(m.away_team_id ?? "", an);
    console.log(
      `${m.date} [${m.status}] ${hn} vs ${an} | api ${h}-${a} | score ${m.home_goals}-${m.away_goals} | ids ${m.home_team_id?.slice?.(0, 8)} / ${m.away_team_id?.slice?.(0, 8)}`
    );
  }

  const qatarPrior = priorFinishedWcMatchesForTeam(matches, 4792, "2026-06-25");
  console.log(`\nQatar prior matches (before 2026-06-25): ${qatarPrior.length}`);
  for (const m of qatarPrior) console.log(`  ${m.date} ${m.home_team_name} vs ${m.away_team_name}`);

  const qatarBosnia = matches.filter(
    (m) =>
      m.date === "2026-06-24" &&
      /qatar/i.test(`${m.home_team_name} ${m.away_team_name}`) &&
      /bosnia/i.test(`${m.home_team_name} ${m.away_team_name}`)
  );
  console.log(`\nQatar vs Bosnia rows on 2026-06-24: ${qatarBosnia.length}`);
  for (const m of qatarBosnia) {
    console.log(`  id=${m.id} status=${m.status} ${m.home_team_name} vs ${m.away_team_name}`);
    const prior = priorFinishedWcMatchesForTeam(matches, 4792, m.date);
    console.log(`  Qatar prior for this fixture: ${prior.length}`);

    const { data: cards } = await supabase
      .from("world_cup_player_match_stats")
      .select("match_id, player_name, stats")
      .eq("team_api_id", 4792)
      .in(
        "match_id",
        prior.map((p) => p.id)
      );
    let cardCount = 0;
    for (const c of cards ?? []) {
      const s = c.stats as Record<string, unknown>;
      const r = Number(s.cards_red ?? s.RC ?? 0);
      const y = Number(s.cards_yellow ?? s.YC ?? 0);
      if (r || y) {
        cardCount++;
        console.log(`    CARD ${c.player_name}: Y=${y} R=${r}`);
      }
    }
    console.log(`  Card rows in player_match_stats: ${cardCount}`);

    const { data: pred } = await supabase
      .from("world_cup_predictions")
      .select("home_win_pct, away_win_pct, draw_pct, computed_at, snapshot")
      .eq("match_id", m.id)
      .maybeSingle();
    if (pred) {
      const snap = pred.snapshot as Record<string, unknown>;
      const opta = (snap.opta_features ?? {}) as Record<string, unknown>;
      console.log(
        `  PRED ${(Number(pred.home_win_pct) * 100).toFixed(1)}% / ${(Number(pred.draw_pct) * 100).toFixed(1)}% / ${(Number(pred.away_win_pct) * 100).toFixed(1)}% @ ${pred.computed_at}`
      );
      console.log(`  home_suspended: ${JSON.stringify(opta.home_suspended_players ?? null)}`);
      console.log(`  away_suspended: ${JSON.stringify(opta.away_suspended_players ?? null)}`);
    } else {
      console.log("  NO prediction row");
    }
  }

  const { data: preds } = await supabase
    .from("world_cup_predictions")
    .select("match_id, home_win_pct, away_win_pct, computed_at, snapshot")
    .order("computed_at", { ascending: false })
    .limit(5);

  console.log("\nRecent predictions sample:");
  for (const p of preds ?? []) {
    const snap = p.snapshot as Record<string, unknown>;
    const opta = (snap.opta_features ?? {}) as Record<string, unknown>;
    console.log(
      `match ${String(p.match_id).slice(0, 8)} computed ${p.computed_at} | home ${p.home_win_pct} | suspended home ${JSON.stringify(opta.home_suspended_players ?? null)}`
    );
  }
}

main();
