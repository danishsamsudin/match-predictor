import { describe, expect, it } from "vitest";
import { glpmLivescoresInPollWindow } from "@/lib/glpm/live-scores/poll-window";

describe("glpmLivescoresInPollWindow", () => {
  it("allows Saturday afternoon CEST", () => {
    // 2026-09-12 is Saturday; 14:00 UTC = 16:00 CEST
    expect(glpmLivescoresInPollWindow(new Date("2026-09-12T14:00:00Z"))).toBe(true);
  });

  it("blocks Tuesday morning CEST", () => {
    // 10:00 UTC = 12:00 CEST on Tuesday - before 18:00 weekday window
    expect(glpmLivescoresInPollWindow(new Date("2026-09-15T10:00:00Z"))).toBe(false);
  });

  it("allows Tuesday evening CEST", () => {
    // 17:00 UTC = 19:00 CEST
    expect(glpmLivescoresInPollWindow(new Date("2026-09-15T17:00:00Z"))).toBe(true);
  });
});
