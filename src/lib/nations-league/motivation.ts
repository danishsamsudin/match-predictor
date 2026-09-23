import type { MotivationParams } from "@/lib/world-cup/motivation";
import type { GroupStandingRow } from "@/lib/world-cup/standings";
import { leagueTierFromGroupCode } from "@/lib/nations-league/group-draw";

/**
 * NL motivation: promotion / relegation / dead rubber by group position.
 * No WC host-nation or MD3 permutation logic.
 */
export function resolveNlFixtureMotivation(
  homeTeamId: string,
  awayTeamId: string,
  standings: GroupStandingRow[],
  groupCode: string | null,
  homeName?: string,
  awayName?: string
): MotivationParams {
  const tier = leagueTierFromGroupCode(groupCode);
  const home = standings.find((r) => r.teamId === homeTeamId);
  const away = standings.find((r) => r.teamId === awayTeamId);
  const n = Math.max(standings.length, 3);

  let sigmaHome = 1;
  let sigmaAway = 1;
  let rhoOffset = 0;
  let scenario = "nl_league_phase";
  let stakesIndex = 1;

  if (home && away && home.played >= 1) {
    const homeCanPromo = home.rank === 1 || (tier !== "A" && home.rank <= 2);
    const awayCanPromo = away.rank === 1 || (tier !== "A" && away.rank <= 2);
    const homeRelegationRisk =
      (tier === "A" || tier === "B" || tier === "C") && home.rank >= n - 1;
    const awayRelegationRisk =
      (tier === "A" || tier === "B" || tier === "C") && away.rank >= n - 1;

    if (homeCanPromo || homeRelegationRisk) {
      sigmaHome = 1.04;
      stakesIndex = Math.max(stakesIndex, 1.35);
    }
    if (awayCanPromo || awayRelegationRisk) {
      sigmaAway = 1.04;
      stakesIndex = Math.max(stakesIndex, 1.35);
    }

    const gamesLeft = Math.max(0, (n - 1) * 2 - home.played);
    if (gamesLeft <= 1 && home.rank > 2 && !homeRelegationRisk) {
      sigmaHome = Math.min(sigmaHome, 0.94);
      scenario = "nl_dead_rubber";
      stakesIndex = 0.7;
    }
    if (gamesLeft <= 1 && away.rank > 2 && !awayRelegationRisk) {
      sigmaAway = Math.min(sigmaAway, 0.94);
      scenario = "nl_dead_rubber";
      stakesIndex = 0.7;
    }

    if (homeCanPromo && awayCanPromo) {
      scenario = "nl_promotion_clash";
      rhoOffset = -0.02;
    } else if (homeRelegationRisk && awayRelegationRisk) {
      scenario = "nl_relegation_six_pointer";
      rhoOffset = -0.03;
    }
  }

  void homeName;
  void awayName;

  return {
    sigmaHome,
    sigmaAway,
    rhoOffset,
    scenario,
    stakesIndex,
  };
}
