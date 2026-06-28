import { describe, expect, it } from "vitest";
import { applyTalentWeightDecay } from "@/lib/world-cup/graham-talent-decay";
import { GRAHAM_DELTA_WEIGHTS } from "@/lib/world-cup/graham-model-config";
import { getDefaultWcCalibrationConstants } from "@/lib/world-cup/wc-calibration-config";

describe("graham-talent-decay", () => {
  it("reduces talent weight as WC matches accumulate", () => {
    const cal = getDefaultWcCalibrationConstants();
    const early = applyTalentWeightDecay({ ...GRAHAM_DELTA_WEIGHTS }, 1, 1, cal);
    const late = applyTalentWeightDecay({ ...GRAHAM_DELTA_WEIGHTS }, 5, 4, cal);
    expect(late.effectiveTalentWeight).toBeLessThan(early.effectiveTalentWeight);
    expect(late.weights.xgElo).toBeGreaterThan(early.weights.xgElo);
  });

  it("respects talent weight floor", () => {
    const cal = getDefaultWcCalibrationConstants();
    const decayed = applyTalentWeightDecay({ ...GRAHAM_DELTA_WEIGHTS }, 20, 20, cal);
    expect(decayed.effectiveTalentWeight).toBeGreaterThanOrEqual(
      GRAHAM_DELTA_WEIGHTS.talent * cal.talentWeightFloor
    );
  });
});
