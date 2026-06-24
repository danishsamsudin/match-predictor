import {
  opponentAdjustedCompositeMean,
  type TeamMatchComposite,
} from "@/lib/world-cup/wc-tournament-composites";
import type { SupabaseClient } from "@supabase/supabase-js";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Normalize to ~0–2 scale around tournament typical values. */
function normalizeDefensiveSolidity(value: number): number {
  return clamp(value / 1.5, 0.2, 2);
}

function normalizeInverseChance(value: number): number {
  return clamp(1.8 / Math.max(0.4, value), 0.2, 2);
}

function normalizeInverseTerritory(value: number): number {
  return clamp(0.9 / Math.max(0.15, value), 0.2, 2);
}

export function computeLowBlockIndexFromComposites(
  composites: TeamMatchComposite[]
): number {
  if (!composites.length) return 0;

  const defense = opponentAdjustedCompositeMean(composites, "defensiveSolidity");
  const chance = opponentAdjustedCompositeMean(composites, "chanceIndex");
  const territory = opponentAdjustedCompositeMean(composites, "territoryIndex");

  return (
    normalizeDefensiveSolidity(defense) *
    normalizeInverseChance(chance) *
    normalizeInverseTerritory(territory)
  );
}

async function loadWcTeamComposites(
  supabase: SupabaseClient,
  teamApiId: number
): Promise<TeamMatchComposite[]> {
  const { data: aggRows, error } = await supabase
    .from("world_cup_team_match_aggregates")
    .select(
      "match_id, team_api_id, side, chance_index, finishing_delta, defensive_solidity, territory_index, gk_save_index, discipline_load, opponent_strength, payload"
    )
    .eq("team_api_id", teamApiId);

  if (error || !aggRows?.length) return [];

  const { data: matches } = await supabase
    .from("matches")
    .select("id")
    .eq("status", "finished")
    .or("competition.ilike.FIFA World Cup 2026%,competition.eq.World Cup");

  const wcMatchIds = new Set((matches ?? []).map((m) => String(m.id)));
  return aggRows
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
}

export async function computeLowBlockIndicesForFixture(input: {
  supabase: SupabaseClient;
  homeTeamApiId: number;
  awayTeamApiId: number;
}): Promise<{
  low_block_index_home: number;
  low_block_index_away: number;
  low_block_index_diff: number;
}> {
  const [homeComposites, awayComposites] = await Promise.all([
    loadWcTeamComposites(input.supabase, input.homeTeamApiId),
    loadWcTeamComposites(input.supabase, input.awayTeamApiId),
  ]);

  const low_block_index_home = computeLowBlockIndexFromComposites(homeComposites);
  const low_block_index_away = computeLowBlockIndexFromComposites(awayComposites);

  return {
    low_block_index_home,
    low_block_index_away,
    low_block_index_diff: low_block_index_home - low_block_index_away,
  };
}
