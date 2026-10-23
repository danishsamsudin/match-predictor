import { describe, expect, it } from "vitest";
import { applyCxToXg } from "./apply-cx";

describe("applyCxToXg mean-preserve", () => {
  it("preserves total expected goals when context dampens both sides", () => {
    const baseHome = 1.4;
    const baseAway = 1.1;
    const result = applyCxToXg({
      homeXg: baseHome,
      awayXg: baseAway,
      home: {
        restDays: 2,
        travelKm: 0,
        weatherMult: 0.96,
        lineupMult: 1,
      },
      away: {
        restDays: 2,
        travelKm: 800,
        weatherMult: 0.96,
        lineupMult: 1,
      },
    });
    const baseTotal = baseHome + baseAway;
    const cxTotal = result.homeXg + result.awayXg;
    expect(Math.abs(cxTotal - baseTotal)).toBeLessThan(1e-6);
    // Share should still favor home after dampers + renormalize.
    expect(result.homeXg).toBeGreaterThan(result.awayXg);
  });
});
