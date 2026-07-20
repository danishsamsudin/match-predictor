/**
 * Layer-2 goalkeeper features per player-match (Chapter 5).
 * Derived rates are stored on glpm_match_player_stats.payload.l2_gk
 * so the Python rating engine can load them alongside raw L1 columns.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../supabase";

type Client = SupabaseClient<Database>;
type PlayerRow = Database["public"]["Tables"]["glpm_match_player_stats"]["Row"];

export const PLAYER_GK_FEATURE_VERSION = "gk_v1";

function ratio(num: number | null | undefined, den: number | null | undefined): number | null {
  if (num == null || den == null || den === 0) return null;
  return num / den;
}

export type PlayerGkL2Features = {
  goals_prevented: number | null;
  psxg_save_pct: number | null;
  save_pct: number | null;
  cross_claim_success: number | null;
  punch_success_pct: number | null;
  cross_intervention_rate: number | null;
  aerial_command_index: number | null;
  pass_completion: number | null;
  pressure_pass_completion: number | null;
  progressive_pass_rate: number | null;
  progressive_distance_per_attempt: number | null;
  long_pass_accuracy: number | null;
  sweeper_intervention_rate: number | null;
  through_ball_prevention: number | null;
  avg_defensive_distance: number | null;
  proactive_defensive_index: number | null;
  penalty_save_pct: number | null;
  goals_prevented_from_penalties: number | null;
  feature_version: string;
  computed_at: string;
};

export function buildPlayerGkFeatures(row: PlayerRow): PlayerGkL2Features {
  const psxg = row.psxg_faced;
  const gc = row.goals_conceded;
  const saves = row.gk_saves;
  const sot = row.sot_faced;
  const claimsAtt = row.claims_attempted;
  const claimsOk = row.claims_successful;
  const punches = row.punches;
  const crosses = row.crosses_faced;
  const aerial = row.aerial_duels_won;
  const passes = row.passes;
  const passesOk = row.passes_completed;
  const longP = row.long_passes;
  const longOk = row.long_passes_completed;
  const prog = row.progressive_passes;
  const progDist = row.progressive_pass_distance;
  const pressP = row.passes_under_pressure;
  const pressOk = row.passes_under_pressure_completed;
  const outside = row.def_actions_outside_box;
  const recoveries = row.recoveries_outside_box;
  const through = row.through_ball_interceptions;
  const avgX = row.avg_defensive_action_x;
  const pensFaced = row.penalties_faced;
  const pensSaved = row.penalties_saved;
  const penPsxg = row.penalty_psxg_faced;

  const goalsPrevented =
    psxg != null && gc != null ? psxg - gc : null;

  const interventions =
    (claimsOk ?? 0) + (punches ?? 0) + (aerial ?? 0);

  return {
    goals_prevented: goalsPrevented,
    psxg_save_pct: ratio(psxg != null && gc != null ? psxg - gc : null, psxg) ??
      (psxg != null && psxg > 0 && gc != null ? 1 - gc / psxg : null),
    save_pct: ratio(saves, sot),
    cross_claim_success: ratio(claimsOk, claimsAtt),
    punch_success_pct: punches != null && punches > 0 ? 1.0 : punches === 0 ? 0 : null,
    cross_intervention_rate: ratio(interventions || null, crosses),
    aerial_command_index:
      crosses != null && crosses > 0
        ? ((claimsOk ?? 0) + (aerial ?? 0)) / crosses
        : null,
    pass_completion: ratio(passesOk, passes),
    pressure_pass_completion: ratio(pressOk, pressP),
    progressive_pass_rate: ratio(prog, passes),
    progressive_distance_per_attempt: ratio(progDist, prog),
    long_pass_accuracy: ratio(longOk, longP),
    sweeper_intervention_rate: outside,
    through_ball_prevention: through,
    avg_defensive_distance: avgX,
    proactive_defensive_index:
      outside != null || recoveries != null || through != null
        ? (outside ?? 0) + (recoveries ?? 0) + (through ?? 0)
        : null,
    penalty_save_pct: ratio(pensSaved, pensFaced),
    goals_prevented_from_penalties:
      penPsxg != null && pensFaced != null
        ? penPsxg - ((pensFaced - (pensSaved ?? 0)) as number)
        : null,
    feature_version: PLAYER_GK_FEATURE_VERSION,
    computed_at: new Date().toISOString(),
  };
}

export async function buildAndUpsertMatchPlayerGkFeatures(
  supabase: Client,
  args: { matchSmId: number }
): Promise<number> {
  const { data, error } = await supabase
    .from("glpm_match_player_stats")
    .select("*")
    .eq("match_sm_id", args.matchSmId)
    .eq("is_goalkeeper", true);
  if (error) throw new Error(`load GK player stats failed: ${error.message}`);
  if (!data?.length) return 0;

  let n = 0;
  for (const row of data) {
    const l2 = buildPlayerGkFeatures(row);
    const prev =
      row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
        ? (row.payload as Record<string, unknown>)
        : {};
    const { error: upErr } = await supabase
      .from("glpm_match_player_stats")
      .update({
        payload: { ...prev, l2_gk: l2 },
        synced_at: new Date().toISOString(),
      })
      .eq("match_sm_id", row.match_sm_id)
      .eq("player_sm_id", row.player_sm_id);
    if (upErr) throw new Error(`upsert player GK L2 failed: ${upErr.message}`);
    n += 1;
  }
  return n;
}
