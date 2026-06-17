import { aggregateLineupAppearances } from "@/lib/data/infer-usual-squad-from-lineups";
import { pickPreferredFormation } from "@/lib/data/formation-lineup";
import { resolveFbrefTeamIdByName } from "@/lib/fbref/comparison-fallback";
import { normalizeNationalTeamName, WORLD_CUP_2026_TEAMS } from "@/lib/data/world-cup-2026-teams";
import type { Database } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

type ServiceClient = SupabaseClient<Database>;

export type FormationUsageRow = {
  formation: string;
  match_count: number;
  source: string;
};

const FBREF_TO_SOFASCORE = new Map<string, number>();

async function ensureFbrefTeamIndex(): Promise<Map<string, number>> {
  if (FBREF_TO_SOFASCORE.size) return FBREF_TO_SOFASCORE;
  for (const team of WORLD_CUP_2026_TEAMS) {
    const fbref = await resolveFbrefTeamIdByName(team.name);
    if (fbref) FBREF_TO_SOFASCORE.set(fbref.id, team.id);
  }
  return FBREF_TO_SOFASCORE;
}

export async function sofascoreIdForFbrefTeam(fbrefTeamId: string): Promise<number | null> {
  const index = await ensureFbrefTeamIndex();
  return index.get(fbrefTeamId) ?? null;
}

export async function loadFormationUsageForTeam(
  supabase: ServiceClient,
  referenceTeamId: number
): Promise<FormationUsageRow[]> {
  const { data, error } = await supabase
    .from("team_formation_usage")
    .select("formation, match_count, source")
    .eq("reference_team_id", referenceTeamId)
    .order("match_count", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FormationUsageRow[];
}

export function preferredFormationFromUsage(rows: FormationUsageRow[]): string | null {
  const formations = rows.flatMap((r) => Array.from({ length: r.match_count }, () => r.formation));
  return pickPreferredFormation(formations);
}

export async function loadPreferredFormationForTeam(
  supabase: ServiceClient | null,
  referenceTeamId: number,
  teamName?: string
): Promise<string | null> {
  if (!supabase) return null;

  const stored = await loadFormationUsageForTeam(supabase, referenceTeamId);
  const fromStored = preferredFormationFromUsage(stored);
  if (fromStored) return fromStored;

  const lineupAgg = await aggregateLineupAppearances(supabase, referenceTeamId, teamName);
  if (lineupAgg.preferredFormation) return lineupAgg.preferredFormation;

  if (!teamName?.trim()) return null;
  const fbref = await resolveFbrefTeamIdByName(teamName);
  if (!fbref) return null;

  const { data: matches } = await supabase
    .from("matches")
    .select("home_team_id, away_team_id, home_formation, away_formation")
    .or(`home_team_id.eq.${fbref.id},away_team_id.eq.${fbref.id}`)
    .not("home_goals", "is", null);

  const formations: string[] = [];
  for (const row of matches ?? []) {
    if (row.home_team_id === fbref.id && row.home_formation?.trim()) {
      formations.push(row.home_formation.trim());
    }
    if (row.away_team_id === fbref.id && row.away_formation?.trim()) {
      formations.push(row.away_formation.trim());
    }
  }
  return pickPreferredFormation(formations);
}

export async function upsertFormationUsageRows(
  supabase: ServiceClient,
  referenceTeamId: number,
  counts: Map<string, number>,
  source: string
): Promise<void> {
  if (!counts.size) return;
  const rows = [...counts.entries()].map(([formation, match_count]) => ({
    reference_team_id: referenceTeamId,
    formation,
    match_count,
    source,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase
    .from("team_formation_usage")
    .upsert(rows, { onConflict: "reference_team_id,formation,source" });
  if (error) throw error;
}

/** Aggregate formations from FBref matches for one national team and persist usage + match columns. */
export async function syncFbrefFormationsForTeamName(
  supabase: ServiceClient,
  teamName: string
): Promise<{ preferredFormation: string | null; usage: FormationUsageRow[] }> {
  const normalized = normalizeNationalTeamName(teamName);
  const wcTeam = WORLD_CUP_2026_TEAMS.find(
    (t) => normalizeNationalTeamName(t.name) === normalized
  );
  const fbref = await resolveFbrefTeamIdByName(teamName);
  if (!wcTeam || !fbref) {
    return { preferredFormation: null, usage: [] };
  }

  const { data: matches } = await supabase
    .from("matches")
    .select("id, home_team_id, away_team_id, home_formation, away_formation")
    .or(`home_team_id.eq.${fbref.id},away_team_id.eq.${fbref.id}`);

  const counts = new Map<string, number>();
  for (const row of matches ?? []) {
    let formation: string | null = null;
    if (row.home_team_id === fbref.id) formation = row.home_formation;
    if (row.away_team_id === fbref.id) formation = row.away_formation;
    const trimmed = formation?.trim();
    if (!trimmed) continue;
    counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
  }

  await upsertFormationUsageRows(supabase, wcTeam.id, counts, "fbref");
  const usage = [...counts.entries()].map(([formation, match_count]) => ({
    formation,
    match_count,
    source: "fbref",
  }));

  const weighted: string[] = [];
  for (const [formation, count] of counts) {
    for (let i = 0; i < count; i++) weighted.push(formation);
  }

  return {
    preferredFormation: pickPreferredFormation(weighted),
    usage,
  };
}
