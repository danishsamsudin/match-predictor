/**
 * Load league standings for a GLPM season from finished matches.
 * Attaches previous_rank movement when glpm_standings_current matches the
 * current results fingerprint (populated by standings refresh cron / script).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";
import { buildSeasonStandingsFromMatches } from "@/lib/glpm/build-season-standings";
import type { GlpmStandingRow } from "@/lib/glpm/hub-types";
import {
  loadGlpmSeasonReadiness,
  pickDefaultGlpmSeasonId,
  pickFixtureSeasonId,
} from "@/lib/glpm/season-ready";
import { attachPreviousRanks } from "@/lib/glpm/standings-movement";

type Client = SupabaseClient<Database>;

export type GlpmLeagueStandings = {
  leagueName: string;
  competitionId: number | null;
  seasonId: number | null;
  seasonName: string | null;
  rows: GlpmStandingRow[];
};

async function resolveSeasonId(
  client: Client,
  competitionId: number
): Promise<{ seasonId: number | null; seasonName: string | null }> {
  const { data: seasons } = await client
    .from("glpm_seasons")
    .select("sm_id,name,competition_id")
    .eq("competition_id", competitionId)
    .order("start_date", { ascending: false });

  const seasonList = (seasons ?? []).map((s) => ({
    smId: s.sm_id,
    name: s.name,
    competitionId: s.competition_id,
  }));
  if (!seasonList.length) return { seasonId: null, seasonName: null };

  const readiness = await loadGlpmSeasonReadiness(client);
  // Prefer upcoming schedule season so standings align with fixtures during
  // off-season transitions; fall back to finished / predict-ready default.
  const seasonId =
    pickFixtureSeasonId(seasonList, readiness, competitionId) ??
    seasonList.find((s) => readiness.get(s.smId)?.hasFinishedMatches)?.smId ??
    pickDefaultGlpmSeasonId(seasonList, readiness, competitionId);

  const meta = seasonId != null ? seasonList.find((s) => s.smId === seasonId) : null;
  return { seasonId: seasonId ?? null, seasonName: meta?.name ?? null };
}

async function attachStoredMovement(
  client: Client,
  seasonId: number,
  rows: GlpmStandingRow[],
  fingerprint: string
): Promise<GlpmStandingRow[]> {
  const { data: stored } = await client
    .from("glpm_standings_current")
    .select("team_sm_id,previous_rank,results_fingerprint")
    .eq("season_id", seasonId);

  if (!stored?.length) return rows;

  // Only trust previous_rank when the stored snapshot matches live results.
  const matching = stored.filter((r) => r.results_fingerprint === fingerprint);
  if (!matching.length) return rows;

  const previousByTeam = new Map<number, number | null>();
  for (const row of matching) {
    previousByTeam.set(row.team_sm_id, row.previous_rank);
  }
  return attachPreviousRanks(rows, previousByTeam);
}

export async function loadGlpmStandingsForCompetition(
  client: Client,
  opts: { competitionId: number; leagueName: string; seasonId?: number | null }
): Promise<GlpmLeagueStandings> {
  const resolved =
    opts.seasonId != null
      ? { seasonId: opts.seasonId, seasonName: null as string | null }
      : await resolveSeasonId(client, opts.competitionId);

  let seasonName = resolved.seasonName;
  if (resolved.seasonId != null && seasonName == null) {
    const { data: seasonRow } = await client
      .from("glpm_seasons")
      .select("name")
      .eq("sm_id", resolved.seasonId)
      .maybeSingle();
    seasonName = seasonRow?.name ?? null;
  }

  if (resolved.seasonId == null) {
    return {
      leagueName: opts.leagueName,
      competitionId: opts.competitionId,
      seasonId: null,
      seasonName: null,
      rows: [],
    };
  }

  const seasonId = resolved.seasonId;
  const built = await buildSeasonStandingsFromMatches(client, seasonId);
  const rows = await attachStoredMovement(client, seasonId, built.rows, built.fingerprint);

  return {
    leagueName: opts.leagueName,
    competitionId: opts.competitionId,
    seasonId,
    seasonName,
    rows,
  };
}
