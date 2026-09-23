import { describe, expect, it } from "vitest";
import {
  congestionRotationIndex,
  filterMatchesInSameWindow,
  restDaysInWindow,
} from "@/lib/nations-league/nl-competition-window";
import { NL_CALIBRATION_DEFAULTS } from "@/lib/nations-league/nl-calibration-config";
import {
  NL_GRAHAM_MODEL_VERSION,
  NL_GRAHAM_MU_XG,
  NL_TALENT_DECAY_PER_MATCH,
} from "@/lib/nations-league/nl-graham-model-config";
import { applyTalentWeightDecay } from "@/lib/world-cup/graham-talent-decay";
import type { WcMatchRow } from "@/lib/world-cup/standings";

function match(
  partial: Partial<WcMatchRow> & Pick<WcMatchRow, "id" | "date" | "home_team_id" | "away_team_id">
): WcMatchRow {
  return {
    group_code: "A1",
    status: "finished",
    home_goals: 1,
    away_goals: 0,
    competition: "UEFA Nations League 2026/27",
    time: null,
    ...partial,
  };
}

describe("NL competition window", () => {
  const ned = "4705";
  const nedApi = 4705;

  const sepOctCluster: WcMatchRow[] = [
    match({
      id: "md1",
      date: "2026-09-24",
      home_team_id: ned,
      away_team_id: "4711",
      home_team_name: "Netherlands",
      away_team_name: "Germany",
    }),
    match({
      id: "md2",
      date: "2026-09-27",
      home_team_id: "4713",
      away_team_id: ned,
      home_team_name: "Serbia",
      away_team_name: "Netherlands",
    }),
    match({
      id: "md3",
      date: "2026-10-01",
      home_team_id: "4475",
      away_team_id: ned,
      home_team_name: "Greece",
      away_team_name: "Netherlands",
    }),
    match({
      id: "md4",
      date: "2026-10-04",
      home_team_id: ned,
      away_team_id: "4713",
      home_team_name: "Netherlands",
      away_team_name: "Serbia",
    }),
  ];

  it("includes prior matches in the Sep–Oct cluster for MD4", () => {
    const window = filterMatchesInSameWindow(sepOctCluster, ned, nedApi, "2026-10-04", {
      teamName: "Netherlands",
    });
    expect(window.map((m) => m.id)).toEqual(["md1", "md2", "md3"]);
  });

  it("resets across the Oct → Nov gap", () => {
    const withNovGap = [
      ...sepOctCluster,
      match({
        id: "md5",
        date: "2026-11-13",
        home_team_id: ned,
        away_team_id: "4475",
        home_team_name: "Netherlands",
        away_team_name: "Greece",
      }),
    ];
    const window = filterMatchesInSameWindow(withNovGap, ned, nedApi, "2026-11-13", {
      teamName: "Netherlands",
    });
    expect(window).toHaveLength(0);
  });

  it("flags short turnaround as congestion rotation", () => {
    const window = filterMatchesInSameWindow(sepOctCluster, ned, nedApi, "2026-09-27", {
      teamName: "Netherlands",
    });
    const rest = restDaysInWindow(window, "2026-09-27");
    expect(rest).toBe(3);
    expect(congestionRotationIndex(rest)).toBeGreaterThan(0.2);
  });

  it("does not flag long rest as congestion", () => {
    expect(congestionRotationIndex(10)).toBe(0);
    expect(congestionRotationIndex(null)).toBe(0);
  });
});

describe("NL calibration defaults (window-aware)", () => {
  it("wires NL mu and within-window talent decay", () => {
    expect(NL_CALIBRATION_DEFAULTS.muXg).toBe(NL_GRAHAM_MU_XG);
    expect(NL_CALIBRATION_DEFAULTS.talentDecayPerMatch).toBe(NL_TALENT_DECAY_PER_MATCH);
    expect(NL_CALIBRATION_DEFAULTS.talentDecayPerMatch).toBeGreaterThan(0);
    expect(NL_CALIBRATION_DEFAULTS.modelVersion).toBe(NL_GRAHAM_MODEL_VERSION);
  });

  it("decays talent weight as window matchCount rises", () => {
    const base = NL_CALIBRATION_DEFAULTS.deltaWeights;
    const after3 = applyTalentWeightDecay(base, 3, 2, NL_CALIBRATION_DEFAULTS);
    expect(after3.effectiveTalentWeight).toBeLessThan(base.talent);
    const freshWindow = applyTalentWeightDecay(base, 0, 0, NL_CALIBRATION_DEFAULTS);
    expect(freshWindow.effectiveTalentWeight).toBe(base.talent);
  });
});
