import { buildNationalTeamStatAverages } from "@/lib/data/national-team-stats";
import {
  computeEstimatedMatchStats,
  type EstimatedMatchStats,
} from "@/lib/prediction/estimated-match-stats";
import type { TeamStatAverages } from "@/lib/types/prediction";
import {
  computeInternationalRatesFromMatches,
  resolveFifaRatingDelta,
  type InternationalTeamRates,
} from "@/lib/world-cup/international-strength";
import type { InternationalFormMatch } from "@/lib/world-cup/load-international-form";
import {
  loadWcOptaEventCalibration,
  type WcTeamEventRates,
  type WcTeamStyleProfile,
  type WcTournamentEventCalibration,
} from "@/lib/world-cup/wc-opta-event-calibration";
import type { WcMatchRow } from "@/lib/world-cup/standings";
import type { MlEventModelCoeffs, WcCalibrationConstants } from "@/lib/world-cup/wc-calibration-config";

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function wcFinalsFormSlice(teamId: string, finishedMatches: WcMatchRow[]): InternationalFormMatch[] {
  return finishedMatches
    .filter(
      (m) =>
        m.home_goals != null &&
        m.away_goals != null &&
        (m.home_team_id === teamId || m.away_team_id === teamId)
    )
    .map((m) => ({
      date: m.date,
      home_team_id: m.home_team_id,
      away_team_id: m.away_team_id,
      home_goals: m.home_goals,
      away_goals: m.away_goals,
      competition: m.competition ?? "FIFA World Cup 2026",
      home_team_name: m.home_team_name,
      away_team_name: m.away_team_name,
    }));
}

function blendTowardTournament(
  teamRate: number,
  tournamentPerTeam: number,
  weight: number
): number {
  const w = clamp(weight, 0, 0.45);
  return teamRate * (1 - w) + tournamentPerTeam * w;
}

function buildWcTeamStatAverages(input: {
  rates: InternationalTeamRates;
  teamApiId: number;
  teamName: string;
  wcTeamRates: WcTeamEventRates | null;
  wcTeamStyle: WcTeamStyleProfile | null;
  calibration: WcTournamentEventCalibration;
}): TeamStatAverages {
  const base = buildNationalTeamStatAverages(input.rates, input.teamApiId, input.teamName);
  const tournamentWeight = input.calibration.sampleCount > 0 ? 0.22 : 0.12;
  const perTeamCorners = input.calibration.avgCornersPerMatch / 2;
  const perTeamFouls = input.calibration.avgFoulsPerMatch / 2;
  const perTeamYellow = input.calibration.avgYellowPerMatch / 2;
  const perTeamRed = input.calibration.avgRedPerMatch / 2;
  const perTeamSot = input.calibration.avgShotsOnTargetPerMatch / 2;

  let stats: TeamStatAverages = {
    ...base,
    corners: blendTowardTournament(base.corners, perTeamCorners, tournamentWeight),
    fouls: blendTowardTournament(base.fouls, perTeamFouls, tournamentWeight),
    yellowCards: blendTowardTournament(base.yellowCards, perTeamYellow, tournamentWeight),
    redCards: blendTowardTournament(base.redCards, perTeamRed, tournamentWeight * 0.8),
    shotsOnTarget: blendTowardTournament(base.shotsOnTarget, perTeamSot, tournamentWeight),
  };

  if (input.wcTeamRates && input.wcTeamRates.games > 0) {
    const wcWeight = clamp(input.wcTeamRates.games * 0.34, 0.25, 0.72);
    stats = {
      ...stats,
      corners:
        stats.corners * (1 - wcWeight) + input.wcTeamRates.cornersPerGame * wcWeight,
      fouls:
        stats.fouls * (1 - wcWeight) +
        (input.wcTeamRates.foulsPerGame > 0
          ? input.wcTeamRates.foulsPerGame
          : stats.fouls) *
          wcWeight,
      yellowCards:
        stats.yellowCards * (1 - wcWeight) + input.wcTeamRates.yellowPerGame * wcWeight,
      redCards:
        stats.redCards * (1 - wcWeight) + input.wcTeamRates.redPerGame * wcWeight,
      shotsOnTarget:
        stats.shotsOnTarget * (1 - wcWeight) +
        (input.wcTeamStyle?.shotsOnTargetPerGame ?? stats.shotsOnTarget) * wcWeight,
    };
  }

  if (input.wcTeamStyle && input.wcTeamStyle.games > 0) {
    const style = input.wcTeamStyle;
    stats = {
      ...stats,
      corners: round1(stats.corners * (0.82 + 0.18 * style.widePlayIndex)),
      fouls: round1(stats.fouls * (0.84 + 0.16 * style.physicalityIndex)),
      yellowCards: round1(
        stats.yellowCards * (0.86 + 0.14 * style.physicalityIndex)
      ),
      redCards: round1(
        stats.redCards * (0.88 + 0.12 * style.physicalityIndex)
      ),
      shotsOnTarget: round1(
        stats.shotsOnTarget * (0.8 + 0.2 * (style.shotsOnTargetPerGame / Math.max(3.5, perTeamSot)))
      ),
    };
  }

  return {
    ...stats,
    corners: round1(Math.max(3.2, stats.corners)),
    fouls: round1(Math.max(8.5, stats.fouls)),
    yellowCards: round1(Math.max(0.6, stats.yellowCards)),
    redCards: round1(Math.max(0.02, stats.redCards)),
    shotsOnTarget: round1(Math.max(2.5, stats.shotsOnTarget)),
  };
}

function styleMatchupMultipliers(input: {
  homeStyle: WcTeamStyleProfile | null;
  awayStyle: WcTeamStyleProfile | null;
}): { corners: number; fouls: number; cards: number } {
  const home = input.homeStyle;
  const away = input.awayStyle;
  if (!home && !away) {
    return { corners: 1, fouls: 1, cards: 1 };
  }

  const wide =
    ((home?.widePlayIndex ?? 1) + (away?.widePlayIndex ?? 1)) / (home && away ? 2 : 1);
  const physical =
    ((home?.physicalityIndex ?? 1) + (away?.physicalityIndex ?? 1)) /
    (home && away ? 2 : 1);
  const press =
    ((home?.pressIntensityIndex ?? 1) + (away?.pressIntensityIndex ?? 1)) /
    (home && away ? 2 : 1);

  const styleClash =
    home && away
      ? Math.abs(home.physicalityIndex - away.physicalityIndex) / 0.35
      : 0;

  return {
    corners: clamp(0.88 + 0.14 * wide, 0.85, 1.22),
    fouls: clamp(0.9 + 0.12 * physical + 0.06 * press + 0.04 * styleClash, 0.88, 1.28),
    cards: clamp(0.9 + 0.1 * physical + 0.05 * styleClash, 0.88, 1.25),
  };
}

function poissonMlEstimate(
  homeXg: number,
  awayXg: number,
  coeffs: MlEventModelCoeffs,
  context: { isKnockout: boolean; physicality: number; refereeStrictness: number }
): number {
  const logRate =
    coeffs.intercept +
    coeffs.totalXgSlope * (homeXg + awayXg) +
    coeffs.knockoutSlope * (context.isKnockout ? 1 : 0) +
    coeffs.physicalitySlope * context.physicality +
    coeffs.refereeStrictnessSlope * context.refereeStrictness;
  return Math.max(0.01, Math.exp(logRate));
}

const ESTIMATED_STAT_BOUNDS = {
  corners: { min: 4, max: 18 },
  fouls: { min: 16, max: 32 },
  yellowCards: { min: 1.5, max: 8 },
  redCards: { min: 0.05, max: 0.8 },
} as const;

export function clampEstimatedMatchStats(stats: EstimatedMatchStats): EstimatedMatchStats {
  return {
    corners: round1(
      clamp(stats.corners, ESTIMATED_STAT_BOUNDS.corners.min, ESTIMATED_STAT_BOUNDS.corners.max)
    ),
    fouls: round1(
      clamp(stats.fouls, ESTIMATED_STAT_BOUNDS.fouls.min, ESTIMATED_STAT_BOUNDS.fouls.max)
    ),
    yellowCards: round1(
      clamp(
        stats.yellowCards,
        ESTIMATED_STAT_BOUNDS.yellowCards.min,
        ESTIMATED_STAT_BOUNDS.yellowCards.max
      )
    ),
    redCards: round1(
      clamp(
        stats.redCards,
        ESTIMATED_STAT_BOUNDS.redCards.min,
        ESTIMATED_STAT_BOUNDS.redCards.max
      )
    ),
  };
}

function mlEventPriorFromCoeffs(
  homeXg: number,
  awayXg: number,
  calibration: WcCalibrationConstants,
  context: { isKnockout: boolean; physicality: number; refereeStrictness: number },
  tournamentRedFallback: number
): EstimatedMatchStats {
  const coeffs = calibration.eventModelCoeffs;
  const redCoeffs = coeffs.red ?? coeffs.yellow;
  return {
    corners: round1(poissonMlEstimate(homeXg, awayXg, coeffs.corners, context)),
    fouls: round1(poissonMlEstimate(homeXg, awayXg, coeffs.fouls, context)),
    yellowCards: round1(poissonMlEstimate(homeXg, awayXg, coeffs.yellow, context)),
    redCards: round1(
      coeffs.red
        ? poissonMlEstimate(homeXg, awayXg, redCoeffs, context)
        : Math.max(0.05, tournamentRedFallback)
    ),
  };
}

function tournamentPriorFromXg(
  homeXg: number,
  awayXg: number,
  calibration: WcTournamentEventCalibration
): EstimatedMatchStats {
  const totalXg = homeXg + awayXg;
  const corners = Math.max(
    5,
    calibration.cornersIntercept + calibration.cornersXgSlope * totalXg
  );
  const yellowCards = Math.max(
    1.8,
    calibration.yellowIntercept + calibration.yellowXgSlope * totalXg
  );
  const fouls = Math.max(
    18,
    calibration.foulsIntercept + calibration.foulsXgSlope * totalXg
  );
  const redCards = Math.max(0.06, calibration.redIntercept);

  return {
    corners: round1(corners),
    fouls: round1(fouls),
    yellowCards: round1(yellowCards),
    redCards: round1(redCards),
  };
}

function blendEstimates(
  model: EstimatedMatchStats,
  prior: EstimatedMatchStats,
  calibrationSampleCount: number
): EstimatedMatchStats {
  const priorWeight = clamp(0.18 + calibrationSampleCount * 0.06, 0.18, 0.42);
  const modelWeight = 1 - priorWeight;

  return {
    corners: round1(model.corners * modelWeight + prior.corners * priorWeight),
    fouls: round1(model.fouls * modelWeight + prior.fouls * priorWeight),
    yellowCards: round1(model.yellowCards * modelWeight + prior.yellowCards * priorWeight),
    redCards: round1(model.redCards * modelWeight + prior.redCards * priorWeight),
  };
}

export interface ComputeWcEstimatedMatchStatsInput {
  homeTeamApiId: number;
  awayTeamApiId: number;
  homeName: string;
  awayName: string;
  homeDbTeamId: string;
  awayDbTeamId: string;
  homeXg: number;
  awayXg: number;
  homeFormMatches?: InternationalFormMatch[];
  awayFormMatches?: InternationalFormMatch[];
  finishedMatches?: WcMatchRow[];
  calibration?: WcCalibrationConstants;
  isKnockout?: boolean;
  refereeStrictness?: number;
}

/**
 * World Cup secondary-event estimates: stylistic national-team model blended with
 * Opta-observed tournament rates and xG-linked priors from completed WC matches.
 */
export function computeWcEstimatedMatchStats(
  input: ComputeWcEstimatedMatchStatsInput
): EstimatedMatchStats {
  const calibration = loadWcOptaEventCalibration();
  const finished = input.finishedMatches ?? [];

  const homeForm =
    input.homeFormMatches ??
    wcFinalsFormSlice(input.homeDbTeamId, finished);
  const awayForm =
    input.awayFormMatches ??
    wcFinalsFormSlice(input.awayDbTeamId, finished);

  const homeRates = computeInternationalRatesFromMatches(
    input.homeDbTeamId,
    homeForm,
    Date.now(),
    input.homeName
  );
  const awayRates = computeInternationalRatesFromMatches(
    input.awayDbTeamId,
    awayForm,
    Date.now(),
    input.awayName
  );

  const homeStats = buildWcTeamStatAverages({
    rates: homeRates,
    teamApiId: input.homeTeamApiId,
    teamName: input.homeName,
    wcTeamRates: calibration.teamRates.get(input.homeTeamApiId) ?? null,
    wcTeamStyle: calibration.teamStyles.get(input.homeTeamApiId) ?? null,
    calibration,
  });
  const awayStats = buildWcTeamStatAverages({
    rates: awayRates,
    teamApiId: input.awayTeamApiId,
    teamName: input.awayName,
    wcTeamRates: calibration.teamRates.get(input.awayTeamApiId) ?? null,
    wcTeamStyle: calibration.teamStyles.get(input.awayTeamApiId) ?? null,
    calibration,
  });

  const fifaRatingDelta = resolveFifaRatingDelta(
    input.homeTeamApiId,
    input.awayTeamApiId,
    input.homeName,
    input.awayName
  );

  const model = computeEstimatedMatchStats({
    homeStats,
    awayStats,
    homeXg: input.homeXg,
    awayXg: input.awayXg,
    fifaRatingDelta,
  });

  const prior = input.calibration?.eventModelCoeffs
    ? mlEventPriorFromCoeffs(
        input.homeXg,
        input.awayXg,
        input.calibration,
        {
          isKnockout: input.isKnockout ?? false,
          physicality:
            ((calibration.teamStyles.get(input.homeTeamApiId)?.physicalityIndex ?? 1) +
              (calibration.teamStyles.get(input.awayTeamApiId)?.physicalityIndex ?? 1)) /
            2,
          refereeStrictness: input.refereeStrictness ?? 1,
        },
        tournamentPriorFromXg(input.homeXg, input.awayXg, calibration).redCards
      )
    : tournamentPriorFromXg(input.homeXg, input.awayXg, calibration);
  const blended = blendEstimates(model, prior, calibration.sampleCount);
  const style = styleMatchupMultipliers({
    homeStyle: calibration.teamStyles.get(input.homeTeamApiId) ?? null,
    awayStyle: calibration.teamStyles.get(input.awayTeamApiId) ?? null,
  });

  return clampEstimatedMatchStats({
    corners: round1(blended.corners * style.corners),
    fouls: round1(blended.fouls * style.fouls),
    yellowCards: round1(blended.yellowCards * style.cards),
    redCards: round1(blended.redCards * style.cards),
  });
}
