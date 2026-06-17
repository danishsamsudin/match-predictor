import { describe, expect, it } from "vitest";
import { redCardedPlayerIdsFromIncidents } from "@/lib/data/lineup-suspensions";

describe("redCardedPlayerIdsFromIncidents", () => {
  it("collects home red cards", () => {
    const ids = redCardedPlayerIdsFromIncidents(
      {
        incidents: [
          {
            incidentType: "redCard",
            time: 80,
            isHome: true,
            player: { id: 42, name: "Sent Off" },
          },
        ],
      },
      "home"
    );
    expect(ids.has(42)).toBe(true);
  });

  it("ignores away reds when resolving home suspensions", () => {
    const ids = redCardedPlayerIdsFromIncidents(
      {
        incidents: [
          {
            incidentType: "redCard",
            time: 80,
            isHome: false,
            player: { id: 99, name: "Away Red" },
          },
        ],
      },
      "home"
    );
    expect(ids.size).toBe(0);
  });
});
