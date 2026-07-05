import { describe, expect, it } from "vitest";
import { wcMatchRowToInternationalForm } from "@/lib/world-cup/wc-finals-form";

describe("wcMatchRowToInternationalForm", () => {
  it("carries venue altitude from finished WC rows", () => {
    const row = wcMatchRowToInternationalForm({
      id: "m1",
      date: "2026-06-11",
      home_team_id: "h1",
      away_team_id: "a1",
      home_team_name: "Mexico",
      away_team_name: "South Africa",
      home_goals: 2,
      away_goals: 0,
      venue_city: "Mexico City",
      venue_altitude_meters: 2240,
      status: "finished",
    });

    expect(row?.venue_altitude_meters).toBe(2240);
  });

  it("resolves altitude from venue city when meters missing on row", () => {
    const row = wcMatchRowToInternationalForm({
      id: "m2",
      date: "2026-06-18",
      home_team_id: "h1",
      away_team_id: "a2",
      home_team_name: "Mexico",
      away_team_name: "Korea Republic",
      home_goals: 1,
      away_goals: 1,
      venue_city: "Guadalajara",
      status: "finished",
    });

    expect(row?.venue_altitude_meters).toBe(1566);
  });
});
