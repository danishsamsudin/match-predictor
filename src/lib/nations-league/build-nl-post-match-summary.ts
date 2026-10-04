import type { SupabaseClient } from "@supabase/supabase-js";

export type NlPostMatchRunFacts = {
  articlesIngested: number;
  playerStatsIngested: number;
  playerStatsSkipped: number;
  scoresMarkedFinished: number;
  nationsRated: number;
  locksNew: number;
  locksRefreshed: number;
  locksFrozen: number;
  matchEvals: number;
  playerLines: number;
};

function pickFavored(home: number, draw: number, away: number): "home" | "draw" | "away" {
  if (home >= draw && home >= away) return "home";
  if (away >= draw && away >= home) return "away";
  return "draw";
}

function actualOutcome(home: number, away: number): "home" | "draw" | "away" {
  if (home > away) return "home";
  if (home < away) return "away";
  return "draw";
}

export async function buildNlPostMatchSummary(
  supabase: SupabaseClient,
  facts: NlPostMatchRunFacts
): Promise<string> {
  const { data: evals } = await supabase
    .from("nations_league_prediction_evaluations")
    .select("match_id, actual_score_home, actual_score_away, market_scores, computed_at")
    .order("computed_at", { ascending: false })
    .limit(40);

  const { data: preds } = await supabase
    .from("nations_league_predictions")
    .select("match_id, home_win_pct, draw_pct, away_win_pct");
  const predByMatch = new Map((preds ?? []).map((p) => [String(p.match_id), p]));

  const finished = (evals ?? []).slice(0, 8);
  let hits = 0;
  let brier = 0;
  for (const row of finished) {
    const pred = predByMatch.get(String(row.match_id));
    const ms = (row.market_scores ?? {}) as Record<string, unknown>;
    const home = Number(pred?.home_win_pct ?? (ms.predicted1x2 as { home?: number } | undefined)?.home ?? 0);
    const draw = Number(pred?.draw_pct ?? (ms.predicted1x2 as { draw?: number } | undefined)?.draw ?? 0);
    const away = Number(pred?.away_win_pct ?? (ms.predicted1x2 as { away?: number } | undefined)?.away ?? 0);
    if (pickFavored(home, draw, away) === actualOutcome(row.actual_score_home, row.actual_score_away)) {
      hits += 1;
    }
    brier += Number(ms.brier1x2 ?? 0);
  }

  const { data: props } = await supabase
    .from("nations_league_player_prop_evaluations")
    .select("market, predicted_prob, hit");
  const propSummary: Record<string, { n: number; pred: number; hit: number }> = {};
  for (const row of props ?? []) {
    const m = String(row.market);
    propSummary[m] ??= { n: 0, pred: 0, hit: 0 };
    propSummary[m].n += 1;
    propSummary[m].pred += Number(row.predicted_prob ?? 0);
    propSummary[m].hit += row.hit ? 1 : 0;
  }

  const { data: calibs } = await supabase
    .from("nations_league_calibration_config")
    .select("version, metrics, effective_from")
    .order("effective_from", { ascending: false })
    .limit(6);

  const latest = calibs?.[0];
  const learned: string[] = [];
  for (const row of calibs ?? []) {
    const note = String((row.metrics as { note?: string } | null)?.note ?? "");
    if (note && !learned.includes(note)) learned.push(note);
    if (learned.length >= 4) break;
  }

  const lines: string[] = [
    "",
    "=".repeat(60),
    "NATIONS LEAGUE POST-MATCH SUMMARY",
    "=".repeat(60),
    "",
    "What we processed",
    facts.articlesIngested
      ? `- Brought in ${facts.articlesIngested} new match report article(s).`
      : "- No new match report articles were added this run.",
    `- Brought in player statistics for ${facts.playerStatsIngested} new match(es); ${facts.playerStatsSkipped} were already stored.`,
    `- Marked ${facts.scoresMarkedFinished} match score(s) as finished.`,
    `- Updated team strength ratings for ${facts.nationsRated} nations.`,
    `- Refreshed upcoming match odds that have not kicked off yet: ${facts.locksNew} new, ${facts.locksRefreshed} updated.`,
    `- Left ${facts.locksFrozen} already-started or finished match line(s) frozen so we score what was published before kickoff.`,
    "",
    "How the match odds did recently",
  ];

  if (!finished.length) {
    lines.push(
      "- We do not yet have enough finished matches with a locked pre-kickoff line to judge home / draw / away accuracy."
    );
  } else {
    const avgBrier = brier / finished.length;
    lines.push(
      `- On the last ${finished.length} finished matches with locked odds, the model picked the correct home / draw / away result in ${hits} of ${finished.length}.`
    );
    lines.push(
      avgBrier < 0.45
        ? "- The probability quality on those matches looks reasonably sharp."
        : "- The probability quality on those matches is still mixed; treat big favourites carefully."
    );
  }

  const anytime = propSummary.anytime_scorer;
  const assist = propSummary.anytime_assist;
  const goalAssist = propSummary.goal_or_assist;
  const sot = propSummary["sot_0.5"];

  lines.push("", "How the player markets are doing");
  if (anytime) {
    lines.push(
      `- Anytime goalscorer: the model averaged ${(anytime.pred / anytime.n * 100).toFixed(1)}% chance versus ${(anytime.hit / anytime.n * 100).toFixed(1)}% of players actually scoring (${anytime.n} lines).`
    );
  }
  if (assist) {
    lines.push(
      `- Anytime assist: the model averaged ${(assist.pred / assist.n * 100).toFixed(1)}% chance versus ${(assist.hit / assist.n * 100).toFixed(1)}% of players actually assisting (${assist.n} lines).`
    );
  }
  if (goalAssist) {
    lines.push(
      `- Goal or assist: the model averaged ${(goalAssist.pred / goalAssist.n * 100).toFixed(1)}% chance versus ${(goalAssist.hit / goalAssist.n * 100).toFixed(1)}% actually hitting (${goalAssist.n} lines).`
    );
  }
  if (sot) {
    const predPct = (sot.pred / sot.n) * 100;
    const hitPct = (sot.hit / sot.n) * 100;
    const gap = predPct - hitPct;
    lines.push(
      `- Shots on target (at least one): the model averaged ${predPct.toFixed(1)}% versus ${hitPct.toFixed(1)}% actual (${sot.n} lines)${gap > 8 ? " - still a bit high, but this is the market we are pulling down." : "."}`
    );
  }
  if (!anytime && !sot) {
    lines.push("- No player-market results were available to summarise yet.");
  }

  lines.push("", "What the model learned this run");
  if (latest) {
    lines.push(`- Latest saved settings: ${String(latest.version)}.`);
  }
  if (learned.length) {
    for (const note of learned) {
      lines.push(`- ${note}`);
    }
  } else {
    lines.push(
      "- Settings were left as they were when a candidate update would have scored worse on the most recent test matches, or when there were not enough new finished matches."
    );
  }

  lines.push(
    "",
    "What to do with this",
    "- Compare the refreshed model odds on the Nations League hub to bookmaker prices.",
    "- The model is trained on real match outcomes, not on bookmaker prices. Where our chance is meaningfully higher than the bookmaker's implied chance, that is a candidate edge.",
    "- Do not treat shots-on-target prices as bet-ready until the gap between predicted and actual stays small.",
    "=".repeat(60)
  );

  return lines.join("\n");
}
