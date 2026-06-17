import { describe, expect, it } from "vitest";
import {
  enrichFormMatchesWithProcessMetrics,
  processMetricsSourceRank,
} from "@/lib/world-cup/enrich-form-process-metrics";
import type { InternationalFormMatch } from "@/lib/world-cup/load-international-form";
import type { NationalMatchProcessRow } from "@/lib/data/match-process-metrics";

describe("enrich-form-process-metrics", () => {
  const baseMatch: InternationalFormMatch = {
    date: "2022-11-20",
    home_team_id: "4713",
    away_team_id: "4819",
    home_goals: 2,
    away_goals: 1,
  };

  it("prefers opta_html over statsbomb for the same fixture date", () => {
    const statsbomb: NationalMatchProcessRow = {
      event_id: -9000001,
      source: "statsbomb",
      match_date: "2022-11-20",
      home_team_id: 4713,
      away_team_id: 4819,
      home_xg: 1.1,
      away_xg: 0.9,
      home_shots: 10,
      away_shots: 8,
      home_sot: 4,
      away_sot: 3,
      competition_tier: 1.12,
      payload: {
        process: {
          schema: "sb_process_v1",
          home: { xg_box: 0.5 },
          away: { xg_box: 0.3 },
        },
      },
    };
    const opta: NationalMatchProcessRow = {
      event_id: 999,
      source: "opta_html",
      match_date: "2022-11-20",
      home_team_id: 4713,
      away_team_id: 4819,
      home_xg: 1.4,
      away_xg: 1.0,
      home_shots: 12,
      away_shots: 9,
      home_sot: 5,
      away_sot: 4,
      competition_tier: 1.12,
      payload: { competition: "World Cup" },
    };

    const [merged] = enrichFormMatchesWithProcessMetrics([baseMatch], [statsbomb, opta]);
    expect(merged.home_xg).toBe(1.4);
    expect(merged.metricsSource).toBe("opta_html");
    expect(merged.processPayload).toBeNull();
  });

  it("merges statsbomb process payload when no higher-priority source", () => {
    const statsbomb: NationalMatchProcessRow = {
      event_id: -9000002,
      source: "statsbomb",
      match_date: "2022-11-20",
      home_team_id: 4713,
      away_team_id: 4819,
      home_xg: 1.1,
      away_xg: 0.9,
      home_shots: 10,
      away_shots: 8,
      home_sot: 4,
      away_sot: 3,
      competition_tier: 1.12,
      payload: {
        process: {
          schema: "sb_process_v1",
          home: { xg_set_piece: 0.2 },
          away: { pressure_events: 40 },
        },
      },
    };

    const [merged] = enrichFormMatchesWithProcessMetrics([baseMatch], [statsbomb]);
    expect(merged.home_sot).toBe(4);
    expect(merged.processPayload?.home?.xg_set_piece).toBe(0.2);
    expect(merged.metricsSource).toBe("statsbomb");
  });

  it("ranks sources as expected", () => {
    expect(processMetricsSourceRank("opta_html")).toBeGreaterThan(
      processMetricsSourceRank("statsbomb")
    );
    expect(processMetricsSourceRank("statsbomb")).toBeGreaterThan(
      processMetricsSourceRank("fbref")
    );
  });
});
