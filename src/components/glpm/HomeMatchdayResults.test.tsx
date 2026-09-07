import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { placeholderLiveScoresBoard } from "@/lib/glpm/live-scores/placeholders";
import { HomeMatchdayResults } from "./HomeMatchdayResults";

describe("HomeMatchdayResults", () => {
  it("renders today's goalscorers with icons and a compare pill", () => {
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
    expect(html).toContain("Salah");
    expect(html).toContain("18'");
    expect(html).toContain("Compare prediction vs outcome");
    expect(html).not.toContain("▾");
    expect(html).not.toContain("▴");
    // Cards/subs stay out of the compact scoreline
    expect(html).not.toContain("Gueye");
    expect(html).not.toContain("Gakpo");
    expect(html).toContain("Yesterday");
    expect(html).toContain("home-results-rail");
    expect(html).toContain("Leeds");
    expect(html).toContain("Juventus");
  });
});
