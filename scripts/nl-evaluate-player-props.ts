/**
 * Evaluate NL hub player props against ingested Opta player match stats.
 * Prefer locked snapshot.player_props; recompute when missing (bootstrap).
 *
 * Usage: npx tsx scripts/nl-evaluate-player-props.ts
 */
import { attachNlPlayerPropsToHubPrediction } from "../src/lib/nations-league/attach-nl-player-props";
import { tryCreateServiceClient } from "../src/lib/supabase";
import type { PlayerPropLine, PlayerPropsPayload } from "../src/lib/prediction/player-props";
import type { HubPredictionRow } from "../src/lib/world-cup/hub-main-predict";
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

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type PropSide = {
  teamExpectedGoals?: number;
  anytimeScorer?: PlayerPropLine[];
  anytimeCandidates?: PlayerPropLine[];
  shotsOnTarget?: Array<{
    playerName: string;
    line: number;
    probabilityPct: number;
    expectedSot: number;
  }>;
};

function resolveAnytimeLines(side: PropSide | undefined): PlayerPropLine[] {
  if (!side) return [];
  if (side.anytimeCandidates?.length) return side.anytimeCandidates;
  return side.anytimeScorer ?? [];
}

async function main() {
  loadEnvLocal();
  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const { data: finishedMatches, error: matchErr } = await supabase
    .from("matches")
    .select(
      "id, date, status, home_team_id, away_team_id, home_team_name, away_team_name, competition"
    )
    .eq("status", "finished")
    .ilike("competition", "%Nations League%");

  if (matchErr) throw new Error(matchErr.message);
  if (!finishedMatches?.length) {
    console.log("No finished Nations League matches to evaluate.");
    return;
  }

  // Fail fast with a clear migration hint if the eval table is missing.
  {
    const probe = await supabase
      .from("nations_league_player_prop_evaluations")
      .select("match_id")
      .limit(1);
    if (probe.error?.message?.includes("nations_league_player_prop_evaluations")) {
      console.error(
        "Missing table nations_league_player_prop_evaluations.\n" +
          "Apply migration: supabase/migrations/061_nations_league_player_prop_evaluations.sql"
      );
      process.exit(1);
    }
  }

  const matchIds = finishedMatches.map((m) => String(m.id));
  const { data: preds } = await supabase
    .from("nations_league_predictions")
    .select("match_id, model_version, snapshot, home_win_pct, draw_pct, away_win_pct, predicted_score_home, predicted_score_away, under_2_5_pct, over_2_5_pct")
    .in("match_id", matchIds);

  const predByMatch = new Map(
    (preds ?? []).map((p) => [String(p.match_id), p as Record<string, unknown>])
  );

  let evaluated = 0;
  let matchesUsed = 0;

  for (const match of finishedMatches as WcMatchRow[]) {
    const matchId = String(match.id);
    const { data: stats } = await supabase
      .from("nations_league_player_match_stats")
      .select("opta_player_id, player_name, team_api_id, stats")
      .eq("match_id", matchId);

    if (!stats?.length) continue;

    let props: PlayerPropsPayload | null = null;
    const pred = predByMatch.get(matchId);
    const snap = (pred?.snapshot as Record<string, unknown> | undefined) ?? {};
    const locked = snap.player_props as PlayerPropsPayload | undefined;
    if (locked?.home && locked?.away) {
      props = locked;
    } else if (pred) {
      const hubRow: HubPredictionRow = {
        home_win_pct: Number(pred.home_win_pct),
        draw_pct: Number(pred.draw_pct),
        away_win_pct: Number(pred.away_win_pct),
        predicted_score_home: Number(pred.predicted_score_home),
        predicted_score_away: Number(pred.predicted_score_away),
        under_2_5_pct: Number(pred.under_2_5_pct),
        over_2_5_pct: Number(pred.over_2_5_pct),
        model_version: String(pred.model_version ?? "nl"),
        snapshot: snap,
      };
      const enriched = await attachNlPlayerPropsToHubPrediction(match, hubRow);
      props = (enriched.snapshot.player_props as PlayerPropsPayload | undefined) ?? null;
      if (props) {
        await supabase
          .from("nations_league_predictions")
          .update({ snapshot: enriched.snapshot })
          .eq("match_id", matchId);
      }
    }

    if (!props) continue;
    matchesUsed += 1;

    const byNorm = new Map(
      stats.map((s) => [
        normalizeName(String(s.player_name)),
        {
          optaPlayerId: String(s.opta_player_id),
          teamApiId: Number(s.team_api_id),
          goals: Number((s.stats as Record<string, unknown>)?.goals ?? 0),
          sot: Number(
            (s.stats as Record<string, unknown>)?.shots_on_target ??
              (s.stats as Record<string, unknown>)?.SOnT ??
              0
          ),
        },
      ])
    );

    const sides = [
      { side: props.home as PropSide, teamApiId: props.home.teamId },
      { side: props.away as PropSide, teamApiId: props.away.teamId },
    ];

    for (const { side, teamApiId } of sides) {
      for (const line of resolveAnytimeLines(side)) {
        const actual = byNorm.get(normalizeName(line.playerName));
        if (!actual) continue;
        const { error } = await supabase.from("nations_league_player_prop_evaluations").upsert({
          match_id: matchId,
          opta_player_id: actual.optaPlayerId,
          player_name: line.playerName,
          team_api_id: teamApiId,
          market: "anytime_scorer",
          predicted_lambda: line.expectedGoals,
          predicted_prob: line.probabilityPct / 100,
          actual_count: actual.goals,
          hit: actual.goals >= 1,
          computed_at: new Date().toISOString(),
        });
        if (error) throw new Error(error.message);
        evaluated += 1;
      }

      for (const line of side.shotsOnTarget ?? []) {
        const actual = byNorm.get(normalizeName(line.playerName));
        if (!actual) continue;
        const { error } = await supabase.from("nations_league_player_prop_evaluations").upsert({
          match_id: matchId,
          opta_player_id: actual.optaPlayerId,
          player_name: line.playerName,
          team_api_id: teamApiId,
          market: `sot_${line.line}`,
          predicted_lambda: line.expectedSot,
          predicted_prob: line.probabilityPct / 100,
          actual_count: actual.sot,
          hit: actual.sot > line.line,
          computed_at: new Date().toISOString(),
        });
        if (error) throw new Error(error.message);
        evaluated += 1;
      }
    }
  }

  console.log(
    `Evaluated ${evaluated} NL player prop lines across ${matchesUsed} match(es).`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
