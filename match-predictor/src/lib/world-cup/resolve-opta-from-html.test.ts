import { describe, expect, it } from "vitest";
import {
  clearOptaResultIndexCache,
  findOptaResultRecord,
} from "@/lib/world-cup/resolve-opta-from-html";

describe("resolve-opta-from-html", () => {
  it("finds Germany vs Curaçao from scores manifest", () => {
    clearOptaResultIndexCache();
    const parsed = findOptaResultRecord({
      date: "2026-06-14",
      homeName: "Curaçao",
      awayName: "Germany",
    });
    expect(parsed?.optaHome).toBe("Germany");
    expect(parsed?.optaAway).toBe("Curaçao");
    expect(parsed?.homeGoals).toBe(7);
    expect(parsed?.awayGoals).toBe(1);
  });

  it("finds United States vs Paraguay from scores manifest", () => {
    clearOptaResultIndexCache();
    const parsed = findOptaResultRecord({
      date: "2026-06-12",
      homeName: "Paraguay",
      awayName: "United States",
    });
    expect(parsed?.optaHome).toBe("USA");
    expect(parsed?.optaAway).toBe("Paraguay");
    expect(parsed?.homeGoals).toBe(4);
    expect(parsed?.awayGoals).toBe(1);
  });
});
