import { getLeagueById, getLeagueEntityType } from "@/lib/data/football-reference";
import { tryCreateServiceClient } from "@/lib/supabase";
import type { EntityType } from "@/lib/types/football-lookup";
import type { SportApiEvent } from "@/lib/types/sportapi";

export type CompetitionClass =
  | "majorInternational"
  | "minorInternational"
  | "topDomestic"
  | "midDomestic"
  | "lowDomestic";

export type MuSource = "computed" | "competitionDefault" | "global";

export interface CompetitionAvgGoalsResult {
  mu: number;
  source: MuSource;
  competitionClass: CompetitionClass;
  sampleSize: number;
}

const GLOBAL_BASELINE_MU = 1.35;
const MIN_SAMPLE_MATCHES = 20;
const TARGET_MATCHES = 100;
const CACHE_TTL_MS = 10 * 60 * 1000;

const DEFAULT_MU_BY_CLASS: Record<CompetitionClass, number> = {
  majorInternational: 1.2,
  minorInternational: 1.32,
  topDomestic: 1.4,
  midDomestic: 1.34,
  lowDomestic: 1.3,
};

const cache = new Map<string, { result: CompetitionAvgGoalsResult; expiresAt: number }>();

function goalsFromEvent(event: SportApiEvent): { home: number; away: number } | null {
  const home = event.homeScore?.current ?? event.homeScore?.display ?? null;
  const away = event.awayScore?.current ?? event.awayScore?.display ?? null;
  if (home == null || away == null) return null;
  return { home, away };
}

export function resolveCompetitionClass(
  leagueId: number,
  entityType?: EntityType
): CompetitionClass {
  const league = getLeagueById(leagueId);
  const effectiveEntity = entityType ?? getLeagueEntityType(leagueId);

  if (effectiveEntity === "national") {
    if (leagueId === 1 || leagueId === 4) return "majorInternational";
    if (league?.syncTier === 3) return "minorInternational";
    return "minorInternational";
  }

  const tier = league?.syncTier ?? 3;
  if (tier === 1 && league?.type === "League") return "topDomestic";
  if (tier === 2) return "midDomestic";
  return "lowDomestic";
}

export function getDefaultMuForCompetition(
  leagueId: number,
  entityType?: EntityType
): CompetitionAvgGoalsResult {
  const competitionClass = resolveCompetitionClass(leagueId, entityType);
  return {
    mu: DEFAULT_MU_BY_CLASS[competitionClass],
    source: "competitionDefault",
    competitionClass,
    sampleSize: 0,
  };
}

function cacheKey(leagueId: number, seasonId?: number | null): string {
  return `${leagueId}:${seasonId ?? "all"}`;
}

/**
 * Rolling league-average goals per team per match (μ) from synced_events.
 * Fallback: computed → competition-class default → global 1.35.
 */
export async function resolveCompetitionAvgGoals(input: {
  leagueId: number;
  entityType?: EntityType;
  seasonId?: number | null;
}): Promise<CompetitionAvgGoalsResult> {
  const key = cacheKey(input.leagueId, input.seasonId);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  const competitionClass = resolveCompetitionClass(input.leagueId, input.entityType);
  const fallback = getDefaultMuForCompetition(input.leagueId, input.entityType);

  const supabase = tryCreateServiceClient();
  if (!supabase) {
    const result: CompetitionAvgGoalsResult = {
      ...fallback,
      source: fallback.source,
    };
    cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  }

  let query = supabase
    .from("synced_events")
    .select("payload")
    .eq("reference_league_id", input.leagueId)
    .order("kickoff_at", { ascending: false })
    .limit(TARGET_MATCHES * 2);

  if (input.seasonId != null) {
    query = query.eq("season_id", input.seasonId);
  }

  const { data, error } = await query;
  if (error || !data?.length) {
    cache.set(key, { result: fallback, expiresAt: Date.now() + CACHE_TTL_MS });
    return fallback;
  }

  let totalGoals = 0;
  let matchCount = 0;

  for (const row of data) {
    const event = row.payload as SportApiEvent;
    if (!event || (event.status?.type !== "finished" && event.status?.type !== "ended")) {
      continue;
    }
    const goals = goalsFromEvent(event);
    if (!goals) continue;
    totalGoals += goals.home + goals.away;
    matchCount += 1;
    if (matchCount >= TARGET_MATCHES) break;
  }

  if (matchCount < MIN_SAMPLE_MATCHES) {
    cache.set(key, { result: fallback, expiresAt: Date.now() + CACHE_TTL_MS });
    return fallback;
  }

  const mu = Math.round((totalGoals / (2 * matchCount)) * 1000) / 1000;
  const result: CompetitionAvgGoalsResult = {
    mu,
    source: "computed",
    competitionClass,
    sampleSize: matchCount,
  };
  cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

/** Clear TTL cache (tests). */
export function clearCompetitionAvgGoalsCache(): void {
  cache.clear();
}

export function formatMuSourceLabel(source: MuSource, competitionClass: CompetitionClass): string {
  if (source === "computed") return `computed from recent fixtures (${competitionClass})`;
  if (source === "competitionDefault") return `competition default (${competitionClass})`;
  return "global baseline";
}
