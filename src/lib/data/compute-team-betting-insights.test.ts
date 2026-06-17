import { describe, expect, it } from "vitest";
import {
  aggregateFbrefTeamStats,
  computeBettingTrends,
  computeQualifyingInsights,
  computeRecentPerformance,
  computeRestDaysBefore,
  computeTeamBettingInsights,
  dedupeMatchHistory,
  teamGoalkeeperSavePctFromKeeper,
  teamStatPer90FromRows,
  teamYellowCardsPer90FromStandard,
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
        keeper: [
          {
            gk_minutes: 720,
            gk_saves: 17,
            gk_shots_on_target_against: 22,
            gk_goals_against: 5,
            gk_save_pct: 77.3,
          },
        ],
        misc: [{ minutes_90s: 10, crosses: 30, tackles_won: 18, interceptions: 12 }],
      },
    });
    expect(insights.attacking?.shotConversionPct).toBeCloseTo(25, 0);
    expect(insights.attacking?.topScorerSharePct).toBeCloseTo(83.3, 1);
    expect(insights.defensive?.goalkeeperSavePct).toBeCloseTo(77.3, 1);
    expect(insights.defensive?.tacklesPer90).toBeLessThan(35);
    expect(insights.squad?.averageAge).toBeGreaterThan(24);
  });

  it("does not inflate per-90 rates when only minutes_90s is present", () => {
    const agg = aggregateFbrefTeamStats({
      standard: [],
      shooting: [{ minutes_90s: 8, shots: 40 }],
      keeper: [],
      misc: [
        { player_id: "a", competition: "WCQ", minutes_90s: 8, tackles_won: 13 },
        { player_id: "b", competition: "WCQ", minutes_90s: 8, tackles_won: 11 },
      ],
    });
    expect(agg.defensive.tacklesPer90).toBeLessThan(35);
    expect(agg.defensive.tacklesPer90).toBeGreaterThan(10);
  });

  it("computes realistic shots on target and crosses per 90 from minutes_90s", () => {
    const agg = aggregateFbrefTeamStats({
      standard: [],
      shooting: [
        { player_id: "a", competition: "WCQ", minutes_90s: 6, shots_on_target: 8 },
        { player_id: "b", competition: "WCQ", minutes_90s: 5.2, shots_on_target: 7 },
      ],
      keeper: [],
      misc: [
        { player_id: "a", competition: "WCQ", minutes_90s: 6, crosses: 14 },
        { player_id: "b", competition: "WCQ", minutes_90s: 5.2, crosses: 11 },
      ],
    });
    // Mis-treating 90s as minutes would yield ~120+ SOT/90 and ~200+ crosses/90.
    expect(agg.attacking.shotsOnTargetPer90).toBeGreaterThan(5);
    expect(agg.attacking.shotsOnTargetPer90).toBeLessThan(25);
    expect(agg.attacking.crossesPer90).toBeGreaterThan(5);
    expect(agg.attacking.crossesPer90).toBeLessThan(40);
  });

  it("prefers minutes_90s when minutes looks like nineties", () => {
    const rate = teamStatPer90FromRows(
      [{ player_id: "a", competition: "WCQ", minutes: 6, minutes_90s: 6, shots_on_target: 8 }],
      ["shots_on_target"]
    );
    expect(rate).toBeCloseTo(14.7, 1);
  });

  it("GK save % cannot be 100% when goals were conceded", () => {
    expect(
      teamGoalkeeperSavePctFromKeeper([
        {
          gk_minutes: 720,
          gk_saves: 10,
          gk_shots_on_target_against: 11,
          gk_goals_against: 1,
        },
      ])
    ).toBeLessThan(100);
    expect(
      teamGoalkeeperSavePctFromKeeper([
        {
          gk_minutes: 90,
          gk_save_pct: 100,
          gk_goals_against: 1,
          gk_saves: 5,
          gk_shots_on_target_against: 6,
        },
      ])
    ).toBeLessThan(100);
  });

  it("scales misc stats to team match minutes", () => {
    const rate = teamStatPer90FromRows(
      [{ player_id: "a", competition: "WCQ", minutes_90s: 8, tackles_won: 13 }],
      ["tackles_won"]
    );
    expect(rate).toBeCloseTo(18, 0);
  });

  it("computes team yellow cards per match 90, not per player-minute", () => {
    const rows = [
      { player_id: "a", competition: "WCQ", minutes: 900, cards_yellow: 2 },
      { player_id: "b", competition: "WCQ", minutes: 450, cards_yellow: 1 },
    ];
    // 3 cards in 1350 player-minutes ≈ 122.7 team minutes → ~2.2 cards / 90
    expect(teamYellowCardsPer90FromStandard(rows)).toBeCloseTo(2.2, 1);
  });

  it("dedupes duplicate FBref standard rows before yellow card rate", () => {
    const rows = [
      { player_id: "a", competition: "WCQ", minutes: 900, cards_yellow: 2 },
      { player_id: "a", competition: "WCQ", minutes: 900, cards_yellow: 2 },
      { player_id: "b", competition: "WCQ", minutes: 450, cards_yellow: 1 },
    ];
    expect(teamYellowCardsPer90FromStandard(rows)).toBeCloseTo(2.2, 1);
  });

  it("combines yellow cards across competitions for the same player", () => {
    const rows = [
      { player_id: "a", competition: "WCQ", minutes: 360, cards_yellow: 1 },
      { player_id: "a", competition: "Friendlies", minutes: 180, cards_yellow: 1 },
    ];
    expect(teamYellowCardsPer90FromStandard(rows)).toBeCloseTo(3.7, 1);
  });
});
