/**
 * Load latest domain and component ratings for GLPM insights (display only).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";
import {
  lookupUnderstatSeasonRow,
  UNDERSTAT_PL_SEASON_ID,
} from "@/lib/glpm/understat-season-table";

type Client = SupabaseClient<Database>;

export type DomainRatingMap = Record<string, number>;
export type ComponentRatingMap = Record<string, number>;

export type SetPieceSource = "component" | "domain" | "missing";

export type TeamInsightRatings = {
  teamSmId: number;
  seasonId: number;
  asOfDate: string | null;
  domains: DomainRatingMap;
  components: ComponentRatingMap;
  setPieceThreat: number | null;
  setPieceDefence: number | null;
  setPieceSource: SetPieceSource;
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
    .limit(800);

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

  const threatFromComponent =
    components.set_piece_threat != null && Number.isFinite(components.set_piece_threat)
      ? components.set_piece_threat
      : null;
  const defenceFromComponent =
    components.set_piece_defence != null && Number.isFinite(components.set_piece_defence)
      ? components.set_piece_defence
      : null;
  const threatFromDomain =
    domains.situational != null && Number.isFinite(domains.situational)
      ? domains.situational
      : null;
  const defenceFromDomain =
    domains.protection != null && Number.isFinite(domains.protection)
      ? domains.protection
      : null;

  const hasComponents = threatFromComponent != null && defenceFromComponent != null;
  const hasDomains = threatFromDomain != null || defenceFromDomain != null;

  return {
    teamSmId: opts.teamSmId,
    seasonId: opts.seasonId,
    asOfDate,
    domains,
    components,
    setPieceThreat: threatFromComponent ?? threatFromDomain,
    setPieceDefence: defenceFromComponent ?? defenceFromDomain,
    setPieceSource: hasComponents ? "component" : hasDomains ? "domain" : "missing",
  };
}

export type FinishingSource = "understat" | "provider" | "proxy";

export type FinishingDifferential = {
  goals: number;
  xg: number;
  delta: number;
  matches: number;
  proxyMatches: number;
  source: FinishingSource;
};

/** True when both sides sit on the calibrator ceiling (no trained variance). */
export function isSharedCeiling(a: number, b: number, floor = 99.5): boolean {
  return a >= floor && b >= floor && Math.abs(a - b) < 0.51;
}

/** Season Goals − xG. Prefers Understat season totals over shot-proxy match xG. */
export async function loadFinishingDifferential(
  client: Client,
  opts: { teamSmId: number; seasonId: number }
): Promise<FinishingDifferential | null> {
  const { data: team } = await client
    .from("glpm_teams")
    .select("name,official_name")
    .eq("sm_id", opts.teamSmId)
    .maybeSingle();
  const understat =
    opts.seasonId === UNDERSTAT_PL_SEASON_ID
      ? lookupUnderstatSeasonRow(team?.name) ??
        lookupUnderstatSeasonRow(team?.official_name)
      : null;
  if (understat) {
    return {
      goals: understat.goals,
      xg: understat.xg,
      delta: understat.goals - understat.xg,
      matches: understat.matches,
      proxyMatches: 0,
      source: "understat",
    };
  }

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
    .select("goals,xg,match_sm_id,payload")
    .eq("team_sm_id", opts.teamSmId)
    .in("match_sm_id", matchIds.slice(0, 500));

  let providerGoals = 0;
  let providerXg = 0;
  let providerN = 0;
  let proxyGoals = 0;
  let proxyXg = 0;
  let proxyN = 0;
  for (const row of rows ?? []) {
    if (row.goals == null || row.xg == null) continue;
    const g = Number(row.goals);
    const x = Number(row.xg);
    if (!Number.isFinite(g) || !Number.isFinite(x)) continue;
    const payload = row.payload as { xg_proxy?: boolean } | null;
    if (payload?.xg_proxy === true) {
      proxyGoals += g;
      proxyXg += x;
      proxyN += 1;
    } else {
      providerGoals += g;
      providerXg += x;
      providerN += 1;
    }
  }
  if (providerN > 0) {
    return {
      goals: providerGoals,
      xg: providerXg,
      delta: providerGoals - providerXg,
      matches: providerN,
      proxyMatches: 0,
      source: "provider",
    };
  }
  if (!proxyN) return null;
  return {
    goals: proxyGoals,
    xg: proxyXg,
    delta: proxyGoals - proxyXg,
    matches: proxyN,
    proxyMatches: proxyN,
    source: "proxy",
  };
}

export const ATTACK_DOMAINS = ["creation", "progression", "situational"] as const;
export const DEFENCE_DOMAINS = ["prevention", "protection", "control"] as const;
export const GK_DOMAINS = ["goal_prevention", "goalkeeper_involvement"] as const;
