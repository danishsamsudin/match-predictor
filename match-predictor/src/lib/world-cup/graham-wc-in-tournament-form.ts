import {
  opponentAdjustedCompositeMean,
  type TeamMatchComposite,
} from "@/lib/world-cup/wc-tournament-composites";
import type { WcCalibrationConstants } from "@/lib/world-cup/wc-calibration-config";
import type { GrahamProcessRates } from "@/lib/world-cup/graham-process-rates";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface WcInTournamentFormNudges {
  attackNudge: number;
  defenseNudge: number;
  finishingRegression: number;
  matchCount: number;
  avgChanceIndex: number;
  avgDefensiveSolidity: number;
}

const NEUTRAL: WcInTournamentFormNudges = {
  attackNudge: 1,
  defenseNudge: 1,
  finishingRegression: 0,
  matchCount: 0,
  avgChanceIndex: 1.5,
  avgDefensiveSolidity: 1.5,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function nudgeFromSignal(signal: number, weight: number, cap = 0.08): number {
  return clamp(1 + signal * weight, 1 - cap, 1 + cap);
}

export function applyWcFormToProcessRates(
  rates: GrahamProcessRates,
  nudges: WcInTournamentFormNudges,
  calibration?: WcCalibrationConstants
): GrahamProcessRates {
  if (nudges.matchCount < 1) return rates;

  const attackW = calibration?.wcAttackFormWeight ?? 0.35;
  const defenseW = calibration?.wcDefenseFormWeight ?? 0.35;

  const attack = clamp(rates.attack * nudges.attackNudge, 0.72, 1.28);
  const defense = clamp(rates.defense / nudges.defenseNudge, 0.72, 1.28);

  return {
    attack: 1 + (attack - 1) * attackW + (rates.attack - 1) * (1 - attackW),
    defense: 1 + (defense - 1) * defenseW + (rates.defense - 1) * (1 - defenseW),
    sample: rates.sample,
  };
}

export function computeWcFormNudgesFromComposites(
  composites: TeamMatchComposite[],
  calibration?: WcCalibrationConstants
): WcInTournamentFormNudges {
  if (!composites.length) return { ...NEUTRAL };

  const chance = opponentAdjustedCompositeMean(composites, "chanceIndex");
  const defense = opponentAdjustedCompositeMean(composites, "defensiveSolidity");
  const finishing = opponentAdjustedCompositeMean(composites, "finishingDelta");
  const territory = opponentAdjustedCompositeMean(composites, "territoryIndex");

  const attackSignal = chance * 0.12 + (territory - 0.5) * 0.25;
  const defenseSignal = defense * 0.1;
  const finishingW = calibration?.wcFinishingRegressionWeight ?? 0.15;
  const finishingRegression = clamp(-finishing * finishingW, -0.06, 0.06);

  return {
    attackNudge: nudgeFromSignal(attackSignal, 1),
    defenseNudge: nudgeFromSignal(defenseSignal, 1),
    finishingRegression,
    matchCount: composites.length,
    avgChanceIndex: chance,
    avgDefensiveSolidity: defense,
  };
}

export async function loadWcInTournamentFormNudges(
  supabase: SupabaseClient,
  teamApiId: number,
  calibration?: WcCalibrationConstants
): Promise<WcInTournamentFormNudges> {
  const { data: aggRows, error } = await supabase
    .from("world_cup_team_match_aggregates")
    .select(
      "match_id, team_api_id, side, chance_index, finishing_delta, defensive_solidity, territory_index, gk_save_index, discipline_load, opponent_strength, payload"
    )
    .eq("team_api_id", teamApiId);

  if (error || !aggRows?.length) return { ...NEUTRAL };

  const { data: matches } = await supabase
    .from("matches")
    .select("id")
    .eq("status", "finished")
    .or("competition.ilike.FIFA World Cup 2026%,competition.eq.World Cup");

  const wcMatchIds = new Set((matches ?? []).map((m) => String(m.id)));
  const composites: TeamMatchComposite[] = aggRows
    .filter((r) => wcMatchIds.has(String(r.match_id)))
    .map((r) => ({
      matchId: String(r.match_id),
      teamApiId: Number(r.team_api_id),
      side: r.side as "home" | "away",
      chanceIndex: Number(r.chance_index ?? 0),
      finishingDelta: Number(r.finishing_delta ?? 0),
      defensiveSolidity: Number(r.defensive_solidity ?? 0),
      territoryIndex: Number(r.territory_index ?? 0.5),
      gkSaveIndex: Number(r.gk_save_index ?? 0),
      disciplineLoad: Number(r.discipline_load ?? 0),
      opponentStrength: Number(r.opponent_strength ?? 1),
      payload: (r.payload as Record<string, unknown>) ?? {},
    }));

  return computeWcFormNudgesFromComposites(composites, calibration);
}

export function applyFinishingRegressionToXg(
  homeXg: number,
  awayXg: number,
  homeNudges: WcInTournamentFormNudges,
  awayNudges: WcInTournamentFormNudges
): { homeXg: number; awayXg: number } {
  return {
    homeXg: homeXg * (1 + homeNudges.finishingRegression),
    awayXg: awayXg * (1 + awayNudges.finishingRegression),
  };
}
