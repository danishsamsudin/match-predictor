import { describe, expect, it } from "vitest";
import {
  applySetPieceXgAdjustment,
  computeSetPieceMultiplier,
} from "@/lib/world-cup/graham-set-piece-adjustment";
import { getDefaultWcCalibrationConstants } from "@/lib/world-cup/wc-calibration-config";

describe("graham-set-piece-adjustment", () => {
  const cal = getDefaultWcCalibrationConstants();

  it("applies bilateral multiplicative bumps when both teams exceed threshold", () => {
    const result = applySetPieceXgAdjustment({
      homeXg: 1.2,
      awayXg: 1.0,
      home: {
        teamId: 1,
        processSetPieceShare: 0.5,
        opponentDefensiveSolidity: 1.2,
        opponentSetPieceShare: 0.45,
      },
      away: {
        teamId: 2,
        processSetPieceShare: 0.48,
        opponentDefensiveSolidity: 1.4,
        opponentSetPieceShare: 0.5,
      },
      calibration: cal,
    });
    expect(result.homeMult).toBeGreaterThan(1);
    expect(result.awayMult).toBeGreaterThan(1);
    expect(result.homeXg).toBeGreaterThan(1.2);
    expect(result.awayXg).toBeGreaterThan(1.0);
  });

  it("scales multiplicatively so weak attacks get smaller absolute lift than strong", () => {
    const weakMult = computeSetPieceMultiplier(0.5, 0.6, cal);
    const strongBase = 2.4;
    const weakLift = 0.8 * weakMult - 0.8;
    const strongLift = strongBase * weakMult - strongBase;
    expect(strongLift).toBeGreaterThan(weakLift);
  });

  it("returns unity when share is below threshold", () => {
    const mult = computeSetPieceMultiplier(0.2, 0.8, cal);
    expect(mult).toBe(1);
  });
});
