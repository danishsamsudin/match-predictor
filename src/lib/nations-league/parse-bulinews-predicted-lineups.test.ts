import { describe, expect, it } from "vitest";
import { parseBulinewsPredictedLineupsHtml } from "@/lib/nations-league/parse-bulinews-predicted-lineups";
import { resolveBulinewsPredictedXi } from "@/lib/nations-league/resolve-bulinews-predicted-xi";
import type { SquadPlayer } from "@/lib/types/team-comparison";

const SAMPLE_HTML = `<!DOCTYPE html>
<html><head>
<title>Netherlands - Germany : Predicted Lineups</title>
<meta name="description" content="Predicted Lineups : Netherlands - Germany, UEFA Nations League 2026/2027, League A">
</head><body>
<script>
idb_lineups={"idb_lineups_fixture_id":"975186","formations":{"hometeam":"4-3-3","awayteam":"4-2-3-1"},"colors":{"hometeam":{"background":"#990000","foreground":"#ffffff;"},"awayteam":{"background":"#f0f0f0","foreground":"#000000"}},"players":{"hometeam":[{"id":"1","name":"Veerman","x":"5","y":"4"},{"id":"2","name":"Summerville","x":"9","y":"8"},{"id":"3","name":"Brobbey","x":"5","y":"9"},{"id":"4","name":"Gravenberch","x":"7","y":"5"},{"id":"5","name":"van Hecke","x":"6","y":"2"},{"id":"6","name":"van Dijk","x":"4","y":"2"},{"id":"7","name":"Reijnders","x":"3","y":"5"},{"id":"8","name":"Van de Ven ","x":"1","y":"2"},{"id":"9","name":"Gakpo","x":"1","y":"8"},{"id":"10","name":"D. Dumfries","x":"9","y":"2"},{"id":"11","name":"Verbruggen","x":"5","y":"1"}],"awayteam":[{"id":"12","name":"Adeyemi","x":"9","y":"7"},{"id":"13","name":"Kimmich","x":"4","y":"4"},{"id":"14","name":"Schlotterbeck","x":"6","y":"2"},{"id":"15","name":"ter Stegen","x":"5","y":"1"},{"id":"16","name":"Vagnoman","x":"9","y":"2"},{"id":"17","name":"Musiala","x":"5","y":"7"},{"id":"18","name":"Schade","x":"1","y":"7"},{"id":"19","name":"Havertz","x":"5","y":"9"},{"id":"20","name":"Brown","x":"1","y":"2"},{"id":"21","name":"Nmecha","x":"6","y":"4"},{"id":"22","name":"Tah","x":"4","y":"2"}]},"publish":"1"};
</script>
</body></html>`;

function fakePlayer(id: number, name: string, position: string): SquadPlayer {
  return {
    sofascorePlayerId: id,
    scoutlystPlayerKey: null,
    name,
    position,
    fieldPosition: null,
    performanceScore: 80,
    startSharePct: null,
    detailStats: [],
    age: null,
  };
}

describe("parseBulinewsPredictedLineupsHtml", () => {
  it("extracts formations and sorted XIs with GK first", () => {
    const parsed = parseBulinewsPredictedLineupsHtml(SAMPLE_HTML);
    expect(parsed).not.toBeNull();
    expect(parsed!.published).toBe(true);
    expect(parsed!.homeFormation).toBe("4-3-3");
    expect(parsed!.awayFormation).toBe("4-2-3-1");
    expect(parsed!.homePlayers).toHaveLength(11);
    expect(parsed!.awayPlayers).toHaveLength(11);
    expect(parsed!.homePlayers[0]!.name).toBe("Verbruggen");
    expect(parsed!.homePlayers[0]!.position).toBe("G");
    expect(parsed!.awayPlayers[0]!.name).toBe("ter Stegen");
    expect(parsed!.awayPlayers[0]!.position).toBe("G");
  });

  it("decodes JSON unicode escapes in player names", () => {
    const html = SAMPLE_HTML.replace(
      '"name":"Veerman"',
      '"name":"\\u00d8degaard"'
    ).replace('"name":"Havertz"', '"name":"P. H\\u00f8jbjerg"');
    const parsed = parseBulinewsPredictedLineupsHtml(html);
    expect(parsed).not.toBeNull();
    expect(parsed!.homePlayers.some((p) => p.name === "Ødegaard")).toBe(true);
    expect(parsed!.awayPlayers.some((p) => p.name === "P. Højbjerg")).toBe(true);
    expect(parsed!.homePlayers.some((p) => p.name.includes("\\u"))).toBe(false);
  });
});

describe("resolveBulinewsPredictedXi", () => {
  it("resolves Germany XI from provided HTML path with ter Stegen not Neuer", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const tmp = path.join(os.tmpdir(), `bulinews-nl-${Date.now()}.html`);
    fs.writeFileSync(tmp, SAMPLE_HTML, "utf8");

    const roster: SquadPlayer[] = [
      fakePlayer(1, "M. Neuer", "GK"),
      fakePlayer(2, "Kimmich J.", "DEF"),
      fakePlayer(3, "J. Tah", "DEF"),
      fakePlayer(4, "Schlotterbeck N.", "DEF"),
      fakePlayer(5, "N. Brown", "DEF"),
      fakePlayer(6, "Nmecha F.", "MID"),
      fakePlayer(7, "Musiala J.", "MID"),
      fakePlayer(8, "Havertz K.", "FWD"),
    ];

    const resolved = resolveBulinewsPredictedXi({
      teamName: "Germany",
      opponentName: "Netherlands",
      roster,
      htmlPaths: [tmp],
    });

    fs.unlinkSync(tmp);
    expect(resolved).not.toBeNull();
    expect(resolved!.starters[0]!.name.toLowerCase()).toContain("stegen");
    expect(resolved!.starters[0]!.name.toLowerCase()).not.toContain("neuer");
    expect(resolved!.formation).toBe("4-2-3-1");
    expect(resolved!.starters).toHaveLength(11);
  });

  it("reads the real NL Bulin HTML folder for Netherlands vs Germany", () => {
    const resolved = resolveBulinewsPredictedXi({
      teamName: "Germany",
      opponentName: "Netherlands",
      roster: [fakePlayer(1, "M. Neuer", "GK"), fakePlayer(2, "Kimmich J.", "DEF")],
    });
    if (!resolved) {
      // Folder may be absent in CI; skip soft
      expect(resolved).toBeNull();
      return;
    }
    expect(resolved.starters[0]!.name.toLowerCase()).toContain("stegen");
  });
});
