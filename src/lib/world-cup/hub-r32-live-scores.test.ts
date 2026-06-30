import { describe, expect, it } from "vitest";
import { isDisplayableUpcomingMatch } from "@/lib/world-cup/hub-load";
import { buildR32HubMatchRows } from "@/lib/world-cup/r32-hub-fixtures";

/** Mirrors hub-load patch logic for R32 knockout rows. */
function patchHubMatchFromLive<
  T extends {
    id: string;
    home_team_id: string | null;
    away_team_id: string | null;
    date: string | null;
    home_goals: number | null;
    away_goals: number | null;
    status?: string | null;
  },
>(
  row: T,
  liveById: Map<string, { home_goals: number | null; away_goals: number | null; status: string | null }>,
  liveRows: Array<{
    id: string;
    home_team_id: string | null;
    away_team_id: string | null;
    date: string | null;
    home_goals: number | null;
    away_goals: number | null;
    status: string | null;
  }>
): T {
  const byId = liveById.get(row.id);
  if (byId && (byId.home_goals != null || byId.status === "finished")) {
    return {
      ...row,
      home_goals: byId.home_goals ?? row.home_goals,
      away_goals: byId.away_goals ?? row.away_goals,
      status: byId.status ?? row.status,
    };
  }

  if (!row.home_team_id || !row.away_team_id || !row.date) return row;

  const hit = liveRows.find(
    (r) =>
      r.date === row.date &&
      r.home_goals != null &&
      r.away_goals != null &&
      ((r.home_team_id === row.home_team_id && r.away_team_id === row.away_team_id) ||
        (r.home_team_id === row.away_team_id && r.away_team_id === row.home_team_id))
  );
  if (!hit) return row;

  const swapped = hit.home_team_id !== row.home_team_id;
  return {
    ...row,
    home_goals: swapped ? hit.away_goals : hit.home_goals,
    away_goals: swapped ? hit.home_goals : hit.away_goals,
    status: hit.status ?? "finished",
  };
}

describe("R32 hub live score patch", () => {
  const teamNames = new Map([
    ["sa-id", "South Africa"],
    ["ca-id", "Canada"],
    ["de-id", "Germany"],
    ["py-id", "Paraguay"],
  ]);

  it("patches synthetic R32 id from matches table", () => {
    const [row] = buildR32HubMatchRows(teamNames).filter((m) => m.id === "wc2026-ko-73");
    const liveById = new Map([
      [
        "wc2026-ko-73",
        { home_goals: 0, away_goals: 1, status: "finished" },
      ],
    ]);
    const patched = patchHubMatchFromLive(row, liveById, []);
    expect(patched.home_goals).toBe(0);
    expect(patched.away_goals).toBe(1);
    expect(patched.status).toBe("finished");
  });

  it("falls back to team pair when ingest updated a non-synthetic row id", () => {
    const [row] = buildR32HubMatchRows(teamNames).filter((m) => m.id === "wc2026-ko-74");
    const liveRows = [
      {
        id: "fbref-uuid-74",
        home_team_id: row.home_team_id,
        away_team_id: row.away_team_id,
        date: row.date,
        home_goals: 1,
        away_goals: 1,
        status: "finished",
      },
    ];
    const patched = patchHubMatchFromLive(row, new Map(), liveRows);
    expect(patched.home_goals).toBe(1);
    expect(patched.away_goals).toBe(1);
  });
});

describe("displayable upcoming filter", () => {
  it("hides finished ties even when phase is live", () => {
    expect(
      isDisplayableUpcomingMatch({
        match_phase: "live",
        home_goals: 2,
        away_goals: 1,
        status: "scheduled",
      })
    ).toBe(false);
  });

  it("keeps pre-kickoff fixtures", () => {
    expect(
      isDisplayableUpcomingMatch({
        match_phase: "pre",
        home_goals: null,
        away_goals: null,
        status: "scheduled",
      })
    ).toBe(true);
  });
});
