import { describe, expect, it } from "vitest";
import {
  buildHubPredictRequestFromMatch,
  mapPredictionResultToHubRow,
} from "@/lib/world-cup/hub-main-predict";
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
  it("is deprecated — hub uses Graham model directly", () => {
    expect(mapPredictionResultToHubRow()).toBeNull();
  });
});
