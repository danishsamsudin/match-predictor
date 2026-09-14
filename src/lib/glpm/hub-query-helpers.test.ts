import { describe, expect, it } from "vitest";
import {
  groupByWeatherKey,
  uniquePositiveIds,
  weatherDedupeKey,
} from "@/lib/glpm/hub-query-helpers";

describe("uniquePositiveIds", () => {
  it("dedupes and drops nullish / non-positive", () => {
    expect(uniquePositiveIds([1, 2, 2, null, 0, -1, undefined, 3])).toEqual([1, 2, 3]);
  });
});

describe("weatherDedupeKey", () => {
  it("groups by city and calendar date", () => {
    expect(
      weatherDedupeKey({
        matchDate: "2026-09-14T18:00:00Z",
        cityName: "London",
        venueName: "Emirates",
      })
    ).toBe("london|2026-09-14");
  });

  it("falls back to venue then venueSmId", () => {
    expect(
      weatherDedupeKey({
        matchDate: "2026-09-14",
        venueName: "Anfield",
      })
    ).toBe("anfield|2026-09-14");
    expect(
      weatherDedupeKey({
        matchDate: "2026-09-14",
        venueSmId: 42,
      })
    ).toBe("venue:42|2026-09-14");
  });
});

describe("groupByWeatherKey", () => {
  it("keeps first-seen order and groups members", () => {
    const groups = groupByWeatherKey(
      [
        { id: 1, key: "a|d1" },
        { id: 2, key: "b|d1" },
        { id: 3, key: "a|d1" },
      ],
      (x) => x.key
    );
    expect(groups.map((g) => g.key)).toEqual(["a|d1", "b|d1"]);
    expect(groups[0].items.map((i) => i.id)).toEqual([1, 3]);
  });
});
