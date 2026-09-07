import { describe, expect, it } from "vitest";
import { emptyLiveScoresBoard, loadLiveScoresBoard } from "./load";

function mockClient(matchesResult: { data: unknown; error: { message: string } | null }) {
  const empty = { data: [], error: null };
  const makeChain = (result: { data: unknown; error: { message: string } | null }) => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = self;
    chain.gte = self;
    chain.lte = self;
    chain.lt = self;
    chain.eq = self;
    chain.neq = self;
    chain.not = self;
    chain.or = self;
    chain.in = self;
    chain.order = self;
    chain.limit = () => Promise.resolve(result);
    // Supabase builders are thenable even without .limit()
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject);
    return chain;
  };

  return {
    from: (table: string) => {
      if (table === "glpm_matches") return makeChain(matchesResult);
      return makeChain(empty);
    },
  } as never;
}

describe("loadLiveScoresBoard", () => {
  it("returns an empty live board when nothing is in the window", async () => {
    const board = await loadLiveScoresBoard(mockClient({ data: [], error: null }));
    expect(board).toEqual(emptyLiveScoresBoard());
  });

  it("does not swap in demo cards when the query fails", async () => {
    const board = await loadLiveScoresBoard(
      mockClient({ data: null, error: { message: "permission denied" } })
    );
    expect(board).toEqual(emptyLiveScoresBoard());
  });

  it("returns placeholders only when explicitly requested", async () => {
    const board = await loadLiveScoresBoard(mockClient({ data: [], error: null }), {
      includePlaceholdersWhenEmpty: true,
    });
    expect(board.source).toBe("placeholder");
    expect(board.matches.length).toBeGreaterThan(0);
    expect(board.finishedToday.length).toBeGreaterThan(0);
    expect(board.yesterday.length).toBeGreaterThan(0);
  });

  it("keeps today's finished matches instead of dropping them", async () => {
    const nowMs = Date.parse("2026-09-04T16:00:00Z");
    const row = {
      sm_id: 99,
      league_sm_id: 8,
      season_id: 25583,
      home_team_sm_id: 19,
      away_team_sm_id: 18,
      home_score: 2,
      away_score: 1,
      venue: "Emirates Stadium",
      gameweek: 3,
      status: "Full Time",
      state_id: 5,
      kickoff_at: "2026-09-04T12:00:00Z",
      match_date: "2026-09-04",
      synced_at: "2026-09-04T14:00:00Z",
      duration_minutes: 90,
      payload: {
        participants: [
          { id: 19, name: "Arsenal", meta: { location: "home" } },
          { id: 18, name: "Chelsea", meta: { location: "away" } },
        ],
        events: [
          {
            id: 1,
            type_id: 14,
            participant_id: 19,
            player_name: "Saka",
            minute: 12,
          },
        ],
        league: { name: "Premier League" },
      },
    };
    const board = await loadLiveScoresBoard(mockClient({ data: [row], error: null }), { nowMs });
    expect(board.source).toBe("live");
    expect(board.matches).toEqual([]);
    expect(board.finishedToday).toHaveLength(1);
    expect(board.finishedToday[0]).toMatchObject({
      homeTeamName: "Arsenal",
      awayTeamName: "Chelsea",
      homeScore: 2,
      awayScore: 1,
      prediction: null,
      predictionSource: null,
    });
  });
});
