import { describe, expect, it } from "vitest";
import { computeGrahamProcessRatesFromMatches } from "@/lib/world-cup/graham-process-rates";
import type { InternationalFormMatch } from "@/lib/world-cup/load-international-form";

const luckyWin: InternationalFormMatch[] = [
  {
    date: "2026-01-01",
    home_team_id: "1",
    away_team_id: "2",
    home_goals: 3,
    home_xg: 0.9,
    away_goals: 0,
    away_xg: 2.1,
    competition: "WCQ",
    home_team_name: "Team A",
    away_team_name: "Team B",
  },
];

const unluckyLoss: InternationalFormMatch[] = [
  {
    date: "2026-01-01",
    home_team_id: "1",
    away_team_id: "2",
    home_goals: 0,
    home_xg: 2.4,
    away_goals: 1,
    away_xg: 0.8,
    competition: "WCQ",
    home_team_name: "Team A",
    away_team_name: "Team B",
  },
];

describe("computeGrahamProcessRatesFromMatches", () => {
  it("does not inflate attack on lucky 3-0 when xG was poor", () => {
    const rates = computeGrahamProcessRatesFromMatches("1", luckyWin, Date.parse("2026-06-01"));
    expect(rates.attack).toBeLessThan(1.05);
    expect(rates.sample.fallback).toBe("xg");
  });

  it("keeps strong process signal on unlucky 0-1 xG win", () => {
    const rates = computeGrahamProcessRatesFromMatches("1", unluckyLoss, Date.parse("2026-06-01"));
    expect(rates.attack).toBeGreaterThan(1.1);
  });

  it("falls back to goals when xG missing", () => {
    const goalOnly: InternationalFormMatch[] = [
      {
        date: "2026-01-01",
        home_team_id: "1",
        away_team_id: "2",
        home_goals: 2,
        away_goals: 0,
        competition: "WCQ",
      },
    ];
    const rates = computeGrahamProcessRatesFromMatches("1", goalOnly, Date.parse("2026-06-01"));
    expect(rates.attack).toBeGreaterThan(1);
    expect(rates.sample.fallback).toBe("goals");
  });
});
