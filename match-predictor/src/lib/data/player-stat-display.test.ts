import { describe, expect, it } from "vitest";
import {
  buildPlayerDetailStats,
  findStatInRecord,
  statKeyLeaf,
} from "./player-stat-display";

const ZABARNYI_STATS: Record<string, number> = {
  "Shooting — Sh": 0.18,
  "Summary — Performance — Gls": 0.03,
  "Summary — Playing time — Min": 2583,
  "Summary — Playing time — MP": 34,
  "Passing — Total — Cmp": 66.5,
  "Defense — Tackles — TklW": 0.03,
  "Possesion — Take-ons — Att": 61.16,
};

describe("statKeyLeaf", () => {
  it("uses the rightmost header segment", () => {
    expect(statKeyLeaf("Summary — Performance — Gls")).toBe("Gls");
    expect(statKeyLeaf("Passing — Total — Cmp")).toBe("Cmp");
  });
});

describe("findStatInRecord", () => {
  it("does not treat Cmp as appearances (MP)", () => {
    expect(findStatInRecord(ZABARNYI_STATS, ["MP", "Apps"])).toBe(34);
    expect(findStatInRecord(ZABARNYI_STATS, ["Cmp"])).toBe(66.5);
  });

  it("maps FBref tackle columns by leaf name", () => {
    expect(findStatInRecord(ZABARNYI_STATS, ["Tkl", "TklW"])).toBe(0.03);
  });
});

describe("buildPlayerDetailStats", () => {
  it("fills Scoutlyst export fields for a defender", () => {
    const display = Object.fromEntries(
      buildPlayerDetailStats(ZABARNYI_STATS).map((s) => [s.label, s.value])
    );
    expect(display.Goals).toBe("0.03");
    expect(display.Shots).toBe("0.18");
    expect(display.Minutes).toBe("2583");
    expect(display.Appearances).toBe("34");
    expect(display.Passes).toBe("66.5");
    expect(display.Tackles).toBe("0.03");
    expect(display.Interceptions).toBe("—");
  });
});
