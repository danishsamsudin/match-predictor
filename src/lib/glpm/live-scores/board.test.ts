import { describe, expect, it } from "vitest";
import { LIVE_POLL_AFTER_KICKOFF_MS } from "./constants";
import {
  finishedStatusLabel,
  looksFinishedScoreboardRow,
  splitDayResults,
  type ScoreboardRowRef,
} from "./board";

function row(partial: Partial<ScoreboardRowRef> & Pick<ScoreboardRowRef, "sm_id">): ScoreboardRowRef {
  return {
    state_id: null,
    status: null,
    kickoff_at: null,
    home_score: null,
    away_score: null,
    ...partial,
  };
}

describe("finishedStatusLabel", () => {
  it("maps extra time and penalties to short labels", () => {
    expect(finishedStatusLabel({ state_id: 5, status: "Full Time" })).toBe("FT");
    expect(finishedStatusLabel({ state_id: 7, status: "After Extra Time" })).toBe("AET");
    expect(finishedStatusLabel({ state_id: 8, status: "After Penalties" })).toBe("Pens");
  });
});

describe("looksFinishedScoreboardRow", () => {
  const nowMs = Date.parse("2026-09-04T20:00:00Z");

  it("uses finished state even inside the live window", () => {
    expect(
      looksFinishedScoreboardRow(
        row({
          sm_id: 1,
          state_id: 5,
          status: "Full Time",
          kickoff_at: "2026-09-04T18:00:00Z",
          home_score: 2,
          away_score: 1,
        }),
        nowMs
      )
    ).toBe(true);
  });

  it("does not treat an in-play HT scoreline as finished", () => {
    expect(
      looksFinishedScoreboardRow(
        row({
          sm_id: 2,
          state_id: 3,
          status: "HT",
          kickoff_at: "2026-09-04T19:00:00Z",
          home_score: 1,
          away_score: 0,
        }),
        nowMs
      )
    ).toBe(false);
  });

  it("falls back to the live poll window when state was never patched to FT", () => {
    const kickoff = new Date(nowMs - LIVE_POLL_AFTER_KICKOFF_MS - 60_000).toISOString();
    expect(
      looksFinishedScoreboardRow(
        row({
          sm_id: 3,
          state_id: 4,
          status: "2nd Half",
          kickoff_at: kickoff,
          home_score: 1,
          away_score: 1,
        }),
        nowMs
      )
    ).toBe(true);
  });
});

describe("splitDayResults", () => {
  const todayDate = "2026-09-04";
  const yesterdayDate = "2026-09-03";
  const timeZone = "UTC";
  const nowMs = Date.parse("2026-09-04T20:00:00Z");

  it("keeps today's FT matches out of live and lists yesterday across leagues", () => {
    const live = row({
      sm_id: 10,
      state_id: 4,
      status: "2nd Half",
      kickoff_at: "2026-09-04T18:30:00Z",
      home_score: 1,
      away_score: 0,
    });
    const todayFt = row({
      sm_id: 11,
      state_id: 5,
      status: "Full Time",
      kickoff_at: "2026-09-04T12:00:00Z",
      home_score: 2,
      away_score: 2,
    });
    const yesterdayFt = row({
      sm_id: 12,
      state_id: 5,
      status: "FT",
      kickoff_at: "2026-09-03T19:00:00Z",
      home_score: 0,
      away_score: 1,
    });
    const { finishedToday, yesterday } = splitDayResults({
      rows: [live, todayFt, yesterdayFt],
      liveIds: new Set([10]),
      todayDate,
      yesterdayDate,
      timeZone,
      nowMs,
    });

    expect(finishedToday.map((r) => r.sm_id)).toEqual([11]);
    expect(yesterday.map((r) => r.sm_id)).toEqual([12]);
  });
});
