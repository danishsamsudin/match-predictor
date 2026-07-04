import { describe, expect, it } from "vitest";
import {
  buildPredictionTeamPairIndex,
  findKnockoutHubMatchForTeamPair,
  resolveHubMatchPredictionRaw,
} from "@/lib/world-cup/resolve-knockout-hub-match";

describe("findKnockoutHubMatchForTeamPair", () => {
  const teamNames = new Map([
    ["py-id", "Paraguay"],
    ["fr-id", "France"],
  ]);

  it("returns R16 fixture for Paraguay vs France on knockout date", () => {
    const fx = findKnockoutHubMatchForTeamPair({
      teamNames,
      homeTeamApiId: 4481,
      awayTeamApiId: 4789,
      matchDate: "2026-07-04",
    });
    expect(fx?.id).toBe("wc2026-ko-89");
    expect(fx?.home_team_name).toBe("Paraguay");
    expect(fx?.away_team_name).toBe("France");
  });
});

describe("resolveHubMatchPredictionRaw", () => {
  it("falls back to team-pair index when knockout id has no direct row", () => {
    const pred = {
      match_id: "group-stage-uuid",
      home_win_pct: 0.85,
      draw_pct: 0.1,
      away_win_pct: 0.05,
      snapshot: { home_team_api_id: 4789, away_team_api_id: 4481 },
    };
    const predByMatch = new Map<string, Record<string, unknown>>([
      ["group-stage-uuid", pred],
    ]);
    const pairIndex = buildPredictionTeamPairIndex(predByMatch);
    const raw = resolveHubMatchPredictionRaw(
      {
        id: "wc2026-ko-89",
        home_team_id: "py-id",
        away_team_id: "fr-id",
        home_team_name: "Paraguay",
        away_team_name: "France",
      },
      predByMatch,
      pairIndex
    );
    expect(raw).toEqual(pred);
  });
});
