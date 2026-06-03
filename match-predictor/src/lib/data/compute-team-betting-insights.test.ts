import { describe, expect, it } from "vitest";
import {
  computeBettingTrends,
  computeQualifyingInsights,
  computeRecentPerformance,
  computeRestDaysBefore,
  computeTeamBettingInsights,
  dedupeMatchHistory,
} from "@/lib/data/compute-team-betting-insights";
import type { TeamMatchHistoryRow } from "@/lib/types/team-betting-insights";

const sample: TeamMatchHistoryRow[] = [
  {
    date: "2026-03-01",
    opponent: "A",
    isHome: true,
    goalsFor: 2,
    goalsAgainst: 1,
    competition: "WCQ — UEFA (M)",
  },
  {
    date: "2026-02-20",
    opponent: "B",
    isHome: false,
    goalsFor: 0,
    goalsAgainst: 0,
    competition: "Friendlies (M)",
  },
  {
    date: "2026-02-10",
    opponent: "C",
    isHome: true,
    goalsFor: 3,
    goalsAgainst: 2,
    competition: "WCQ — UEFA (M)",
  },
];

describe("compute-team-betting-insights", () => {
  it("dedupes identical matches", () => {
    const duped = [...sample, sample[0]];
    expect(dedupeMatchHistory(duped)).toHaveLength(3);
  });

  it("computes recent performance", () => {
    const recent = computeRecentPerformance(sample, 3);
    expect(recent?.record).toEqual({ wins: 2, draws: 1, losses: 0 });
    expect(recent?.goalDifferential).toBe(2);
    expect(recent?.cleanSheetPct).toBeCloseTo(33.3, 1);
    expect(recent?.failedToScorePct).toBeCloseTo(33.3, 1);
  });

  it("computes BTTS and over 2.5", () => {
    const trends = computeBettingTrends(sample, 3);
    expect(trends?.bttsYesPct).toBeCloseTo(66.7, 1);
    expect(trends?.over25Pct).toBeCloseTo(66.7, 1);
  });

  it("computes WCQ PPG", () => {
    const q = computeQualifyingInsights(sample);
    expect(q?.matchesPlayed).toBe(2);
    expect(q?.points).toBe(6);
    expect(q?.ppg).toBe(3);
  });

  it("computes rest days", () => {
    expect(computeRestDaysBefore("2026-03-10", "2026-03-01")).toBe(9);
    expect(computeRestDaysBefore("2026-03-01", "2026-03-01")).toBe(0);
  });

  it("aggregates FBref team stats", () => {
    const insights = computeTeamBettingInsights({
      matches: sample,
      source: "mixed",
      fifaRanking: null,
      fbref: {
        standard: [
          { player_name: "A", minutes: 900, goals: 5, age: 28, cards_yellow: 2 },
          { player_name: "B", minutes: 450, goals: 1, age: 22, cards_yellow: 1 },
        ],
        shooting: [
          { minutes: 900, shots: 20, shots_on_target: 10, goals: 5 },
          { minutes: 450, shots: 4, shots_on_target: 2, goals: 1 },
        ],
        keeper: [{ gk_minutes: 900, gk_save_pct: 72 }],
        misc: [{ minutes: 900, crosses: 30, tackles_won: 18, interceptions: 12 }],
      },
    });
    expect(insights.attacking?.shotConversionPct).toBeCloseTo(25, 0);
    expect(insights.attacking?.topScorerSharePct).toBeCloseTo(83.3, 1);
    expect(insights.defensive?.goalkeeperSavePct).toBe(72);
    expect(insights.squad?.averageAge).toBeGreaterThan(24);
  });
});
