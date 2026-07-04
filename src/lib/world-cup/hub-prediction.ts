import type { MatchPhase } from "@/lib/world-cup/match-kickoff";

export type HubCardPrediction = {
  home_win_pct: number;
  draw_pct: number;
  away_win_pct: number;
  fair_odds_home: number;
  fair_odds_draw: number;
  fair_odds_away: number;
  under_2_5_pct: number;
  over_2_5_pct: number;
  predicted_score_home: number;
  predicted_score_away: number;
  snapshot: Record<string, unknown>;
  computed_at: string | null;
  locked: boolean;
};

/** Mirror home/away prediction fields when fixture orientation is reversed. */
export function swapHubCardPrediction(pred: HubCardPrediction): HubCardPrediction {
  const snapshot = { ...pred.snapshot };
  if (snapshot.lambda != null && snapshot.mu != null) {
    const lambda = Number(snapshot.lambda);
    const mu = Number(snapshot.mu);
    if (Number.isFinite(lambda) && Number.isFinite(mu)) {
      snapshot.lambda = mu;
      snapshot.mu = lambda;
    }
  }
  if (snapshot.home_xg != null && snapshot.away_xg != null) {
    const homeXg = Number(snapshot.home_xg);
    const awayXg = Number(snapshot.away_xg);
    if (Number.isFinite(homeXg) && Number.isFinite(awayXg)) {
      snapshot.home_xg = awayXg;
      snapshot.away_xg = homeXg;
    }
  }
  if (snapshot.display_home_xg != null && snapshot.display_away_xg != null) {
    const homeXg = Number(snapshot.display_home_xg);
    const awayXg = Number(snapshot.display_away_xg);
    if (Number.isFinite(homeXg) && Number.isFinite(awayXg)) {
      snapshot.display_home_xg = awayXg;
      snapshot.display_away_xg = homeXg;
    }
  }
  if (snapshot.structural_home_xg != null && snapshot.structural_away_xg != null) {
    const homeXg = Number(snapshot.structural_home_xg);
    const awayXg = Number(snapshot.structural_away_xg);
    if (Number.isFinite(homeXg) && Number.isFinite(awayXg)) {
      snapshot.structural_home_xg = awayXg;
      snapshot.structural_away_xg = homeXg;
    }
  }

  return {
    ...pred,
    home_win_pct: pred.away_win_pct,
    draw_pct: pred.draw_pct,
    away_win_pct: pred.home_win_pct,
    fair_odds_home: pred.fair_odds_away,
    fair_odds_draw: pred.fair_odds_draw,
    fair_odds_away: pred.fair_odds_home,
    predicted_score_home: pred.predicted_score_away,
    predicted_score_away: pred.predicted_score_home,
    snapshot,
  };
}

export function parseHubPrediction(
  raw: Record<string, unknown> | null | undefined,
  phase: MatchPhase
): HubCardPrediction | null {
  if (!raw) return null;
  const home = Number(raw.home_win_pct);
  const draw = Number(raw.draw_pct);
  const away = Number(raw.away_win_pct);
  if (![home, draw, away].every((n) => Number.isFinite(n))) return null;

  return {
    home_win_pct: home,
    draw_pct: draw,
    away_win_pct: away,
    fair_odds_home: Number(raw.fair_odds_home),
    fair_odds_draw: Number(raw.fair_odds_draw),
    fair_odds_away: Number(raw.fair_odds_away),
    under_2_5_pct: Number(raw.under_2_5_pct),
    over_2_5_pct: Number(raw.over_2_5_pct),
    predicted_score_home: Number(raw.predicted_score_home),
    predicted_score_away: Number(raw.predicted_score_away),
    snapshot: (raw.snapshot as Record<string, unknown>) ?? {},
    computed_at: (raw.computed_at as string) ?? null,
    locked: phase !== "pre",
  };
}
