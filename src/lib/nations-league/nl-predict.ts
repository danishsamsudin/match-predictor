import { ensureFifaRankingsLoaded } from "@/lib/data/fifa-rankings-store";
import { NATIONS_LEAGUE_2026_TEAMS } from "@/lib/data/nations-league-2026-teams";
import { applyNlFormWeights } from "@/lib/nations-league/nl-form-weights";
import { loadNlCalibrationConfig } from "@/lib/nations-league/nl-calibration-config";
import {
  congestionRotationIndex,
  filterMatchesInSameWindow,
  restDaysInWindow,
} from "@/lib/nations-league/nl-competition-window";
import { loadNlInCompetitionFormNudges } from "@/lib/nations-league/nl-in-competition-form";
import { resolveNlFixtureMotivation } from "@/lib/nations-league/motivation";
import {
  NL_GRAHAM_1X2_TEMPERATURE,
  NL_GRAHAM_MODEL_VERSION,
  NL_HOME_ADVANTAGE,
} from "@/lib/nations-league/nl-graham-model-config";
import { tryCreateServiceClient } from "@/lib/supabase";
import { resolveGrahamExpectedGoals } from "@/lib/world-cup/graham-expected-goals";
import { computeTeamProcessProfile } from "@/lib/world-cup/graham-process-features";
import { loadEnrichedFormForTeam } from "@/lib/world-cup/load-enriched-international-form";
import { canonicalInternationalFormMatchKey } from "@/lib/world-cup/international-form-team-side";
import {
  loadMedianSquadValueForWcTeams,
  resolveSquadTalentSnapshot,
} from "@/lib/world-cup/national-squad-talent";
import { resolveApiTeamId } from "@/lib/world-cup/resolve-api-team-id";
import { resolveInternationalScoreCorrelation } from "@/lib/world-cup/international-strength";
import {
  attenuateRhoForExpectedGoalGap,
  buildGuardedScoreMatrix,
  outcomesFromGuardedGrid,
  resolveEffectiveOverdispersionK,
} from "@/lib/world-cup/score-grid";
import { applyRotationAndLineupSigma } from "@/lib/world-cup/motivation";
import type { HubPredictionRow } from "@/lib/world-cup/hub-main-predict";
import type { GroupStandingRow, WcMatchRow } from "@/lib/world-cup/standings";

function temper1x2Probs(
  homeWin: number,
  draw: number,
  awayWin: number,
  tau = NL_GRAHAM_1X2_TEMPERATURE
): { homeWin: number; draw: number; awayWin: number } {
  const h = Math.pow(homeWin, tau);
  const d = Math.pow(draw, tau);
  const a = Math.pow(awayWin, tau);
  const sum = h + d + a || 1;
  return { homeWin: h / sum, draw: d / sum, awayWin: a / sum };
}

async function loadMedianSquadValueForNlTeams(): Promise<number> {
  const values: number[] = [];
  for (const team of NATIONS_LEAGUE_2026_TEAMS) {
    const snap = await resolveSquadTalentSnapshot(team.id, team.name);
    if (snap.squadValueEur > 0) values.push(snap.squadValueEur);
  }
  if (!values.length) return loadMedianSquadValueForWcTeams();
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)] ?? 120_000_000;
}

/** @deprecated Prefer `NL_HOME_ADVANTAGE` from nl-graham-model-config. */
export { NL_HOME_ADVANTAGE };

export async function runNlGrahamPredict(input: {
  match: WcMatchRow;
  homeName: string;
  awayName: string;
  finishedMatches: WcMatchRow[];
  standings?: GroupStandingRow[];
}): Promise<HubPredictionRow | null> {
  await ensureFifaRankingsLoaded();
  const supabase = tryCreateServiceClient();
  if (!supabase) return null;

  const { match, homeName, awayName, finishedMatches } = input;
  const homeId = match.home_team_id!;
  const awayId = match.away_team_id!;
  const homeTeamId = resolveApiTeamId(homeId, homeName);
  const awayTeamId = resolveApiTeamId(awayId, awayName);
  if (!homeTeamId || !awayTeamId) return null;

  const motivation = resolveNlFixtureMotivation(
    homeId,
    awayId,
    input.standings ?? [],
    match.group_code,
    homeName,
    awayName
  );

  const [homeFormRaw, awayFormRaw, medianTalent] = await Promise.all([
    loadEnrichedFormForTeam(supabase, homeId, homeName, finishedMatches),
    loadEnrichedFormForTeam(supabase, awayId, awayName, finishedMatches),
    loadMedianSquadValueForNlTeams(),
  ]);

  const homeForm = applyNlFormWeights(homeFormRaw);
  const awayForm = applyNlFormWeights(awayFormRaw);
  const allForm = [...homeForm, ...awayForm];
  const deduped = [
    ...new Map(allForm.map((m) => [canonicalInternationalFormMatchKey(m), m])).values(),
  ];

  const calibration = await loadNlCalibrationConfig();
  const homeProcessProfile = computeTeamProcessProfile(homeId, homeForm, Date.now(), homeName);
  const awayProcessProfile = computeTeamProcessProfile(awayId, awayForm, Date.now(), awayName);

  const [homeTalent, awayTalent, homeNlForm, awayNlForm] = await Promise.all([
    resolveSquadTalentSnapshot(homeTeamId, homeName, medianTalent),
    resolveSquadTalentSnapshot(awayTeamId, awayName, medianTalent),
    loadNlInCompetitionFormNudges({
      supabase,
      teamId: homeId,
      teamApiId: homeTeamId,
      teamName: homeName,
      fixtureDate: match.date,
      finishedMatches,
      calibration,
    }),
    loadNlInCompetitionFormNudges({
      supabase,
      teamId: awayId,
      teamApiId: awayTeamId,
      teamName: awayName,
      fixtureDate: match.date,
      finishedMatches,
      calibration,
    }),
  ]);

  const homeWindow = filterMatchesInSameWindow(
    finishedMatches,
    homeId,
    homeTeamId,
    match.date,
    { teamName: homeName }
  );
  const awayWindow = filterMatchesInSameWindow(
    finishedMatches,
    awayId,
    awayTeamId,
    match.date,
    { teamName: awayName }
  );
  const homeRestDays = restDaysInWindow(homeWindow, match.date);
  const awayRestDays = restDaysInWindow(awayWindow, match.date);
  const rotationIndexHome = congestionRotationIndex(homeRestDays);
  const rotationIndexAway = congestionRotationIndex(awayRestDays);

  const inWindow = homeNlForm.matchCount > 0 || awayNlForm.matchCount > 0;
  const fifaAnchorPullScale =
    motivation.scenario.includes("rotation") ||
    rotationIndexHome > 0.2 ||
    rotationIndexAway > 0.2
      ? 0.5
      : 1;

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
    // Reuse WC in-tournament form path; matchCount is window-scoped for NL.
    wcForm: { home: homeNlForm, away: awayNlForm },
    homeProcessProfile,
    awayProcessProfile,
    fifaAnchorPullScale,
  });

  const adjusted = applyRotationAndLineupSigma({
    sigmaHome: motivation.sigmaHome,
    sigmaAway: motivation.sigmaAway,
    rotationIndexHome,
    rotationIndexAway,
    scenario: motivation.scenario,
    stakesIndex: motivation.stakesIndex,
    md3MutualRotationPenaltyScale: calibration.md3MutualRotationPenaltyScale,
  });

  const homeAdvantage = calibration.homeAdvantage ?? NL_HOME_ADVANTAGE;
  const oneXTwoTemperature =
    calibration.oneXTwoTemperature ?? NL_GRAHAM_1X2_TEMPERATURE;

  let homeXg = baseline.homeXg * homeAdvantage * adjusted.sigmaHome;
  let awayXg = baseline.awayXg * adjusted.sigmaAway;

  const rhoBase =
    resolveInternationalScoreCorrelation(
      homeXg,
      awayXg,
      (baseline.snapshot.delta_fifa as number) ?? 0
    ) + motivation.rhoOffset;
  // Mirror WC: when both sides show low in-window chance creation, boost Dixon-Coles ρ
  // so 0-0 / 1-1 mass rises (NL league-phase draws were systematically underpriced).
  const lowEvent =
    homeNlForm.avgChanceIndex < 1.2 &&
    awayNlForm.avgChanceIndex < 1.2 &&
    homeNlForm.matchCount > 0 &&
    awayNlForm.matchCount > 0;
  const rhoLowEventBoost = lowEvent ? calibration.wcLowEventRhoBoost : 0;
  const rho = attenuateRhoForExpectedGoalGap(rhoBase + rhoLowEventBoost, homeXg, awayXg);

  const gridOptions = {
    goalOverdispersionK: resolveEffectiveOverdispersionK(
      homeXg,
      awayXg,
      calibration.goalOverdispersionK,
      homeNlForm.avgChanceIndex,
      awayNlForm.avgChanceIndex
    ),
    redCardMatchBaseProb: calibration.redCardMatchBaseProb,
    homeDisciplineLoad: homeNlForm.avgDisciplineLoad,
    awayDisciplineLoad: awayNlForm.avgDisciplineLoad,
    redCardAttackPenalty: calibration.redCardAttackPenalty,
    redCardOpponentBoost: calibration.redCardOpponentBoost,
  };

  const outcomes = outcomesFromGuardedGrid(homeXg, awayXg, rho, false, gridOptions);
  const tempered = temper1x2Probs(
    outcomes.homeWin,
    outcomes.draw,
    outcomes.awayWin,
    oneXTwoTemperature
  );
  const grid = buildGuardedScoreMatrix(homeXg, awayXg, rho, false, gridOptions);

  const talentDecayApplied =
    inWindow &&
    calibration.talentDecayPerMatch > 0 &&
    (homeNlForm.matchCount > 0 || awayNlForm.matchCount > 0);

  return {
    home_win_pct: Number(tempered.homeWin.toFixed(4)),
    draw_pct: Number(tempered.draw.toFixed(4)),
    away_win_pct: Number(tempered.awayWin.toFixed(4)),
    predicted_score_home: outcomes.predictedHome,
    predicted_score_away: outcomes.predictedAway,
    under_2_5_pct: Number(outcomes.under25.toFixed(4)),
    over_2_5_pct: Number(outcomes.over25.toFixed(4)),
    model_version: calibration.modelVersion ?? NL_GRAHAM_MODEL_VERSION,
    snapshot: {
      source: "graham-nl-hub",
      tournament: "nations-league-2026",
      ...baseline.snapshot,
      // Final HA / motivation-adjusted means must win over baseline λ/μ.
      home_xg: homeXg,
      away_xg: awayXg,
      lambda: homeXg,
      mu: awayXg,
      rho,
      rho_base: rhoBase,
      // Frozen so post-match recalibration can rebuild this exact line from the snapshot
      // alone, without re-deriving form, motivation, or discipline inputs.
      rho_low_event: lowEvent,
      rho_low_event_boost: rhoLowEventBoost,
      home_advantage: homeAdvantage,
      sigma_home: adjusted.sigmaHome,
      sigma_away: adjusted.sigmaAway,
      scenario: adjusted.scenario,
      stakes_index: motivation.stakesIndex,
      grid_renormalized: grid.renormalized,
      top_scorelines: outcomes.topScorelines,
      home_form_match_count: homeForm.length,
      away_form_match_count: awayForm.length,
      home_talent_eur: homeTalent.squadValueEur,
      away_talent_eur: awayTalent.squadValueEur,
      host_nation_boost: 1,
      talent_decay_applied: talentDecayApplied,
      nl_window_match_count_home: homeNlForm.matchCount,
      nl_window_match_count_away: awayNlForm.matchCount,
      nl_rest_days_home: homeRestDays,
      nl_rest_days_away: awayRestDays,
      rotation_index_home: rotationIndexHome,
      rotation_index_away: rotationIndexAway,
      one_x_two_temperature: oneXTwoTemperature,
      goal_overdispersion_k: gridOptions.goalOverdispersionK,
      red_card_match_base_prob: gridOptions.redCardMatchBaseProb,
      red_card_attack_penalty: gridOptions.redCardAttackPenalty,
      red_card_opponent_boost: gridOptions.redCardOpponentBoost,
      home_discipline_load: homeNlForm.avgDisciplineLoad,
      away_discipline_load: awayNlForm.avgDisciplineLoad,
      home_chance_index: homeNlForm.avgChanceIndex,
      away_chance_index: awayNlForm.avgChanceIndex,
      motivation_scenario: motivation.scenario,
      motivation_rho_offset: motivation.rhoOffset,
      motivation_sigma_home_base: motivation.sigmaHome,
      motivation_sigma_away_base: motivation.sigmaAway,
      motivation_standings_rows: input.standings?.length ?? 0,
    },
  };
}
