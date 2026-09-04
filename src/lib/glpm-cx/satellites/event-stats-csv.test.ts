import { describe, expect, it } from "vitest";
import {
  canonicalTeamKey,
  matchCsvRowsToFixtures,
  parseEventStatsCsv,
  parseFdDate,
} from "@/lib/glpm-cx/satellites/event-stats-csv";

describe("parseFdDate", () => {
  it("parses football-data dd/mm/yyyy and dd/mm/yy", () => {
    expect(parseFdDate("16/08/2025")).toBe("2025-08-16");
    expect(parseFdDate("16/08/25")).toBe("2025-08-16");
  });
});

describe("canonicalTeamKey", () => {
  it("maps football-data short names", () => {
    expect(canonicalTeamKey("Man City")).toBe("manchester city");
    expect(canonicalTeamKey("Nott'm Forest")).toBe("nottingham forest");
  });
});

describe("parseEventStatsCsv + match", () => {
  it("builds home/away patches from a football-data style header", () => {
    const csv = [
      "Date,HomeTeam,AwayTeam,FTHG,FTAG,HC,AC,HY,AY,HR,AR,HF,AF",
      "16/08/2025,Liverpool,Bournemouth,4,2,8,3,1,2,0,0,10,12",
    ].join("\n");
    const rows = parseEventStatsCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.homeCorners).toBe(8);
    expect(rows[0]?.awayYellows).toBe(2);

    const { patches, unmatched } = matchCsvRowsToFixtures(rows, [
      {
        matchSmId: 1,
        matchDate: "2025-08-16",
        homeTeamSmId: 10,
        awayTeamSmId: 20,
        homeName: "Liverpool",
        awayName: "AFC Bournemouth",
      },
    ]);
    expect(unmatched).toHaveLength(0);
    expect(patches).toHaveLength(2);
    expect(patches[0]).toMatchObject({ teamSmId: 10, corners: 8, yellowCards: 1, fouls: 10 });
    expect(patches[1]).toMatchObject({ teamSmId: 20, corners: 3, yellowCards: 2, fouls: 12 });
  });
});
