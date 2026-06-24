import { ensureFifaRankingsLoaded } from "@/lib/data/fifa-rankings-store";
import { tryCreateServiceClient } from "@/lib/supabase";
import { GRAHAM_1X2_TEMPERATURE, GRAHAM_MODEL_VERSION } from "@/lib/world-cup/graham-model-config";
import { loadWcCalibrationConfig } from "@/lib/world-cup/wc-calibration-config";
import { loadWcInTournamentFormNudges } from "@/lib/world-cup/graham-wc-in-tournament-form";
import { applyWcModelXiToHubPrediction } from "@/lib/world-cup/wc-hub-model-xi";
import { resolveGrahamExpectedGoals } from "@/lib/world-cup/graham-expected-goals";
import {
  computeTeamProcessProfile,
} from "@/lib/world-cup/graham-process-features";
import { loadWcOptaEventCalibration } from "@/lib/world-cup/wc-opta-event-calibration";
import { loadEnrichedFormForTeam } from "@/lib/world-cup/load-enriched-international-form";
import { canonicalInternationalFormMatchKey } from "@/lib/world-cup/international-form-team-side";
import {
  loadMedianSquadValueForWcTeams,
  resolveSquadTalentSnapshot,
} from "@/lib/world-cup/national-squad-talent";
import type { MotivationParams } from "@/lib/world-cup/motivation";
import {
  buildMotivationFeatureSnapshot,
  encodeStakesIndex,
  isMatchday3Fixture,
  resolveHostMotivationBoost,
  resolveHostNationXgBoost,
} from "@/lib/world-cup/motivation";
import { computeLowBlockIndicesForFixture } from "@/lib/world-cup/wc-low-block-index";
import { resolveInternationalScoreCorrelation } from "@/lib/world-cup/international-strength";
import {
  attenuateRhoForExpectedGoalGap,
  buildGuardedScoreMatrix,
  outcomesFromGuardedGrid,
} from "@/lib/world-cup/score-grid";
import {
  computeFinalDelta,
  resolveStadiumVenue,
} from "@/lib/world-cup/stadium-metadata";
import { resolveApiTeamId } from "@/lib/world-cup/resolve-api-team-id";
import type { WcMatchRow } from "@/lib/world-cup/standings";
import type { HubPredictionRow } from "@/lib/world-cup/hub-main-predict";

function gammaAltitude(venueAltitude: number): number {
  if (venueAltitude <= 1500) return 1;
  return 0.96;
}

function temper1x2Probs(
  homeWin: number,
  draw: number,
  awayWin: number,
  tau = GRAHAM_1X2_TEMPERATURE
): { homeWin: number; draw: number; awayWin: number } {
  const h = Math.pow(homeWin, tau);
  const d = Math.pow(draw, tau);
  const a = Math.pow(awayWin, tau);
  const sum = h + d + a || 1;
  return { homeWin: h / sum, draw: d / sum, awayWin: a / sum };
}

export async function runGrahamWorldCupPredict(input: {
  match: WcMatchRow;
  homeName: string;
  awayName: string;
  finishedMatches: WcMatchRow[];
  motivation: MotivationParams;
  priorHomeVenueTz: string | null;
  priorAwayVenueTz: string | null;
  applyModelXi?: boolean;
}): Promise<HubPredictionRow | null> {
  await ensureFifaRankingsLoaded();

  const supabase = tryCreateServiceClient();
  if (!supabase) return null;

  const { match, homeName, awayName, finishedMatches, motivation } = input;
  const homeId = match.home_team_id!;
  const awayId = match.away_team_id!;
  const homeTeamId = resolveApiTeamId(homeId, homeName);
  const awayTeamId = resolveApiTeamId(awayId, awayName);

  const [homeForm, awayForm, medianTalent] = await Promise.all([
    loadEnrichedFormForTeam(supabase, homeId, homeName, finishedMatches),
    loadEnrichedFormForTeam(supabase, awayId, awayName, finishedMatches),
    loadMedianSquadValueForWcTeams(),
  ]);

  const allForm = [...homeForm, ...awayForm];
  const deduped = [
    ...new Map(allForm.map((m) => [canonicalInternationalFormMatchKey(m), m])).values(),
  ];

  const calibration = await loadWcCalibrationConfig();
  const optaEventCal = loadWcOptaEventCalibration();
  const homeStyle = optaEventCal.teamStyles.get(homeTeamId);
  const awayStyle = optaEventCal.teamStyles.get(awayTeamId);
  const homeProcessProfile = computeTeamProcessProfile(homeId, homeForm, Date.now(), homeName);
  const awayProcessProfile = computeTeamProcessProfile(awayId, awayForm, Date.now(), awayName);

  const [homeTalent, awayTalent, homeWcForm, awayWcForm] = await Promise.all([
    resolveSquadTalentSnapshot(homeTeamId, homeName, medianTalent),
    resolveSquadTalentSnapshot(awayTeamId, awayName, medianTalent),
    loadWcInTournamentFormNudges(supabase, homeTeamId, calibration),
    loadWcInTournamentFormNudges(supabase, awayTeamId, calibration),
  ]);

  const baseline = resolveGrahamExpectedGoals({
    homeTeamId,
    awayTeamId,
    homeName,
    awayName,
    homeFormMatches: homeForm,
    awayFormMatches: awayForm,
    allFormMatches: deduped,
    homeTalent,
    awayTalent,
    medianSquadValueEur: medianTalent,
    calibration,
    wcForm: { home: homeWcForm, away: awayWcForm },
    optaStyleExtras: {
      physicality_index:
        ((homeStyle?.physicalityIndex ?? homeProcessProfile.pressingIntensity) +
          (awayStyle?.physicalityIndex ?? awayProcessProfile.pressingIntensity)) /
        2,
      wide_play_index: (homeStyle?.widePlayIndex ?? 1) - (awayStyle?.widePlayIndex ?? 1),
      referee_strictness: 0,
    },
  });

  const venue = resolveStadiumVenue(match.venue_city ?? null);
  const altitude = match.venue_altitude_meters ?? venue?.altitude_meters ?? 0;
  const destTz = venue?.timezone ?? "America/New_York";

  const deltaHome = computeFinalDelta(match.rest_hours_home, input.priorHomeVenueTz, destTz);
  const deltaAway = computeFinalDelta(match.rest_hours_away, input.priorAwayVenueTz, destTz);
  const gammaHome = gammaAltitude(altitude);
  const gammaAway = gammaAltitude(altitude);
  const hostBoost = resolveHostNationXgBoost(match.venue_city ?? venue?.city ?? null, homeName);
  const hostMotivation = resolveHostMotivationBoost(match.venue_city ?? venue?.city ?? null, homeName);
  const stakesIndex = encodeStakesIndex({
    isKnockout: !match.group_code,
    isMatchday3:
      isMatchday3Fixture(homeId, finishedMatches) ||
      isMatchday3Fixture(awayId, finishedMatches),
  });

  const effectiveSigmaHome = motivation.sigmaHome * hostMotivation;

  let homeXg =
    baseline.homeXg * gammaHome * deltaHome * effectiveSigmaHome * hostBoost;
  let awayXg = baseline.awayXg * gammaAway * deltaAway * motivation.sigmaAway;

  const rhoBase =
    resolveInternationalScoreCorrelation(homeXg, awayXg, baseline.snapshot.delta_fifa as number) +
    motivation.rhoOffset;
  const lowEvent =
    homeWcForm.avgChanceIndex < 1.2 &&
    awayWcForm.avgChanceIndex < 1.2 &&
    homeWcForm.matchCount > 0 &&
    awayWcForm.matchCount > 0;
  const rhoLowEventBoost = lowEvent ? calibration.wcLowEventRhoBoost : 0;
  const rho = attenuateRhoForExpectedGoalGap(rhoBase + rhoLowEventBoost, homeXg, awayXg);
  const mutualDraw = motivation.scenario.includes("mutual_draw");

  const [lowBlock] = await Promise.all([
    computeLowBlockIndicesForFixture({
      supabase,
      homeTeamApiId: homeTeamId,
      awayTeamApiId: awayTeamId,
    }),
  ]);

  const motivationFeatures = buildMotivationFeatureSnapshot({
    motivation: { ...motivation, hostMotivationHome: hostMotivation, stakesIndex },
    hostMotivationHome: hostMotivation,
    stakesIndex,
  });

  const outcomes = outcomesFromGuardedGrid(homeXg, awayXg, rho, mutualDraw);
  const tempered = temper1x2Probs(outcomes.homeWin, outcomes.draw, outcomes.awayWin);
  const grid = buildGuardedScoreMatrix(homeXg, awayXg, rho, mutualDraw);

  let hubRow: HubPredictionRow = {
    home_win_pct: Number(tempered.homeWin.toFixed(4)),
    draw_pct: Number(tempered.draw.toFixed(4)),
    away_win_pct: Number(tempered.awayWin.toFixed(4)),
    predicted_score_home: outcomes.predictedHome,
    predicted_score_away: outcomes.predictedAway,
    under_2_5_pct: Number(outcomes.under25.toFixed(4)),
    over_2_5_pct: Number(outcomes.over25.toFixed(4)),
    model_version: calibration.modelVersion ?? GRAHAM_MODEL_VERSION,
    snapshot: {
      source: "graham-wc-hub",
      lambda: homeXg,
      mu: awayXg,
      home_xg: homeXg,
      away_xg: awayXg,
      rho,
      rho_base: rhoBase,
      rho_low_event_boost: rhoLowEventBoost,
      gamma_home: gammaHome,
      gamma_away: gammaAway,
      host_nation_boost: hostBoost,
      delta_final_home: deltaHome,
      delta_final_away: deltaAway,
      sigma_home: effectiveSigmaHome,
      sigma_away: motivation.sigmaAway,
      host_motivation_home: hostMotivation,
      stakes_index: stakesIndex,
      scenario: motivation.scenario,
      motivation_features: motivationFeatures,
      expected_total_xg: homeXg + awayXg,
      grid_renormalized: grid.renormalized,
      top_scorelines: outcomes.topScorelines,
      home_form_match_count: homeForm.length,
      away_form_match_count: awayForm.length,
      home_talent_eur: homeTalent.squadValueEur,
      away_talent_eur: awayTalent.squadValueEur,
      ...baseline.snapshot,
      opta_features: {
        ...((baseline.snapshot.opta_features as Record<string, unknown>) ?? {}),
        ...lowBlock,
        ...motivationFeatures,
      },
    },
  };

  if (input.applyModelXi !== false) {
    hubRow = await applyWcModelXiToHubPrediction({
      supabase,
      hubRow,
      homeTeamApiId: homeTeamId,
      awayTeamApiId: awayTeamId,
      homeTeamName: homeName,
      awayTeamName: awayName,
      calibration,
    });
  }

  return hubRow;
}
