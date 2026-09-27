import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  mergeSofifaListedPlayers,
  parseSofifaPlayersListHtml,
} from "@/lib/data/parse-sofifa-players-list-html";

const FIXTURE = path.join(
  process.cwd(),
  "src/lib/data/__fixtures__/sofifa/nl-players-list.fixture.html"
);

describe("parseSofifaPlayersListHtml", () => {
  it("parses overall / nationality / names from a players listing page", () => {
    const html = fs.readFileSync(FIXTURE, "utf8");
    const players = parseSofifaPlayersListHtml(html);
    expect(players.length).toBe(2);

    expect(players[0]).toMatchObject({
      sofifaPlayerId: 239085,
      fullName: "Erling Haaland",
      shortName: "E. Haaland",
      overall: 91,
      potential: 93,
      nationality: "Norway",
      clubName: "Manchester City",
    });
    expect(players[0].positions).toContain("ST");

    expect(players[1]).toMatchObject({
      sofifaPlayerId: 231747,
      fullName: "Kylian Mbappé",
      shortName: "K. Mbappé",
      overall: 91,
      nationality: "France",
    });
  });

  it("merges duplicate Sofifa ids keeping the higher overall", () => {
    const merged = mergeSofifaListedPlayers([
      [
        {
          sofifaPlayerId: 1,
          fullName: "A",
          shortName: "A",
          age: 20,
          overall: 70,
          potential: 75,
          positions: ["ST"],
          nationality: "Spain",
          clubName: null,
        },
      ],
      [
        {
          sofifaPlayerId: 1,
          fullName: "A Updated",
          shortName: "A",
          age: 20,
          overall: 78,
          potential: 80,
          positions: ["ST"],
          nationality: "Spain",
          clubName: null,
        },
      ],
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].overall).toBe(78);
    expect(merged[0].fullName).toBe("A Updated");
  });
});
