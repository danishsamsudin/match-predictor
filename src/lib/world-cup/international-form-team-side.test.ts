import { describe, expect, it } from "vitest";
import type { InternationalFormMatch } from "@/lib/world-cup/load-international-form";
import {
  canonicalInternationalFormMatchKey,
  mergeInternationalFormWithWcFinals,
  opponentInInternationalForm,
  resolveInternationalFormTeamSide,
  teamGoalsInInternationalForm,
} from "@/lib/world-cup/international-form-team-side";
import { wcMatchRowToInternationalForm } from "@/lib/world-cup/wc-finals-form";

describe("resolveInternationalFormTeamSide", () => {
  const usaDbId = "00000000-0000-4000-8000-0000000004724";
  const paraguayDbId = "00000000-0000-4000-8000-0000000004713";

  it("matches Sofascore/API ids when teamId is the DB uuid", () => {
    const match: InternationalFormMatch = {
      date: "2026-06-12",
      home_team_id: "4724",
      away_team_id: "4789",
      home_goals: 4,
      away_goals: 1,
      home_team_name: "USA",
      away_team_name: "Paraguay",
    };
    expect(resolveInternationalFormTeamSide(match, usaDbId, "USA")).toBe("home");
    expect(teamGoalsInInternationalForm(match, usaDbId, "USA")).toEqual({
      goalsFor: 4,
      goalsAgainst: 1,
    });
  });

  it("does not assume away when ids do not match", () => {
    const match: InternationalFormMatch = {
      date: "2026-06-12",
      home_team_id: "4724",
      away_team_id: "4789",
      home_goals: 4,
      away_goals: 1,
      home_team_name: "USA",
      away_team_name: "Paraguay",
    };
    expect(resolveInternationalFormTeamSide(match, usaDbId)).toBeNull();
    expect(teamGoalsInInternationalForm(match, usaDbId)).toBeNull();
  });

  it("aligns inverted USA v Paraguay WC rows before resolving side", () => {
    const aligned = wcMatchRowToInternationalForm({
      id: "m1",
      date: "2026-06-12",
      time: null,
      group_code: "D",
      status: "finished",
      home_team_id: paraguayDbId,
      away_team_id: usaDbId,
      home_team_name: "Paraguay",
      away_team_name: "United States",
      home_goals: 4,
      away_goals: 1,
      ingest_source_home: "United States",
      ingest_source_away: "Paraguay",
      ingest_source_home_goals: 4,
      ingest_source_away_goals: 1,
    });
    expect(aligned?.home_team_name).toBe("United States");
    expect(aligned?.away_team_name).toBe("Paraguay");
    expect(aligned?.home_goals).toBe(4);
    expect(aligned?.away_goals).toBe(1);

    const goals = teamGoalsInInternationalForm(aligned!, usaDbId, "USA");
    expect(goals).toEqual({ goalsFor: 4, goalsAgainst: 1 });
    expect(opponentInInternationalForm(aligned!, usaDbId, "USA")?.name).toBe("Paraguay");
  });
});

describe("canonicalInternationalFormMatchKey", () => {
  it("treats FBref and API ids for the same fixture as one match", () => {
    const fbrefRow: InternationalFormMatch = {
      date: "2026-06-02",
      home_team_id: "fbref-home-uuid",
      away_team_id: "fbref-away-uuid",
      home_goals: 4,
      away_goals: 0,
      home_team_name: "Curaçao",
      away_team_name: "Madagascar",
    };
    const apiRow: InternationalFormMatch = {
      date: "2026-06-02",
      home_team_id: "4820",
      away_team_id: "4911",
      home_goals: 4,
      away_goals: 0,
      home_team_name: "Curaçao",
      away_team_name: "Madagascar",
      event_id: 999,
    };

    expect(canonicalInternationalFormMatchKey(fbrefRow)).toBe(
      canonicalInternationalFormMatchKey(apiRow)
    );
  });

  it("prefers aligned WC finals rows when merging", () => {
    const generic: InternationalFormMatch = {
      date: "2026-06-12",
      home_team_id: "4789",
      away_team_id: "4724",
      home_goals: 1,
      away_goals: 4,
      home_team_name: "Paraguay",
      away_team_name: "USA",
    };
    const finals: InternationalFormMatch = {
      date: "2026-06-12",
      home_team_id: "4724",
      away_team_id: "4789",
      home_goals: 4,
      away_goals: 1,
      home_team_name: "United States",
      away_team_name: "Paraguay",
      competition: "FIFA World Cup 2026",
    };

    const merged = mergeInternationalFormWithWcFinals([generic], [finals]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.home_goals).toBe(4);
    expect(merged[0]?.away_goals).toBe(1);
  });
});
