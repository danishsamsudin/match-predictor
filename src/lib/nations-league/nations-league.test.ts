import { describe, expect, it } from "vitest";
import {
  isNationsLeague2026TeamId,
  NATIONS_LEAGUE_2026_TEAMS,
} from "@/lib/data/nations-league-2026-teams";
import {
  buildNlTeamIdToGroupMap,
  loadNlGroupDraw,
} from "@/lib/nations-league/group-draw";
import {
  nlCompetitionTierWeight,
  nlCycleWeight,
  nlFormSampleWeight,
} from "@/lib/nations-league/nl-graham-model-config";
import { resolveApiTeamId } from "@/lib/world-cup/resolve-api-team-id";
import { TOURNAMENT_NAV_ITEMS, TOURNAMENT_REGISTRY } from "@/lib/tournaments/registry";

describe("Nations League catalog", () => {
  it("has 54 unique Sofascore team ids", () => {
    const ids = new Set(NATIONS_LEAGUE_2026_TEAMS.map((t) => t.id));
    expect(ids.size).toBe(54);
    expect(NATIONS_LEAGUE_2026_TEAMS).toHaveLength(54);
  });

  it("resolves api team ids for NL and WC nations", () => {
    expect(resolveApiTeamId("0", "France")).toBe(4481);
    expect(resolveApiTeamId("0", "Kosovo")).toBe(154426);
    expect(resolveApiTeamId("0", "Gibraltar")).toBe(129264);
    expect(resolveApiTeamId("0", "Argentina")).toBe(4819);
    expect(isNationsLeague2026TeamId(4481)).toBe(true);
  });

  it("loads 2026/27 draw with all groups", () => {
    const draw = loadNlGroupDraw();
    expect(Object.keys(draw).sort()).toEqual([
      "A1",
      "A2",
      "A3",
      "A4",
      "B1",
      "B2",
      "B3",
      "B4",
      "C1",
      "C2",
      "C3",
      "C4",
      "D1",
      "D2",
    ]);
    const map = buildNlTeamIdToGroupMap(draw);
    expect(map.get(4481)).toBe("A1"); // France
    expect(map.get(129264)).toBe("D1"); // Gibraltar
  });
});

describe("NL form weights", () => {
  it("weights current NL cycle higher than 2024/25", () => {
    const current = nlCycleWeight("UEFA Nations League", "2026-10-01");
    const prior = nlCycleWeight("UEFA Nations League", "2024-10-01");
    const older = nlCycleWeight("UEFA Nations League", "2022-10-01");
    expect(current).toBe(1);
    expect(prior).toBe(0.55);
    expect(older).toBe(0.3);
  });

  it("down-weights friendlies vs NL league phase", () => {
    expect(nlCompetitionTierWeight("International Friendly")).toBeLessThan(
      nlCompetitionTierWeight("UEFA Nations League")
    );
  });

  it("produces positive sample weights", () => {
    const w = nlFormSampleWeight("UEFA Nations League", "2024-11-15");
    expect(w).toBeGreaterThan(0);
    expect(w).toBeLessThan(1.2);
  });
});

describe("tournament registry", () => {
  it("exposes both tournaments for nav", () => {
    expect(TOURNAMENT_REGISTRY["nations-league-2026"].modelVersion).toBe("nl-graham-v1.1");
    expect(TOURNAMENT_NAV_ITEMS.map((t) => t.href)).toContain("/nations-league");
    expect(TOURNAMENT_NAV_ITEMS.map((t) => t.href)).toContain("/world-cup");
  });
});
