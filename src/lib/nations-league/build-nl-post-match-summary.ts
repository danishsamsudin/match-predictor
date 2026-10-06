import type { SupabaseClient } from "@supabase/supabase-js";
import {
  mergeConfidenceLayer,
  type ConfidenceLayerConfig,
  type MarketConfidenceSnapshot,
} from "@/lib/nations-league/confidence-layer";

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

/** Normalize hub probs that may be stored as 0-1 fractions or 0-100 percents. */
function toUnitProb(home: number, draw: number, away: number): {
  home: number;
  draw: number;
  away: number;
} {
  const sum = home + draw + away;
  if (!(sum > 0) || !Number.isFinite(sum)) return { home: 0, draw: 0, away: 0 };
  if (sum > 1.5) return { home: home / 100, draw: draw / 100, away: away / 100 };
  return { home, draw, away };
}

export type Locked1x2EvalRow = {
  home: number;
  draw: number;
  away: number;
  actualHome: number;
  actualAway: number;
  brier1x2: number;
};

export type Locked1x2WindowStats = {
  n: number;
  hits: number;
  avgBrier: number;
  avgPredDraw: number;
  actualDrawRate: number;
};

/** Summary stats for a chronological slice of locked 1X2 evaluations (oldest → newest). */
export function summarizeLocked1x2Window(rows: Locked1x2EvalRow[]): Locked1x2WindowStats {
  if (!rows.length) {
    return { n: 0, hits: 0, avgBrier: 0, avgPredDraw: 0, actualDrawRate: 0 };
  }
  let hits = 0;
  let brier = 0;
  let predDraw = 0;
  let draws = 0;
  for (const row of rows) {
    const p = toUnitProb(row.home, row.draw, row.away);
    const fav = pickFavored(p.home, p.draw, p.away);
    const act = actualOutcome(row.actualHome, row.actualAway);
    if (fav === act) hits += 1;
    brier += Number.isFinite(row.brier1x2) ? row.brier1x2 : 0;
    predDraw += p.draw;
    if (act === "draw") draws += 1;
  }
  return {
    n: rows.length,
    hits,
    avgBrier: brier / rows.length,
    avgPredDraw: predDraw / rows.length,
    actualDrawRate: draws / rows.length,
  };
}

function format1x2WindowLine(label: string, stats: Locked1x2WindowStats): string {
  return `- ${label} (n=${stats.n}): picked correct home / draw / away in ${stats.hits} of ${stats.n}; avg Brier ${stats.avgBrier.toFixed(3)}.`;
}

function formatFloor(value: number | null): string {
  if (value == null) return "no Strong band yet";
  return `model ${(value * 100).toFixed(0)}%+`;
}

function friendlyMarketKey(key: string): string {
  return key.replace(/_/g, " ").replace(/:/g, " / ");
}

function layerFromConstants(raw: unknown): ConfidenceLayerConfig | null {
  const constants = raw as { confidenceLayer?: ConfidenceLayerConfig } | null;
  if (!constants?.confidenceLayer) return null;
  return mergeConfidenceLayer(constants.confidenceLayer);
}

function strongKeys(layer: ConfidenceLayerConfig | null): Set<string> {
  if (!layer) return new Set();
  return new Set(
    Object.values(layer.markets)
      .filter((m) => m.strongFloor != null)
      .map((m) => m.marketKey)
  );
}

function worstCalibrated(markets: MarketConfidenceSnapshot[], limit = 4): MarketConfidenceSnapshot[] {
  return [...markets]
    .filter((m) => m.n >= 8)
    .map((m) => {
      const highBins = m.bins.filter((b) => b.lo >= 0.5 && b.n >= 6);
      const gap = highBins.length
        ? Math.max(...highBins.map((b) => b.gap))
        : Math.max(0, ...m.bins.map((b) => b.gap));
      return { market: m, gap };
    })
    .filter((x) => x.gap > 0.12 && x.market.strongFloor == null)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, limit)
    .map((x) => x.market);
}

export async function buildNlPostMatchSummary(
  supabase: SupabaseClient,
  facts: NlPostMatchRunFacts
): Promise<string> {
  const { data: evals } = await supabase
    .from("nations_league_prediction_evaluations")
    .select("match_id, actual_score_home, actual_score_away, market_scores, computed_at")
    .order("computed_at", { ascending: false })
    .limit(200);

  const { data: preds } = await supabase
    .from("nations_league_predictions")
    .select("match_id, home_win_pct, draw_pct, away_win_pct");
  const predByMatch = new Map((preds ?? []).map((p) => [String(p.match_id), p]));

  // Newest-first unique match rows, then reverse to chronological for window slices.
  const seenMatch = new Set<string>();
  const lockedNewestFirst: Locked1x2EvalRow[] = [];
  for (const row of evals ?? []) {
    const id = String(row.match_id);
    if (seenMatch.has(id)) continue;
    seenMatch.add(id);
    const pred = predByMatch.get(id);
    const ms = (row.market_scores ?? {}) as Record<string, unknown>;
    const predicted = ms.predicted1x2 as { home?: number; draw?: number; away?: number } | undefined;
    lockedNewestFirst.push({
      home: Number(pred?.home_win_pct ?? predicted?.home ?? 0),
      draw: Number(pred?.draw_pct ?? predicted?.draw ?? 0),
      away: Number(pred?.away_win_pct ?? predicted?.away ?? 0),
      actualHome: Number(row.actual_score_home),
      actualAway: Number(row.actual_score_away),
      brier1x2: Number(ms.brier1x2 ?? 0),
    });
  }
  const lockedChronological = [...lockedNewestFirst].reverse();
  const window8 = summarizeLocked1x2Window(lockedChronological.slice(-8));
  const window24 = summarizeLocked1x2Window(lockedChronological.slice(-24));
  const windowAll = summarizeLocked1x2Window(lockedChronological);

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
    .select("version, metrics, constants, effective_from")
    .order("effective_from", { ascending: false })
    .limit(8);

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

  if (!windowAll.n) {
    lines.push(
      "- We do not yet have enough finished matches with a locked pre-kickoff line to judge home / draw / away accuracy."
    );
  } else {
    if (window8.n) lines.push(format1x2WindowLine("Last 8", window8));
    if (window24.n > window8.n) lines.push(format1x2WindowLine("Last 24", window24));
    if (windowAll.n > window24.n) {
      lines.push(format1x2WindowLine("All locked", windowAll));
    } else if (windowAll.n > window8.n && windowAll.n === window24.n) {
      lines.push(format1x2WindowLine("All locked", windowAll));
    }
    const drawGapPp = (windowAll.actualDrawRate - windowAll.avgPredDraw) * 100;
    lines.push(
      `- Draw calibration (all locked): model averaged ${(windowAll.avgPredDraw * 100).toFixed(1)}% draw versus ${(windowAll.actualDrawRate * 100).toFixed(1)}% actual draws (${drawGapPp >= 0 ? "+" : ""}${drawGapPp.toFixed(1)} pp gap).`
    );
    lines.push(
      window8.avgBrier < 0.45 && windowAll.avgBrier < 0.5
        ? "- Probability quality (Brier) looks reasonably sharp; still prefer longer windows over the last-8 pick rate."
        : "- Probability quality (Brier) is still mixed; treat big favourites carefully and prefer last-24 / all-locked over the last-8 pick rate."
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

  const confidenceLayers = (calibs ?? [])
    .map((row) => layerFromConstants(row.constants))
    .filter((layer): layer is ConfidenceLayerConfig => layer != null && layer.trainN > 0);
  const currentLayer = confidenceLayers[0] ?? null;
  const previousLayer = confidenceLayers[1] ?? null;

  lines.push("", "Confidence layer");
  if (!currentLayer) {
    lines.push(
      "- No confidence floors yet. After more finished matches with locked pre-kickoff lines, Strong / Moderate / Weak bands will appear here."
    );
  } else {
    const markets = Object.values(currentLayer.markets);
    const strong = markets.filter((m) => m.strongFloor != null);
    lines.push(
      `- Rebuilt on ${currentLayer.trainN} train and ${currentLayer.holdoutN} holdout lines across ${markets.length} markets.`
    );
    if (!strong.length) {
      lines.push("- No Strong bands yet - history is still too thin or the model is not calibrated enough to be a decision guardrail.");
    } else {
      const sample = [...strong]
        .sort((a, b) => (a.strongFloor ?? 1) - (b.strongFloor ?? 1))
        .slice(0, 8);
      for (const m of sample) {
        lines.push(
          `- ${friendlyMarketKey(m.marketKey)}: Strong from ${formatFloor(m.strongFloor)} (n=${m.n}).`
        );
      }
    }
    const gained = [...strongKeys(currentLayer)].filter((k) => !strongKeys(previousLayer).has(k));
    const lost = [...strongKeys(previousLayer)].filter((k) => !strongKeys(currentLayer).has(k));
    if (gained.length) {
      lines.push(`- Newly Strong this run: ${gained.slice(0, 6).map(friendlyMarketKey).join("; ")}.`);
    }
    if (lost.length) {
      lines.push(`- Lost Strong this run: ${lost.slice(0, 6).map(friendlyMarketKey).join("; ")}.`);
    }
    const avoid = worstCalibrated(markets);
    for (const m of avoid) {
      lines.push(
        `- Do not rely on ${friendlyMarketKey(m.marketKey)} yet (None / Weak) - predicted % has been running ahead of actual hits.`
      );
    }
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
    "- Use the confidence chip as the decision guardrail: only Strong (and carefully Moderate) bands have enough history to size a stake.",
    "- Stake suggestions use fractional Kelly gated by that confidence. Do not add exclusive outcomes on the same match together.",
    "- Do not treat shots-on-target prices as bet-ready until the gap between predicted and actual stays small.",
    "=".repeat(60)
  );

  return lines.join("\n");
}
