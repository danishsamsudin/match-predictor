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
