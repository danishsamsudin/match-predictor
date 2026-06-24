import { describe, expect, it } from "vitest";
import {
  diffCalibrationConstants,
  explainParamChange,
} from "@/lib/world-cup/post-match-param-explanations";
import { getDefaultWcCalibrationConstants } from "@/lib/world-cup/wc-calibration-config";

describe("post-match param explanations", () => {
  it("detects muXg change", () => {
    const base = getDefaultWcCalibrationConstants();
    const tweaked = { ...base, muXg: base.muXg * 1.05 };
    const changes = diffCalibrationConstants(
      base as unknown as Record<string, unknown>,
      tweaked as unknown as Record<string, unknown>
    );
    expect(changes.some((c) => c.key === "muXg")).toBe(true);
    const mu = changes.find((c) => c.key === "muXg")!;
    expect(explainParamChange(mu)).toContain("Baseline goals");
    expect(explainParamChange(mu)).toContain("higher expected goal");
  });

  it("ignores tiny deltas", () => {
    const base = getDefaultWcCalibrationConstants();
    const tweaked = { ...base, muXg: base.muXg * 1.0001 };
    const changes = diffCalibrationConstants(
      base as unknown as Record<string, unknown>,
      tweaked as unknown as Record<string, unknown>
    );
    expect(changes).toHaveLength(0);
  });
});
