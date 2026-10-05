import type { ConfidenceEvalRow } from "@/lib/nations-league/confidence-layer";

type MarketEvalDbRow = {
  market_id?: string;
  marketId?: string;
  market_key?: string;
  marketKey?: string;
  predicted?: Record<string, unknown> | null;
  actual?: Record<string, unknown> | null;
  match_date?: string | null;
  matchDate?: string | null;
};

type PlayerPropDbRow = {
  market: string;
  predicted_prob: number | null;
  hit: boolean | null;
  match_date?: string | null;
};

function asFraction(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n > 1 ? n / 100 : n;
}

function push(
  out: ConfidenceEvalRow[],
  marketKey: string,
  prob: number | null,
  hit: boolean,
  matchDate?: string | null
) {
  if (prob == null || !Number.isFinite(prob)) return;
  out.push({
    marketKey,
    predictedProb: Math.max(0, Math.min(1, prob)),
    hit,
    matchDate: matchDate ?? null,
  });
}

export function extractMarketConfidenceRows(rows: MarketEvalDbRow[]): ConfidenceEvalRow[] {
  const out: ConfidenceEvalRow[] = [];
  for (const row of rows) {
    const marketId = String(row.market_id ?? row.marketId ?? "");
    const marketKey = String(row.market_key ?? row.marketKey ?? "");
    const predicted = (row.predicted ?? {}) as Record<string, unknown>;
    const actual = (row.actual ?? {}) as Record<string, unknown>;
    const matchDate = row.match_date ?? row.matchDate ?? null;

    if (marketId === "win_probability") {
      const outcome = String(actual.outcome ?? "");
      push(out, "win_probability:home", asFraction(predicted.home), outcome === "home", matchDate);
      push(out, "win_probability:draw", asFraction(predicted.draw), outcome === "draw", matchDate);
      push(out, "win_probability:away", asFraction(predicted.away), outcome === "away", matchDate);
      continue;
    }

    if (marketId === "btts") {
      const yes = Boolean(actual.yes);
      const pYes = asFraction(predicted.yesPct ?? predicted.prob);
      push(out, "btts:yes", pYes, yes, matchDate);
      push(out, "btts:no", pYes == null ? null : 1 - pYes, !yes, matchDate);
      continue;
    }

    if (marketId === "goals_over_under") {
      const line = predicted.line ?? marketKey;
      const over = Boolean(actual.over);
      const pOver = asFraction(predicted.overPct ?? predicted.prob);
      push(out, `goals_over_under:over_${line}`, pOver, over, matchDate);
      push(out, `goals_over_under:under_${line}`, pOver == null ? null : 1 - pOver, !over, matchDate);
      continue;
    }

    if (
      marketId === "double_chance" ||
      marketId === "goal_range_match" ||
      marketId === "goal_range_home" ||
      marketId === "goal_range_away" ||
      marketId === "european_handicap" ||
      marketId === "team_total"
    ) {
      const prob = asFraction(predicted.prob ?? predicted.yesPct ?? predicted.overPct);
      const hit = Boolean(actual.hit ?? actual.yes ?? actual.over);
      push(out, `${marketId}:${marketKey}`, prob, hit, matchDate);
    }
  }
  return out;
}

export function extractPlayerPropConfidenceRows(rows: PlayerPropDbRow[]): ConfidenceEvalRow[] {
  const out: ConfidenceEvalRow[] = [];
  for (const row of rows) {
    if (row.predicted_prob == null) continue;
    push(
      out,
      `player_prop:${row.market}`,
      Number(row.predicted_prob),
      Boolean(row.hit),
      row.match_date ?? null
    );
  }
  return out;
}
