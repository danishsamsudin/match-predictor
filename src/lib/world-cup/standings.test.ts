import { describe, expect, it } from "vitest";
import {
  canonicalizeMatchResultForStandings,
  computeGroupStandings,
} from "@/lib/world-cup/standings";
import type { WcMatchRow } from "@/lib/world-cup/standings";
import { WORLD_CUP_2026_TEAMS } from "@/lib/data/world-cup-2026-teams";

function teamId(name: string): string {
  const hit = WORLD_CUP_2026_TEAMS.find((t) => t.name === name);
  if (!hit) throw new Error(`missing team ${name}`);
  return String(hit.id);
}

function teamNames(): Map<string, string> {
  return new Map(WORLD_CUP_2026_TEAMS.map((t) => [String(t.id), t.name]));
}

describe("group standings orientation", () => {
  it("canonicalizes reversed Germany v Curaçao scores to official home/away", () => {
    const names = teamNames();
    const germanyId = teamId("Germany");
    const curacaoId = teamId("Curaçao");
    const canonical = canonicalizeMatchResultForStandings(
      {
        id: "m1",
        date: "2026-06-14",
        group_code: "E",
        status: "finished",
        home_team_id: curacaoId,
        away_team_id: germanyId,
        home_goals: 7,
        away_goals: 1,
        home_team_name: "Curaçao",
        away_team_name: "Germany",
      } satisfies WcMatchRow,
      names
    );
    expect(canonical).toEqual({
      homeTeamId: germanyId,
      awayTeamId: curacaoId,
      homeGoals: 7,
      awayGoals: 1,
    });
  });

  it("computes Group E table correctly when DB home/away is reversed", () => {
    const names = teamNames();
    const germanyId = teamId("Germany");
    const curacaoId = teamId("Curaçao");
    const ecuadorId = teamId("Ecuador");
    const ivoryId = teamId("Côte d'Ivoire");

    const matches: WcMatchRow[] = [
      {
        id: "1",
        date: "2026-06-14",
        group_code: "E",
        status: "finished",
        home_team_id: ecuadorId,
        away_team_id: ivoryId,
        home_goals: 1,
        away_goals: 0,
        home_team_name: "Ecuador",
        away_team_name: "Côte d'Ivoire",
      },
      {
        id: "2",
        date: "2026-06-14",
        group_code: "E",
        status: "finished",
        home_team_id: curacaoId,
        away_team_id: germanyId,
        home_goals: 7,
        away_goals: 1,
        home_team_name: "Curaçao",
        away_team_name: "Germany",
      },
      {
        id: "3",
        date: "2026-06-20",
        group_code: "E",
        status: "finished",
        home_team_id: curacaoId,
        away_team_id: ecuadorId,
        home_goals: 0,
        away_goals: 0,
        home_team_name: "Curaçao",
        away_team_name: "Ecuador",
      },
      {
        id: "4",
        date: "2026-06-20",
        group_code: "E",
        status: "finished",
        home_team_id: ivoryId,
        away_team_id: germanyId,
        home_goals: 1,
        away_goals: 2,
        home_team_name: "Côte d'Ivoire",
        away_team_name: "Germany",
      },
      {
        id: "5",
        date: "2026-06-25",
        group_code: "E",
        status: "finished",
        home_team_id: germanyId,
        away_team_id: ecuadorId,
        home_goals: 1,
        away_goals: 2,
        home_team_name: "Germany",
        away_team_name: "Ecuador",
      },
      {
        id: "6",
        date: "2026-06-25",
        group_code: "E",
        status: "finished",
        home_team_id: ivoryId,
        away_team_id: curacaoId,
        home_goals: 2,
        away_goals: 0,
        home_team_name: "Côte d'Ivoire",
        away_team_name: "Curaçao",
      },
    ];

    const rows = computeGroupStandings(
      "E",
      [
        { teamId: germanyId, teamName: "Germany" },
        { teamId: curacaoId, teamName: "Curaçao" },
        { teamId: ivoryId, teamName: "Côte d'Ivoire" },
        { teamId: ecuadorId, teamName: "Ecuador" },
      ],
      matches
    );

    const byName = Object.fromEntries(rows.map((r) => [r.teamName, r]));
    expect(byName["Curaçao"]?.points).toBe(1);
    expect(byName["Curaçao"]?.rank).toBe(4);
    expect(byName["Côte d'Ivoire"]?.points).toBe(6);
    expect(byName["Ecuador"]?.points).toBe(4);
    expect(byName["Germany"]?.points).toBe(6);
    expect(byName["Germany"]?.rank).toBe(1);
    expect(byName["Ecuador"]?.rank).toBe(3);
  });
});
