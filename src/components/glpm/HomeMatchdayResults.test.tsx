import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { placeholderLiveScoresBoard } from "@/lib/glpm/live-scores/placeholders";
import { HomeMatchdayResults } from "./HomeMatchdayResults";

describe("HomeMatchdayResults", () => {
  it("renders compact today's scorelines and a details CTA (scorers live in the sheet)", () => {
    const board = placeholderLiveScoresBoard();
    const html = renderToStaticMarkup(
      <HomeMatchdayResults
        finishedToday={board.finishedToday}
        yesterday={board.yesterday}
        todayDate={board.todayDate}
        yesterdayDate={board.yesterdayDate}
      />
    ).replaceAll("&#x27;", "'");

    expect(html).toContain("Today's results");
    expect(html).toContain("View match details");
    // Compact card: scoreline only - goalscorers open in the detail sheet
    expect(html).not.toContain("Salah");
    expect(html).not.toContain("18'");
    expect(html).not.toContain("Gueye");
    expect(html).not.toContain("Gakpo");
    expect(html).toContain("Yesterday");
    expect(html).toContain("home-results-rail");
    expect(html).toContain("Leeds");
    expect(html).toContain("Juventus");
  });
});
