import { describe, expect, it } from "vitest";
import {
  formatPairedStatValue,
  pairedStatDecimalPlaces,
} from "@/lib/prediction/format-paired-stat-values";

describe("format-paired-stat-values", () => {
  it("uses the higher precision across home and away", () => {
    expect(pairedStatDecimalPlaces(0.684, 0.68)).toBe(3);
    expect(formatPairedStatValue(0.684, 3)).toBe("0.684");
    expect(formatPairedStatValue(0.68, 3)).toBe("0.680");
  });

  it("keeps integers compact", () => {
    expect(pairedStatDecimalPlaces(1500, 1488)).toBe(0);
    expect(formatPairedStatValue(1500, 0)).toBe("1500");
  });
});
