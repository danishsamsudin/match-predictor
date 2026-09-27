import { describe, expect, it } from "vitest";
import { getNlMd1TeamLineup, listNlMd1TeamLineups } from "@/lib/nations-league/md1-starting-xis-data";
import { loadNlMd1SquadForComparison } from "@/lib/nations-league/load-nl-md1-squad-for-comparison";

describe("NL MD1 starting XIs", () => {
  it("covers all 54 Nations League teams with 11 starters", () => {
    const teams = listNlMd1TeamLineups();
    expect(teams.length).toBe(54);
    for (const team of teams) {
      expect(team.starters.length).toBeGreaterThanOrEqual(11);
    }
  });

  it("resolves Azerbaijan and Gibraltar baselines from first-match sheets", () => {
    const azerbaijan = getNlMd1TeamLineup(4742, "Azerbaijan");
    const gibraltar = getNlMd1TeamLineup(129264, "Gibraltar");
    expect(azerbaijan?.starters).toHaveLength(11);
    expect(gibraltar?.starters).toHaveLength(11);
  });

  it("resolves Serbia and Netherlands by id and name", () => {
    const serbia = getNlMd1TeamLineup(6355, "Serbia");
    const netherlands = getNlMd1TeamLineup(4705, "Netherlands");
    expect(serbia?.starters).toHaveLength(11);
    expect(netherlands?.starters).toHaveLength(11);
    expect(serbia?.starters.some((p) => /Vlahovi|Mitrovi|Jovi|Tadi/i.test(p.name))).toBe(
      true
    );
  });

  it("builds a comparison snapshot with MD1 starters and bench", () => {
    const squad = loadNlMd1SquadForComparison(4705, "Netherlands");
    expect(squad).not.toBeNull();
    expect(squad!.squadSource).toBe("nl_md1");
    expect(squad!.starters).toHaveLength(11);
    expect(squad!.substitutes.length).toBeGreaterThan(0);
    expect(squad!.preferredFormation).toBeTruthy();
  });
});
