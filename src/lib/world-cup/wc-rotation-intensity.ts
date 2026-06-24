import { normalizeNationalTeamName } from "@/lib/data/world-cup-2026-teams";
import { normalizeText } from "@/lib/soccerdata/normalize";
import type { SupabaseClient } from "@supabase/supabase-js";

function normalizePlayerName(name: string): string {
  return normalizeText(normalizeNationalTeamName(name));
}

function nameOverlap(projected: string[], expected: string[]): number {
  const proj = new Set(projected.map(normalizePlayerName));
  const exp = new Set(expected.map(normalizePlayerName));
  let hits = 0;
  for (const n of proj) {
    if (exp.has(n)) hits += 1;
  }
  return hits / Math.max(11, proj.size, exp.size);
}

/** 0 = full strength, 1 = heavy rotation vs expected tournament XI. */
export function computeRotationIndex(projectedXi: string[], expectedXi: string[]): number {
  if (!projectedXi.length || !expectedXi.length) return 0;
  const overlap = nameOverlap(projectedXi, expectedXi);
  return Math.max(0, Math.min(1, 1 - overlap));
}

export async function loadExpectedTournamentXi(input: {
  supabase: SupabaseClient;
  teamApiId: number;
}): Promise<string[]> {
  const { data } = await input.supabase
    .from("world_cup_player_tournament_form")
    .select("player_name, minutes_total, chance_index_per90")
    .eq("team_api_id", input.teamApiId);

  const ranked = (data ?? [])
    .map((row) => ({
      name: String(row.player_name),
      score:
        Number(row.minutes_total ?? 0) *
        Math.max(0.01, Number(row.chance_index_per90 ?? 0.01)),
    }))
    .sort((a, b) => b.score - a.score);

  return ranked.slice(0, 11).map((r) => r.name);
}

export async function computeRotationIndicesForFixture(input: {
  supabase: SupabaseClient;
  homeTeamApiId: number;
  awayTeamApiId: number;
  homeProjectedXi: string[];
  awayProjectedXi: string[];
}): Promise<{
  rotation_index_home: number;
  rotation_index_away: number;
  rotation_index_diff: number;
}> {
  const [homeExpected, awayExpected] = await Promise.all([
    loadExpectedTournamentXi({ supabase: input.supabase, teamApiId: input.homeTeamApiId }),
    loadExpectedTournamentXi({ supabase: input.supabase, teamApiId: input.awayTeamApiId }),
  ]);

  const rotation_index_home = computeRotationIndex(input.homeProjectedXi, homeExpected);
  const rotation_index_away = computeRotationIndex(input.awayProjectedXi, awayExpected);

  return {
    rotation_index_home,
    rotation_index_away,
    rotation_index_diff: rotation_index_home - rotation_index_away,
  };
}
