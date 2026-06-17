import { describe, expect, it } from "vitest";
import { compareByKickoffAsc, groupMatchesByDay } from "@/lib/world-cup/sort-matches";
import type { WcMatchRow } from "@/lib/world-cup/standings";

function row(
  partial: Partial<WcMatchRow> & Pick<WcMatchRow, "id">
): WcMatchRow {
  return {
    date: null,
    time: null,
    group_code: null,
    status: "scheduled",
    home_team_id: null,
    away_team_id: null,
    home_goals: null,
    away_goals: null,
    ...partial,
  };
}

describe("compareByKickoffAsc", () => {
  it("orders Mexico v South Africa before Korea v Czechia on opening day", () => {
    const mexico = row({
      id: "1",
      date: "2026-06-11",
      home_team_name: "Mexico",
      away_team_name: "South Africa",
    });
    const korea = row({
      id: "2",
      date: "2026-06-11",
      home_team_name: "Korea Republic",
      away_team_name: "Czechia",
    });
    const sorted = [korea, mexico].sort(compareByKickoffAsc);
    expect(sorted[0].home_team_name).toBe("Mexico");
    expect(sorted[1].home_team_name).toBe("Korea Republic");
  });

  it("sorts earlier calendar days before later ones", () => {
    const early = row({
      id: "a",
      date: "2026-06-11",
      home_team_name: "Mexico",
      away_team_name: "South Africa",
    });
    const late = row({
      id: "b",
      date: "2026-06-12",
      home_team_name: "Canada",
      away_team_name: "Bosnia-Herzegovina",
    });
    expect(compareByKickoffAsc(early, late)).toBeLessThan(0);
  });
});

describe("groupMatchesByDay", () => {
  it("preserves order within each day bucket", () => {
    const matches = [
      row({ id: "1", date: "2026-06-11", home_team_name: "Mexico" }),
      row({ id: "2", date: "2026-06-11", home_team_name: "Korea Republic" }),
      row({ id: "3", date: "2026-06-12", home_team_name: "Canada" }),
    ];
    const groups = groupMatchesByDay(matches);
    expect(groups).toHaveLength(2);
    expect(groups[0].matches).toHaveLength(2);
    expect(groups[1].date).toBe("2026-06-12");
  });
});
