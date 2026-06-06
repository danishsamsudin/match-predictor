import { ensureFifaRankingsLoaded } from "@/lib/data/fifa-rankings-store";
import { loadProcessMetricsForTeam } from "@/lib/data/match-process-metrics";
import { normalizeNationalTeamName } from "@/lib/data/world-cup-2026-teams";
import { tryCreateServiceClient } from "@/lib/supabase";
import { enrichFormMatchesWithProcessMetrics } from "@/lib/world-cup/enrich-form-process-metrics";
import { GRAHAM_MODEL_VERSION } from "@/lib/world-cup/graham-model-config";
import { resolveGrahamExpectedGoals } from "@/lib/world-cup/graham-expected-goals";
import {
  loadInternationalFormMatchesForTeam,
  type InternationalFormMatch,
} from "@/lib/world-cup/load-international-form";
import {
  loadMedianSquadValueForWcTeams,
  resolveSquadTalentSnapshot,
} from "@/lib/world-cup/national-squad-talent";
import type { MotivationParams } from "@/lib/world-cup/motivation";
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

function resolveHostNationXgBoost(matchCity: string | null, homeName: string): number {
  const city = (matchCity ?? "").toLowerCase();
  const home = normalizeNationalTeamName(homeName).toLowerCase();
  if (home.includes("mexico") && city.includes("mexico")) return 1.05;
  if (home.includes("united states") && (city.includes("usa") || city.includes("york") || city.includes("angeles"))) {
    return 1.04;
  }
  if (home.includes("canada") && (city.includes("toronto") || city.includes("vancouver"))) {
    return 1.04;
  }
  return 1;
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

async function loadEnrichedFormForTeam(
  supabase: NonNullable<ReturnType<typeof tryCreateServiceClient>>,
  teamId: string,
  teamName: string,
  finishedMatches: WcMatchRow[]
): Promise<InternationalFormMatch[]> {
  const [form, metrics] = await Promise.all([
    loadInternationalFormMatchesForTeam(supabase, teamId, teamName, { limit: 60 }),
    loadProcessMetricsForTeam(supabase, resolveApiTeamId(teamId, teamName), 120),
  ]);

  const finalsSlice = wcFinalsFormSlice(teamId, finishedMatches);
  const merged = [...form];
  const keys = new Set(form.map((m) => `${m.date}|${m.home_team_id}|${m.away_team_id}`));
  for (const row of finalsSlice) {
    const key = `${row.date}|${row.home_team_id}|${row.away_team_id}`;
    if (!keys.has(key)) merged.push(row);
  }

  return enrichFormMatchesWithProcessMetrics(merged, metrics);
}

export async function runGrahamWorldCupPredict(input: {
  match: WcMatchRow;
  homeName: string;
  awayName: string;
  finishedMatches: WcMatchRow[];
  motivation: MotivationParams;
  priorHomeVenueTz: string | null;
  priorAwayVenueTz: string | null;
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
  const deduped = [...new Map(allForm.map((m) => [`${m.date}|${m.home_team_id}|${m.away_team_id}`, m])).values()];

  const [homeTalent, awayTalent] = await Promise.all([
    resolveSquadTalentSnapshot(homeTeamId, homeName, medianTalent),
    resolveSquadTalentSnapshot(awayTeamId, awayName, medianTalent),
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
  });

  const venue = resolveStadiumVenue(match.venue_city ?? null);
  const altitude = match.venue_altitude_meters ?? venue?.altitude_meters ?? 0;
  const destTz = venue?.timezone ?? "America/New_York";

  const deltaHome = computeFinalDelta(match.rest_hours_home, input.priorHomeVenueTz, destTz);
  const deltaAway = computeFinalDelta(match.rest_hours_away, input.priorAwayVenueTz, destTz);
  const gammaHome = gammaAltitude(altitude);
  const gammaAway = gammaAltitude(altitude);
  const hostBoost = resolveHostNationXgBoost(match.venue_city ?? venue?.city ?? null, homeName);

  let homeXg =
    baseline.homeXg * gammaHome * deltaHome * motivation.sigmaHome * hostBoost;
  let awayXg = baseline.awayXg * gammaAway * deltaAway * motivation.sigmaAway;

  const rhoBase =
    resolveInternationalScoreCorrelation(homeXg, awayXg, baseline.snapshot.delta_fifa as number) +
    motivation.rhoOffset;
  const rho = attenuateRhoForExpectedGoalGap(rhoBase, homeXg, awayXg);
  const mutualDraw = motivation.scenario.includes("mutual_draw");

  const outcomes = outcomesFromGuardedGrid(homeXg, awayXg, rho, mutualDraw);
  const grid = buildGuardedScoreMatrix(homeXg, awayXg, rho, mutualDraw);

  return {
    home_win_pct: Number(outcomes.homeWin.toFixed(4)),
    draw_pct: Number(outcomes.draw.toFixed(4)),
    away_win_pct: Number(outcomes.awayWin.toFixed(4)),
    predicted_score_home: outcomes.predictedHome,
    predicted_score_away: outcomes.predictedAway,
    under_2_5_pct: Number(outcomes.under25.toFixed(4)),
    over_2_5_pct: Number(outcomes.over25.toFixed(4)),
    model_version: GRAHAM_MODEL_VERSION,
    snapshot: {
      source: "graham-wc-hub",
      lambda: homeXg,
      mu: awayXg,
      home_xg: homeXg,
      away_xg: awayXg,
      rho,
      rho_base: rhoBase,
      gamma_home: gammaHome,
      gamma_away: gammaAway,
      host_nation_boost: hostBoost,
      delta_final_home: deltaHome,
      delta_final_away: deltaAway,
      sigma_home: motivation.sigmaHome,
      sigma_away: motivation.sigmaAway,
      scenario: motivation.scenario,
      grid_renormalized: grid.renormalized,
      home_form_match_count: homeForm.length,
      away_form_match_count: awayForm.length,
      home_talent_eur: homeTalent.squadValueEur,
      away_talent_eur: awayTalent.squadValueEur,
      ...baseline.snapshot,
    },
  };
}
