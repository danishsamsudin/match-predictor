import { describe, expect, it } from "vitest";
import { alignRecentMatchDisplay, namesNeedHomeAwaySwap } from "@/lib/world-cup/match-orientation";
import { swapHubCardPrediction } from "@/lib/world-cup/hub-prediction";

/** Mirrors alignUpcomingMatchForDisplay orientation logic for unit tests. */
function orientUpcomingCardFields(input: {
  date: string;
  home_team_name: string;
  away_team_name: string;
  home_fifa_rank: number | null;
  away_fifa_rank: number | null;
  card_prediction: Parameters<typeof swapHubCardPrediction>[0] | null;
}) {
  const aligned = alignRecentMatchDisplay({
    date: input.date,
    homeTeamName: input.home_team_name,
    awayTeamName: input.away_team_name,
    homeGoals: null,
    awayGoals: null,
    summary: null,
  });
  const orientationSwapped = namesNeedHomeAwaySwap(
    aligned.homeTeamName,
    aligned.awayTeamName,
    input.home_team_name,
    input.away_team_name
  );

  return {
    homeName: aligned.homeTeamName,
    awayName: aligned.awayTeamName,
    homeFifaRank: orientationSwapped ? input.away_fifa_rank : input.home_fifa_rank,
    awayFifaRank: orientationSwapped ? input.home_fifa_rank : input.away_fifa_rank,
    cardPrediction: orientationSwapped && input.card_prediction
      ? swapHubCardPrediction(input.card_prediction)
      : input.card_prediction,
  };
}

describe("upcoming hub card orientation", () => {
  it("keeps FIFA ranks with official home/away when DB orientation is reversed", () => {
    const card = {
      home_win_pct: 0.04,
      draw_pct: 0.1,
      away_win_pct: 0.86,
      fair_odds_home: 25,
      fair_odds_draw: 10,
      fair_odds_away: 1.16,
      under_2_5_pct: 0.3,
      over_2_5_pct: 0.7,
      predicted_score_home: 0,
      predicted_score_away: 2,
      snapshot: { lambda: 0.4, mu: 2.1 },
      computed_at: null,
      locked: false,
    };

    const oriented = orientUpcomingCardFields({
      date: "2026-06-16",
      home_team_name: "Senegal",
      away_team_name: "France",
      home_fifa_rank: 14,
      away_fifa_rank: 1,
      card_prediction: card,
    });

    expect(oriented.homeName).toBe("France");
    expect(oriented.awayName).toBe("Senegal");
    expect(oriented.homeFifaRank).toBe(1);
    expect(oriented.awayFifaRank).toBe(14);
    expect(oriented.cardPrediction?.home_win_pct).toBe(0.86);
    expect(oriented.cardPrediction?.away_win_pct).toBe(0.04);
    expect(oriented.cardPrediction?.predicted_score_home).toBe(2);
    expect(oriented.cardPrediction?.predicted_score_away).toBe(0);
  });

  it("leaves aligned fixtures unchanged", () => {
    const oriented = orientUpcomingCardFields({
      date: "2026-06-17",
      home_team_name: "England",
      away_team_name: "Croatia",
      home_fifa_rank: 11,
      away_fifa_rank: 4,
      card_prediction: null,
    });

    expect(oriented.homeName).toBe("England");
    expect(oriented.awayName).toBe("Croatia");
    expect(oriented.homeFifaRank).toBe(11);
    expect(oriented.awayFifaRank).toBe(4);
  });
});
