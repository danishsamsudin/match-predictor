import { describe, expect, it } from "vitest";
import {
  collectRowsFromPages,
  fixtureToTeamRows,
  isPremierLeague2526,
  parseStatzNumber,
  parseStatzTeamPage,
  type StatzParsedFixture,
} from "@/lib/glpm-cx/satellites/statz-html";

const spursEverton: StatzParsedFixture = {
  info: {
    id: 19427244,
    current_team_id: 6,
    name: "Tottenham Hotspur vs Everton",
    home_team_id: 6,
    away_team_id: 13,
    home_team_name: "Spurs",
    away_team_name: "Everton",
    home_team_goals: 1,
    away_team_goals: 0,
    formatted_kickoff_datetime: "24.05.2026",
    season_name: "25/26",
    competition_id: 8,
    competition_name: "Premier League",
  },
  selected_team_stats: {
    CORNERS: "7",
    FOULS: "15",
    YELLOWCARDS: "3",
    REDCARDS: "-",
    TACKLES: "20",
  },
  opposition_stats: {
    CORNERS: "7",
    FOULS: "18",
    YELLOWCARDS: "2",
    REDCARDS: "-",
    TACKLES: "21",
  },
};

describe("parseStatzNumber", () => {
  it("treats dash reds as zero", () => {
    expect(parseStatzNumber("-")).toBe(0);
    expect(parseStatzNumber("3")).toBe(3);
    expect(parseStatzNumber("58%")).toBe(58);
  });
});

describe("Spurs vs Everton 25/26 (Statz table)", () => {
  it("extracts corners, yellows, reds, fouls for both teams", () => {
    const rows = fixtureToTeamRows(spursEverton);
    const spurs = rows.find((r) => r.teamSmId === 6)!;
    const everton = rows.find((r) => r.teamSmId === 13)!;
    expect(isPremierLeague2526(spurs)).toBe(true);
    expect(spurs.corners).toBe(7);
    expect(spurs.yellowCards).toBe(3);
    expect(spurs.redCards).toBe(0);
    expect(spurs.fouls).toBe(15);
    expect(everton.corners).toBe(7);
    expect(everton.yellowCards).toBe(2);
    expect(everton.redCards).toBe(0);
    expect(everton.fouls).toBe(18);
  });

  it("drops 26/27 fixtures from the 25/26 PL set", () => {
    const pages = [
      {
        teamId: 6,
        teamName: "Spurs",
        fixtures: [
          spursEverton,
          {
            ...spursEverton,
            info: {
              ...spursEverton.info,
              id: 19722184,
              season_name: "26/27",
              name: "Tottenham Hotspur vs Newcastle United",
            },
          },
        ],
      },
    ];
    const { pl2526, all } = collectRowsFromPages(pages);
    expect(all).toHaveLength(4);
    expect(pl2526.every((r) => r.matchSmId === 19427244)).toBe(true);
    expect(pl2526).toHaveLength(2);
  });
});

describe("parseStatzTeamPage", () => {
  it("reads Inertia data-page JSON", () => {
    const html = `<div id="app" data-page="{&quot;props&quot;:{&quot;team&quot;:{&quot;id&quot;:6,&quot;name&quot;:&quot;Tottenham Hotspur&quot;},&quot;fixtures&quot;:[]}}"></div>`;
    const page = parseStatzTeamPage(html);
    expect(page?.teamId).toBe(6);
    expect(page?.fixtures).toEqual([]);
    expect(page?.premierLeagueTeams).toEqual([]);
    expect(page?.fixtureLimit).toBeNull();
  });
});
