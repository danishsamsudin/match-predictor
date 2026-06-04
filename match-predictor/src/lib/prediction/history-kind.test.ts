import { describe, expect, it } from "vitest";
import {
  classifyStoredPrediction,
  kindMetaForStoredPrediction,
} from "@/lib/prediction/history-kind";
import { WORLD_CUP_REFERENCE_LEAGUE_ID } from "@/lib/data/world-cup-2026-teams";

describe("history-kind", () => {
  it("tags World Cup national fixtures", () => {
    expect(
      classifyStoredPrediction({
        entity_type: "national",
        comparison_mode: "fixture",
        home_league_id: WORLD_CUP_REFERENCE_LEAGUE_ID,
        away_league_id: WORLD_CUP_REFERENCE_LEAGUE_ID,
        home_team_id: 4781,
        away_team_id: 4736,
      })
    ).toBe("world_cup");
  });

  it("tags league compare mode", () => {
    expect(
      classifyStoredPrediction({
        entity_type: "club",
        comparison_mode: "compare",
        home_league_id: 39,
        away_league_id: 39,
        home_team_id: 33,
        away_team_id: 40,
      })
    ).toBe("league_compare");
  });

  it("uses league name on compare badge when leagues match", () => {
    const meta = kindMetaForStoredPrediction({
      entity_type: "club",
      comparison_mode: "compare",
      home_league_id: 39,
      away_league_id: 39,
      home_team_id: 33,
      away_team_id: 40,
    });
    expect(meta.label).toBe("Premier League");
  });
});
