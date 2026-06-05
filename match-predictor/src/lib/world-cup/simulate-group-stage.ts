import { compareByKickoffAsc } from "@/lib/world-cup/sort-matches";
import {
  buildKnockoutProjection,
  buildThirdPlaceCandidates,
  computeAllGroupStandings,
  computeThirdPlaceWildcards,
  type GroupStandingRow,
  type WcMatchRow,
} from "@/lib/world-cup/standings";

export type GroupMatchPrediction = {
  predicted_score_home: number;
  predicted_score_away: number;
  homeXg?: number;
  awayXg?: number;
};

export type SimulatedGroupStageResult = {
  matches: WcMatchRow[];
  groupMatrix: Record<string, GroupStandingRow[]>;
  thirdPlaceRanking: ReturnType<typeof computeThirdPlaceWildcards>;
  knockoutProjection: ReturnType<typeof buildKnockoutProjection>;
  warnings: string[];
};

function isFinished(m: WcMatchRow): boolean {
  return (
    m.status === "finished" ||
    (m.home_goals != null && m.away_goals != null)
  );
}

/**
 * Deterministic group-stage forecast: pin real results, fill scheduled fixtures
 * from model predicted scores, then compute qualification.
 */
export function simulateGroupStage(input: {
  matches: WcMatchRow[];
  teamNames: Map<string, string>;
  predictionsByMatchId: Map<string, GroupMatchPrediction>;
  fairPlayByTeam?: Map<string, number>;
}): SimulatedGroupStageResult {
  const warnings: string[] = [];
  const fairPlay = input.fairPlayByTeam ?? new Map<string, number>();

  const sorted = [...input.matches].sort(compareByKickoffAsc);
  const simulated: WcMatchRow[] = sorted.map((m) => {
    if (isFinished(m)) {
      return {
        ...m,
        status: "finished",
        home_goals: m.home_goals ?? 0,
        away_goals: m.away_goals ?? 0,
      };
    }

    const pred = input.predictionsByMatchId.get(m.id);
    if (!pred) {
      warnings.push(
        `No prediction for group match ${m.id} (${m.home_team_name} vs ${m.away_team_name}); using 1-1`
      );
      return {
        ...m,
        status: "finished",
        home_goals: 1,
        away_goals: 1,
      };
    }

    return {
      ...m,
      status: "finished",
      home_goals: pred.predicted_score_home,
      away_goals: pred.predicted_score_away,
    };
  });

  const groupMatrix = computeAllGroupStandings(simulated, input.teamNames);
  const thirdCandidates = buildThirdPlaceCandidates(groupMatrix, fairPlay);
  const thirdPlaceRanking = computeThirdPlaceWildcards(thirdCandidates);
  const knockoutProjection = buildKnockoutProjection(thirdPlaceRanking, true);

  return {
    matches: simulated,
    groupMatrix,
    thirdPlaceRanking,
    knockoutProjection,
    warnings,
  };
}
