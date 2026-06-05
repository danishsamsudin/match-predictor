import { describe, expect, it } from "vitest";
import {
  buildHubPredictRequestFromMatch,
  mapPredictionResultToHubRow,
} from "@/lib/world-cup/hub-main-predict";
import type { PredictionResult } from "@/lib/types/prediction";
import type { WcMatchRow } from "@/lib/world-cup/standings";

const germanyCuracao: WcMatchRow = {
  id: "wc-1",
  date: "2026-06-15",
  time: "18:00",
  group_code: "F",
  status: "scheduled",
  home_team_id: "de",
  away_team_id: "cw",
  home_team_name: "Germany",
  away_team_name: "Curaçao",
  venue_city: "Houston",
};

describe("buildHubPredictRequestFromMatch", () => {
  it("builds national compare request matching predictor prefill", () => {
    const req = buildHubPredictRequestFromMatch(germanyCuracao);
    expect(req).toMatchObject({
      mode: "compare",
      entityType: "national",
      homeLeagueId: 1,
      awayLeagueId: 1,
      homeTeamName: "Germany",
      awayTeamName: "Curaçao",
      city: "Houston",
      matchDate: "2026-06-15",
    });
    expect(req?.homeTeamId).toBe(4711);
    expect(req?.awayTeamId).toBe(55827);
  });

  it("returns null when team ids cannot be resolved", () => {
    expect(
      buildHubPredictRequestFromMatch({
        ...germanyCuracao,
        home_team_name: "Unknown Nation",
      })
    ).toBeNull();
  });
});

describe("mapPredictionResultToHubRow", () => {
  it("scales win probabilities to 0–1 and maps top score and over/under", () => {
    const result: PredictionResult = {
      modelVersion: "v2.1",
      homeWinPct: 72.5,
      drawPct: 15.2,
      awayWinPct: 12.3,
      expectedGoals: { home: 2.41, away: 0.62 },
      estimated: { corners: 9, fouls: 22, yellowCards: 3.2, redCards: 0.1 },
      explanation: "",
      analytics: {
        topScores: [{ home: 3, away: 0, probability: 18.4 }],
        scoreHeatmap: [],
        overUnder: [
          { line: 1.5, overPct: 80, underPct: 20 },
          { line: 2.5, overPct: 55, underPct: 45 },
          { line: 3.5, overPct: 30, underPct: 70 },
        ],
        btts: { yesPct: 42, noPct: 58 },
        totalGoalsDistribution: [],
        h2h: { homeWinPct: 50, drawPct: 25, awayWinPct: 25 },
        formScores: { homePct: 60, awayPct: 40 },
        momentumIndex: 0.12,
        modelImpact: [],
        statComparison: [],
      },
    };

    const row = mapPredictionResultToHubRow(result);
    expect(row).toMatchObject({
      home_win_pct: 0.725,
      draw_pct: 0.152,
      away_win_pct: 0.123,
      predicted_score_home: 3,
      predicted_score_away: 0,
      over_2_5_pct: 0.55,
      under_2_5_pct: 0.45,
      model_version: "v2.1",
    });
    expect(row?.snapshot.source).toBe("main-predict");
    expect(row?.snapshot.lambda).toBe(2.41);
    expect(row?.snapshot.btts_pct).toBe(42);
  });
});
