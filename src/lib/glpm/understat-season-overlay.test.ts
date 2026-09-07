import { describe, expect, it } from "vitest";
import {
  seasonRatingOverlayAvailable,
  standingsSeasonOverlayAvailable,
  understatSeasonOverlayAvailable,
  UNDERSTAT_SEASON_OVERLAY_IDS,
  STANDINGS_SEASON_OVERLAY_IDS,
} from "./understat-season-overlay";
import { SM_SEASON_2025_26, SM_SEASON_2026_27 } from "@/lib/sportmonks/constants";

describe("season rating overlays", () => {
  it("covers Understat Big-3 seasons for 25/26 and 26/27", () => {
    expect(UNDERSTAT_SEASON_OVERLAY_IDS.has(SM_SEASON_2025_26.PREMIER_LEAGUE)).toBe(
      true
    );
    expect(UNDERSTAT_SEASON_OVERLAY_IDS.has(SM_SEASON_2025_26.SERIE_A)).toBe(true);
    expect(UNDERSTAT_SEASON_OVERLAY_IDS.has(SM_SEASON_2025_26.BUNDESLIGA)).toBe(
      true
    );
    expect(UNDERSTAT_SEASON_OVERLAY_IDS.has(SM_SEASON_2026_27.PREMIER_LEAGUE)).toBe(
      true
    );
  });

  it("covers standings overlays for Championship and Eredivisie", () => {
    expect(STANDINGS_SEASON_OVERLAY_IDS.has(SM_SEASON_2025_26.CHAMPIONSHIP)).toBe(
      true
    );
    expect(STANDINGS_SEASON_OVERLAY_IDS.has(SM_SEASON_2025_26.EREDIVISIE)).toBe(
      true
    );
    expect(standingsSeasonOverlayAvailable(SM_SEASON_2026_27.CHAMPIONSHIP)).toBe(
      true
    );
  });

  it("routes seasonRatingOverlayAvailable correctly", () => {
    expect(understatSeasonOverlayAvailable(25583)).toBe(true);
    expect(standingsSeasonOverlayAvailable(25583)).toBe(false);
    expect(seasonRatingOverlayAvailable(25597)).toBe(true);
    expect(seasonRatingOverlayAvailable(99999)).toBe(false);
  });
});
