/**
 * Score finished GLPM home-league matches against locked CX predictions.
 *
 * Usage: npx tsx scripts/glpm-evaluate-markets.ts
 */
import { evaluateFromCxHistoryRow } from "../src/lib/glpm/evaluate-markets";
import { DEFAULT_GLPM_LEAGUE_IDS } from "../src/lib/sportmonks/constants";
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

  const { data: matches, error: matchErr } = await supabase
    .from("glpm_matches")
    .select("sm_id,league_sm_id,home_score,away_score,match_date,kickoff_at")
    .in("league_sm_id", DEFAULT_GLPM_LEAGUE_IDS)
    .not("home_score", "is", null)
    .not("away_score", "is", null)
    .order("kickoff_at", { ascending: false })
    .limit(800);
  if (matchErr) throw new Error(matchErr.message);

  let upserted = 0;
  let scoredMatches = 0;
  let skippedNoPred = 0;

  for (const m of matches ?? []) {
    const matchSmId = Number(m.sm_id);
    const leagueSmId = Number(m.league_sm_id);
    if (!Number.isFinite(matchSmId) || !Number.isFinite(leagueSmId)) continue;
    if (m.home_score == null || m.away_score == null) continue;

    const { data: hist } = await supabase
      .from("glpm_cx_prediction_history")
      .select(
        "home_win_pct,draw_pct,away_win_pct,btts_yes_pct,btts_no_pct,over_under,score_matrix,breakdown,model_version,executed_at"
      )
      .eq("match_sm_id", matchSmId)
      .order("executed_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!hist) {
      skippedNoPred += 1;
      continue;
    }

    const { data: teamStats } = await supabase
      .from("glpm_match_team_stats")
      .select("is_home,shots,shots_on_target")
      .eq("match_sm_id", matchSmId);

    let actualTotalShots: number | null = null;
    let actualTotalSot: number | null = null;
    if (teamStats?.length) {
      let shots = 0;
      let sot = 0;
      let hasShots = false;
      let hasSot = false;
      for (const row of teamStats) {
        if (row.shots != null) {
          shots += Number(row.shots);
          hasShots = true;
        }
        if (row.shots_on_target != null) {
          sot += Number(row.shots_on_target);
          hasSot = true;
        }
      }
      actualTotalShots = hasShots ? shots : null;
      actualTotalSot = hasSot ? sot : null;
    }

    const rows = evaluateFromCxHistoryRow({
      matchSmId,
      leagueSmId,
      matchDate: m.match_date ?? null,
      history: hist,
      actualHome: Number(m.home_score),
      actualAway: Number(m.away_score),
      actualTotalShots,
      actualTotalSot,
    });
    if (!rows?.length) continue;

    scoredMatches += 1;
    const now = new Date().toISOString();
    for (const row of rows) {
      const { error: upsertErr } = await supabase.from("glpm_market_evaluations").upsert(
        {
          match_sm_id: row.matchSmId,
          league_sm_id: row.leagueSmId,
          market_id: row.marketId,
          market_key: row.marketKey,
          predicted: row.predicted,
          actual: row.actual,
          loss_metric: row.lossMetric,
          loss_value: row.lossValue,
          model_version: row.modelVersion,
          match_date: row.matchDate,
          computed_at: now,
        },
        { onConflict: "match_sm_id,market_id,market_key" }
      );
      if (!upsertErr) upserted += 1;
    }
  }

  console.log(
    `GLPM market eval: scored ${scoredMatches} matches, upserted ${upserted} lines (skipped ${skippedNoPred} without locked CX pred).`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
