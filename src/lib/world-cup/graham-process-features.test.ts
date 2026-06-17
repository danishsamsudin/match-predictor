import { describe, expect, it } from "vitest";
import {
  computeProcessFeatureDiffs,
  computeTeamProcessProfile,
} from "@/lib/world-cup/graham-process-features";
import type { InternationalFormMatch } from "@/lib/world-cup/load-international-form";

describe("graham-process-features", () => {
  const homeId = "4713";
  const awayId = "4819";

  const homeHeavy: InternationalFormMatch = {
    date: "2024-06-01",
    home_team_id: homeId,
    away_team_id: awayId,
    home_goals: 3,
    away_goals: 0,
    home_xg: 2.5,
    away_xg: 0.4,
    home_shots: 15,
    away_shots: 5,
    processPayload: {
      schema: "sb_process_v1",
      home: {
        xg_open_play: 2.0,
        xg_set_piece: 0.5,
        xg_box: 1.8,
        goals_minus_xg: 0.5,
        pressure_events: 50,
        defensive_actions: 20,
      },
      away: {
        xg_open_play: 0.4,
        xg_set_piece: 0,
        xg_box: 0.1,
        goals_minus_xg: -0.4,
        pressure_events: 30,
        defensive_actions: 35,
      },
    },
  };

  it("computes higher chance quality for dominant home team", () => {
    const homeProfile = computeTeamProcessProfile(homeId, [homeHeavy]);
    const awayProfile = computeTeamProcessProfile(awayId, [homeHeavy]);
    expect(homeProfile.chanceQuality).toBeGreaterThan(awayProfile.chanceQuality);
    expect(homeProfile.sampleWeight).toBeGreaterThan(0);
  });

  it("returns finite process feature diffs", () => {
    const diffs = computeProcessFeatureDiffs(homeId, awayId, [homeHeavy], [homeHeavy]);
    expect(Number.isFinite(diffs.chance_quality_diff)).toBe(true);
    expect(Number.isFinite(diffs.finishing_skill_diff)).toBe(true);
    expect(diffs.chance_quality_diff).toBeGreaterThan(0);
  });

  it("shrinks finishing skill toward zero with few shots", () => {
    const sparse: InternationalFormMatch = {
      ...homeHeavy,
      home_shots: 2,
      home_goals: 2,
      home_xg: 0.2,
      processPayload: {
        home: { goals_minus_xg: 1.8 },
        away: {},
      },
    };
    const profile = computeTeamProcessProfile(homeId, [sparse]);
    expect(Math.abs(profile.finishingSkill)).toBeLessThan(1.8);
  });
});
