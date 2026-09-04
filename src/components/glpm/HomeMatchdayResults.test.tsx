import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { placeholderLiveScoresBoard } from "@/lib/glpm/live-scores/placeholders";
import { HomeMatchdayResults } from "./HomeMatchdayResults";

describe("HomeMatchdayResults", () => {
  it("renders today's scorers and a horizontal yesterday rail", () => {
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
    expect(html).toContain("Salah 18'");
    expect(html).toContain("Yesterday");
    expect(html).toContain("home-results-rail");
    expect(html).toContain("Leeds");
    expect(html).toContain("Juventus");
  });
});
