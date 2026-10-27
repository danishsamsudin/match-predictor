import { describe, expect, it } from "vitest";
import { predictionMatchesCx } from "@/lib/glpm/home-card-sync";

describe("predictionMatchesCx", () => {
  it("accepts Spurs-Palace Oct 8 card numbers against that CX row", () => {
    const detail = predictionMatchesCx(
      {
        homeWin: 0.420432,
        draw: 0.264422,
        awayWin: 0.315146,
        homeXg: 1.2879,
        awayXg: 1.0602,
        over25: 0.412292465254318,
        bttsYes: 0.445432,
      },
      {
        home_win_pct: 0.420432,
        draw_pct: 0.264422,
        away_win_pct: 0.315146,
        home_xg: 1.2879,
        away_xg: 1.0602,
        btts_yes_pct: 0.445432,
        over_under: { "2.5": { over: 0.412292465254318 } },
      }
    );
    expect(detail).toBeNull();
  });

  it("flags stale hub markets vs a fresher CX row", () => {
    const detail = predictionMatchesCx(
      {
        homeWin: 0.420432,
        draw: 0.264422,
        awayWin: 0.315146,
        homeXg: 1.2879,
        awayXg: 1.0602,
        over25: 0.4123,
        bttsYes: 0.4454,
      },
      {
        home_win_pct: 0.373644,
        draw_pct: 0.250091,
        away_win_pct: 0.376265,
        home_xg: 1.2894,
        away_xg: 1.2953,
        btts_yes_pct: 0.455025,
        over_under: { "2.5": { over: 0.4703694769553204 } },
      }
    );
    expect(detail).toContain("homeWin");
    expect(detail).toContain("awayXg");
  });
});
