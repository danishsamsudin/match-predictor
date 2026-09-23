import {
  filterMatchesInSameWindow,
} from "@/lib/nations-league/nl-competition-window";
import {
  computeWcFormNudgesFromComposites,
  type WcInTournamentFormNudges,
} from "@/lib/world-cup/graham-wc-in-tournament-form";
import type { TeamMatchComposite } from "@/lib/world-cup/wc-tournament-composites";
import type { WcCalibrationConstants } from "@/lib/world-cup/wc-calibration-config";
import type { WcMatchRow } from "@/lib/world-cup/standings";
import type { SupabaseClient } from "@supabase/supabase-js";

const NEUTRAL: WcInTournamentFormNudges = {
  attackNudge: 1,
  defenseNudge: 1,
  finishingRegression: 0,
  matchCount: 0,
  avgChanceIndex: 1.5,
  avgDefensiveSolidity: 1.5,
  avgDisciplineLoad: 0,
};

/**
 * In-competition form for the current NL window only (not the full cycle).
 * Prefer Opta team aggregates; if none yet, still set matchCount from finished
 * window matches so talent decay engages mid-window.
 */
export async function loadNlInCompetitionFormNudges(input: {
  supabase: SupabaseClient;
  teamId: string;
  teamApiId: number;
  teamName: string;
  fixtureDate: string | null | undefined;
  finishedMatches: WcMatchRow[];
  calibration?: WcCalibrationConstants;
}): Promise<WcInTournamentFormNudges> {
  const windowMatches = filterMatchesInSameWindow(
    input.finishedMatches,
    input.teamId,
    input.teamApiId,
    input.fixtureDate,
    { teamName: input.teamName }
  );
  if (!windowMatches.length) return { ...NEUTRAL };

  const windowMatchIds = new Set(windowMatches.map((m) => String(m.id)));

  const { data: aggRows, error } = await input.supabase
    .from("nations_league_team_match_aggregates")
    .select(
      "match_id, team_api_id, side, chance_index, finishing_delta, defensive_solidity, territory_index, gk_save_index, discipline_load, opponent_strength, payload"
    )
    .eq("team_api_id", input.teamApiId);

  if (!error && aggRows?.length) {
    const composites: TeamMatchComposite[] = aggRows
      .filter((r) => windowMatchIds.has(String(r.match_id)))
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

    if (composites.length) {
      return computeWcFormNudgesFromComposites(composites, input.calibration);
    }
  }

  // No Opta process yet for this window: count finished matches so talent decay
  // still replaces the squad prior as the camp progresses.
  return {
    ...NEUTRAL,
    matchCount: windowMatches.length,
  };
}
