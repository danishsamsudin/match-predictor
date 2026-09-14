import { describe, expect, it } from "vitest";
import { isGlpmHomeHubStale, GLPM_HOME_HUB_STALE_MS } from "@/lib/glpm/home-hub-snapshot";

describe("isGlpmHomeHubStale", () => {
  it("treats missing timestamps as stale", () => {
    expect(isGlpmHomeHubStale(null)).toBe(true);
    expect(isGlpmHomeHubStale(undefined)).toBe(true);
  });

  it("uses the 6 hour threshold", () => {
    const now = Date.parse("2026-09-14T12:00:00Z");
    expect(isGlpmHomeHubStale(new Date(now - GLPM_HOME_HUB_STALE_MS + 60_000).toISOString(), now)).toBe(
      false
    );
    expect(isGlpmHomeHubStale(new Date(now - GLPM_HOME_HUB_STALE_MS - 1).toISOString(), now)).toBe(
      true
    );
  });
});
