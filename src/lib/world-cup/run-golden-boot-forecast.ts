import { loadTeamSquadForComparison } from "@/lib/data/load-team-squad-for-comparison";
import { resolveWc2026TeamLabel } from "@/lib/data/world-cup-2026-official-squads";
import { resolveApiTeamId } from "@/lib/world-cup/resolve-api-team-id";
import {
  computeGoldenBootPredictions,
  type GoldenBootPredictionPayload,
  type TeamSquadMap,
} from "@/lib/world-cup/golden-boot-prediction";
import type { GroupMatchPrediction } from "@/lib/world-cup/simulate-group-stage";
import type { TournamentForecastPayload } from "@/lib/world-cup/tournament-forecast-payload";
import type { WcMatchRow } from "@/lib/world-cup/standings";
import type { SupabaseClient } from "@supabase/supabase-js";
import sofifaSquads from "../../../data/world-cup-2026/sofifa-squads.json";

const CONCURRENCY = 8;
const CACHE_TTL_MS = 5 * 60 * 1000;

type SofifaSquadsFile = {
  teams: Record<
    string,
    {
      sofascore_team_id?: number;
      setPieces?: { Penalties?: string };
    }
  >;
};

let cache: {
  key: string;
  payload: GoldenBootPredictionPayload;
  expiresAt: number;
} | null = null;

function buildPenaltyTakerMap(): Map<string, string | null> {
  const map = new Map<string, string | null>();
  const teams = (sofifaSquads as SofifaSquadsFile).teams ?? {};
  for (const [teamName, team] of Object.entries(teams)) {
    map.set(teamName, team.setPieces?.Penalties ?? null);
  }
  return map;
}

const penaltyTakersByTeamName = buildPenaltyTakerMap();

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index++;
      results[current] = await fn(items[current]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function teamsInForecast(
  forecast: TournamentForecastPayload,
  groupMatches: WcMatchRow[]
): Set<string> {
  const ids = new Set<string>();
  for (const m of groupMatches) {
    if (m.home_team_id) ids.add(m.home_team_id);
    if (m.away_team_id) ids.add(m.away_team_id);
  }
  for (const m of forecast.knockoutMatches) {
    ids.add(m.homeTeam.teamId);
    ids.add(m.awayTeam.teamId);
  }
  return ids;
}

function cacheKey(
  forecast: TournamentForecastPayload,
  matches: WcMatchRow[]
): string {
  const latestResult = matches
    .filter((m) => m.home_goals != null && m.away_goals != null)
    .map((m) => `${m.id}:${m.home_goals}-${m.away_goals}`)
    .join("|");
  return `${forecast.computedAt}::${latestResult}`;
}

export async function runGoldenBootForecast(input: {
  client: SupabaseClient | null;
  forecast: TournamentForecastPayload | null;
  groupMatches: WcMatchRow[];
  predictionsByMatchId: Map<string, GroupMatchPrediction>;
  teamNames: Map<string, string>;
}): Promise<GoldenBootPredictionPayload | null> {
  if (!input.forecast || input.forecast.knockoutMatches.length === 0) {
    return null;
  }

  const key = cacheKey(input.forecast, input.groupMatches);
  if (cache && cache.key === key && cache.expiresAt > Date.now()) {
    return cache.payload;
  }

  const teamIds = teamsInForecast(input.forecast, input.groupMatches);
  const squadEntries = await mapWithConcurrency([...teamIds], CONCURRENCY, async (teamId) => {
    const teamName = input.teamNames.get(teamId) ?? "Unknown";
    const sofaTeamId = resolveApiTeamId(teamId, teamName);
    const wcLabel = resolveWc2026TeamLabel(teamName, sofaTeamId || undefined);
    const squad = await loadTeamSquadForComparison(
      input.client,
      sofaTeamId || 0,
      wcLabel ?? teamName,
      1,
      "national"
    );
    return { teamId, teamName, sofaTeamId, squad };
  });

  const squads: TeamSquadMap = new Map();
  for (const entry of squadEntries) {
    squads.set(entry.teamId, {
      teamName: entry.teamName,
      sofaTeamId: entry.sofaTeamId,
      squad: entry.squad,
    });
  }

  const payload = computeGoldenBootPredictions({
    forecast: input.forecast,
    groupMatches: input.groupMatches,
    predictionsByMatchId: input.predictionsByMatchId,
    teamNames: input.teamNames,
    squads,
    penaltyTakersByTeamName,
  });

  cache = {
    key,
    payload,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };

  return payload;
}
