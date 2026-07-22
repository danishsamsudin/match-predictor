/**
 * Load latest domain and component ratings for GLPM insights (display only).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";

type Client = SupabaseClient<Database>;

export type DomainRatingMap = Record<string, number>;
export type ComponentRatingMap = Record<string, number>;

export type TeamInsightRatings = {
  teamSmId: number;
  seasonId: number;
  asOfDate: string | null;
  domains: DomainRatingMap;
  components: ComponentRatingMap;
  setPieceThreat: number | null;
  setPieceDefence: number | null;
};

async function latestDomainMap(
  client: Client,
  teamSmId: number,
  seasonId: number
): Promise<{ asOfDate: string | null; domains: DomainRatingMap }> {
  const { data } = await client
    .from("glpm_team_domain_ratings")
    .select("domain,rating,as_of_date,rating_type")
    .eq("team_sm_id", teamSmId)
    .eq("season_id", seasonId)
    .order("as_of_date", { ascending: false })
    .limit(200);

  const domains: DomainRatingMap = {};
  let asOfDate: string | null = null;
  for (const row of data ?? []) {
    const key = String(row.domain);
    if (key in domains) continue;
    domains[key] = Number(row.rating);
    if (!asOfDate) asOfDate = row.as_of_date;
  }
  return { asOfDate, domains };
}

async function latestComponentMap(
  client: Client,
  teamSmId: number,
  seasonId: number
): Promise<ComponentRatingMap> {
  const { data } = await client
    .from("glpm_team_component_ratings")
    .select("component,rating,as_of_date,rating_type")
    .eq("team_sm_id", teamSmId)
    .eq("season_id", seasonId)
    .order("as_of_date", { ascending: false })
    .limit(300);

  const components: ComponentRatingMap = {};
  for (const row of data ?? []) {
    const key = String(row.component);
    if (key in components) continue;
    components[key] = Number(row.rating);
  }
  return components;
}

export async function loadTeamInsightRatings(
  client: Client,
  opts: { teamSmId: number; seasonId: number }
): Promise<TeamInsightRatings> {
  const [{ asOfDate, domains }, components] = await Promise.all([
    latestDomainMap(client, opts.teamSmId, opts.seasonId),
    latestComponentMap(client, opts.teamSmId, opts.seasonId),
  ]);

  return {
    teamSmId: opts.teamSmId,
    seasonId: opts.seasonId,
    asOfDate,
    domains,
    components,
    setPieceThreat:
      components.set_piece_threat != null && Number.isFinite(components.set_piece_threat)
        ? components.set_piece_threat
        : null,
    setPieceDefence:
      components.set_piece_defence != null && Number.isFinite(components.set_piece_defence)
        ? components.set_piece_defence
        : null,
  };
}

/** Season Goals − xG from team-match stats (may be proxy xG). */
export async function loadFinishingDifferential(
  client: Client,
  opts: { teamSmId: number; seasonId: number }
): Promise<{ goals: number; xg: number; delta: number; matches: number } | null> {
  const { data: matches } = await client
    .from("glpm_matches")
    .select("sm_id")
    .eq("season_id", opts.seasonId)
    .not("home_score", "is", null)
    .not("away_score", "is", null);

  const matchIds = (matches ?? []).map((m) => m.sm_id);
  if (!matchIds.length) return null;

  const { data: rows } = await client
    .from("glpm_match_team_stats")
    .select("goals,xg,match_sm_id")
    .eq("team_sm_id", opts.teamSmId)
    .in("match_sm_id", matchIds.slice(0, 500));

  let goals = 0;
  let xg = 0;
  let n = 0;
  for (const row of rows ?? []) {
    if (row.goals == null && row.xg == null) continue;
    goals += Number(row.goals ?? 0);
    xg += Number(row.xg ?? 0);
    n += 1;
  }
  if (!n) return null;
  return { goals, xg, delta: goals - xg, matches: n };
}

export const ATTACK_DOMAINS = ["creation", "progression", "situational"] as const;
export const DEFENCE_DOMAINS = ["prevention", "protection", "control"] as const;
export const GK_DOMAINS = ["goal_prevention", "goalkeeper_involvement"] as const;
