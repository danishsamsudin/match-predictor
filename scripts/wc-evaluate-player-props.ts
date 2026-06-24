/**
 * Evaluate saved model-squad player props against ingested Opta stats.
 *
 * Usage: npx tsx scripts/wc-evaluate-player-props.ts
 */
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

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function main() {
  loadEnvLocal();
  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const wcClient = supabase as unknown as {
    from: (table: string) => {
      select: (cols: string) => Promise<{
        data: Array<Record<string, unknown>> | null;
        error: { message: string } | null;
      }>;
      upsert: (row: unknown) => Promise<{ error: { message: string } | null }>;
    };
  };

  const { data: preds, error } = await wcClient
    .from("world_cup_model_squad_predictions")
    .select("match_id, player_props, home_team_api_id, away_team_api_id");

  if (error) throw new Error(error.message);
  if (!preds?.length) {
    console.log("No model squad predictions to evaluate.");
    return;
  }

  let evaluated = 0;

  for (const row of preds) {
    const matchId = String(row.match_id);
    const props = row.player_props as {
      home?: { anytimeScorer?: Array<{ playerName: string; probabilityPct: number; expectedGoals: number }>; shotsOnTarget?: Array<{ playerName: string; line: number; probabilityPct: number; expectedSot: number }> };
      away?: { anytimeScorer?: Array<{ playerName: string; probabilityPct: number; expectedGoals: number }>; shotsOnTarget?: Array<{ playerName: string; line: number; probabilityPct: number; expectedSot: number }> };
    } | null;
    if (!props) continue;

    const { data: stats } = await supabase
      .from("world_cup_player_match_stats")
      .select("opta_player_id, player_name, team_api_id, stats")
      .eq("match_id", matchId);

    if (!stats?.length) continue;

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
      { side: props.home, teamApiId: Number(row.home_team_api_id) },
      { side: props.away, teamApiId: Number(row.away_team_api_id) },
    ];

    for (const { side, teamApiId } of sides) {
      if (!side) continue;
      for (const line of side.anytimeScorer ?? []) {
        const actual = byNorm.get(normalizeName(line.playerName));
        if (!actual) continue;
        await wcClient.from("world_cup_player_prop_evaluations").upsert({
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
        evaluated += 1;
      }
      for (const line of side.shotsOnTarget ?? []) {
        const actual = byNorm.get(normalizeName(line.playerName));
        if (!actual) continue;
        const market = `sot_${line.line}`;
        await wcClient.from("world_cup_player_prop_evaluations").upsert({
          match_id: matchId,
          opta_player_id: actual.optaPlayerId,
          player_name: line.playerName,
          team_api_id: teamApiId,
          market,
          predicted_lambda: line.expectedSot,
          predicted_prob: line.probabilityPct / 100,
          actual_count: actual.sot,
          hit: actual.sot > line.line,
          computed_at: new Date().toISOString(),
        });
        evaluated += 1;
      }
    }
  }

  console.log(`Evaluated ${evaluated} player prop lines.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
