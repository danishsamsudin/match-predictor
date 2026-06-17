import { describe, expect, it } from "vitest";
import { computeLineupPlayerXgImpact } from "./lineup-player-xg-impact";
import type { ResolvedLineupPlayer } from "./resolve-lineup-player-stats";

function player(
  id: number,
  role: ResolvedLineupPlayer["role"],
  stats: Record<string, string | number | null>,
  performanceScore: number | null = 70
): ResolvedLineupPlayer {
  return { playerId: id, name: `P${id}`, role, stats, performanceScore };
}

function fullXi(
  overrides: Partial<Record<number, ResolvedLineupPlayer>> = {}
): Map<number, ResolvedLineupPlayer> {
  const defaults: ResolvedLineupPlayer[] = [
    player(1, "G", { gk_save_pct: 72, gk_goals_against: 30, Min: 900 }),
    player(2, "D", { Int: 45, Tkl: 40, CS: 8, MP: 20, Min: 1800 }),
    player(3, "D", { Int: 40, Tkl: 38, CS: 7, MP: 20, Min: 1800 }),
    player(4, "D", { Int: 35, Tkl: 42, CS: 6, MP: 18, Min: 1600 }),
    player(5, "D", { Int: 38, Tkl: 36, CS: 7, MP: 19, Min: 1700 }),
    player(6, "M", { xA: 8, npxG: 3, SCA: 50, Min: 1800 }),
    player(7, "M", { xA: 6, npxG: 2, SCA: 40, Min: 1600 }),
    player(8, "M", { xA: 5, npxG: 4, SCA: 35, Min: 1500 }),
    player(9, "F", { npxG: 12, Gls: 10, Min: 1800 }),
    player(10, "F", { npxG: 8, Gls: 7, Min: 1400 }),
    player(11, "F", { npxG: 5, Gls: 4, Min: 1200 }),
  ];
  const map = new Map<number, ResolvedLineupPlayer>();
  for (const p of defaults) {
    map.set(p.playerId, overrides[p.playerId] ?? p);
  }
  return map;
}

describe("computeLineupPlayerXgImpact", () => {
  it("boosts attack when striker npxG is high vs baseline", () => {
    const strongStriker = player(9, "F", { npxG: 18, Gls: 15, Min: 1800 }, 90);
    const homeStrong = fullXi({ 9: strongStriker });
    const homeWeak = fullXi({
      9: player(9, "F", { npxG: 2, Gls: 1, Min: 800 }, 45),
    });
    const away = fullXi();

    const strongResult = computeLineupPlayerXgImpact({
      homePlayers: homeStrong,
      awayPlayers: away,
      baseHomeXg: 1.4,
      baseAwayXg: 1.1,
      mu: 1.35,
    });
    const weakResult = computeLineupPlayerXgImpact({
      homePlayers: homeWeak,
      awayPlayers: away,
      baseHomeXg: 1.4,
      baseAwayXg: 1.1,
      mu: 1.35,
    });

    expect(strongResult.homeXgMultiplier).toBeGreaterThanOrEqual(
      weakResult.homeXgMultiplier
    );
    expect(strongResult.notes.join(" ")).toMatch(/Player-xG blend/);
  });

  it("increases opponent xG when home defense is weak", () => {
    const weakGk = player(1, "G", { gk_save_pct: 55, gk_goals_against: 50, Min: 900 }, 40);
    const home = fullXi({ 1: weakGk });
    const away = fullXi();

    const result = computeLineupPlayerXgImpact({
      homePlayers: home,
      awayPlayers: away,
      baseHomeXg: 1.3,
      baseAwayXg: 1.2,
      mu: 1.35,
    });

    expect(result.homeDefenseMultiplier).toBeGreaterThan(1);
  });

  it("falls back toward team xG with low stat coverage", () => {
    const sparse = new Map<number, ResolvedLineupPlayer>();
    for (let i = 1; i <= 11; i++) {
      sparse.set(i, player(i, "M", {}, null));
    }

    const result = computeLineupPlayerXgImpact({
      homePlayers: sparse,
      awayPlayers: sparse,
      baseHomeXg: 1.5,
      baseAwayXg: 1.0,
      mu: 1.35,
    });

    expect(result.homeXgMultiplier).toBeGreaterThanOrEqual(0.75);
    expect(result.homeXgMultiplier).toBeLessThanOrEqual(1.15);
    expect(result.notes.some((n) => n.includes("w=0.20"))).toBe(true);
  });
});
