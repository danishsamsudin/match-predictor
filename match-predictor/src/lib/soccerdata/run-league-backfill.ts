import { getLeagueById } from "@/lib/data/football-reference";
import { soccerdataLeagueIdForReference } from "@/lib/config/soccerdata-leagues";
import { importFixturesFromFbref } from "@/lib/soccerdata/import-fixtures";
import {
  importMatchHistoryOddsToCanonical,
  importUnderstatXgToCanonical,
} from "@/lib/soccerdata/import-enrichments";
import { importPlayersFromSofifa } from "@/lib/soccerdata/import-players";
import { resolveSoccerdataSeasonFormats } from "@/lib/soccerdata/seasons";
import { tryCreateServiceClient } from "@/lib/supabase";
import { UpstreamApiError } from "@/lib/types/prediction";

export type SoccerdataLeagueBackfillOptions = {
  referenceLeagueId: number;
  /** Override reference season (default: league.season from football-reference). */
  season?: number;
  forceCache?: boolean;
  /** Skip individual steps (all default true). */
  steps?: {
    fixtures?: boolean;
    understatXg?: boolean;
    matchHistoryOdds?: boolean;
    players?: boolean;
  };
};

export type SoccerdataLeagueBackfillResult = {
  ok: boolean;
  leagueId: number;
  leagueName: string;
  seasons: ReturnType<typeof resolveSoccerdataSeasonFormats>;
  canonicalEventsInStore: number;
  steps: {
    fixtures?: {
      fixturesUpserted: number;
      aliasesUpserted: number;
      scheduleSource?: string;
    };
    understatXg?: { linked: number };
    matchHistoryOdds?: { linked: number };
    players?: { playersUpserted: number };
  };
  warnings: string[];
};

async function countCanonicalEvents(leagueId: number): Promise<number> {
  const supabase = tryCreateServiceClient();
  if (!supabase) return 0;
  const { count } = await supabase
    .from("synced_events")
    .select("event_id", { count: "exact", head: true })
    .eq("reference_league_id", leagueId);
  return count ?? 0;
}

function stepErrorMessage(error: unknown): string {
  if (error instanceof UpstreamApiError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Run one backfill step; failures become warnings so other steps can finish. */
async function runBackfillStep<T>(
  label: string,
  warnings: string[],
  fn: () => Promise<T>
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error) {
    warnings.push(`${label} failed (other steps may still have succeeded): ${stepErrorMessage(error)}`);
    return undefined;
  }
}

export async function runSoccerdataLeagueBackfill(
  options: SoccerdataLeagueBackfillOptions
): Promise<SoccerdataLeagueBackfillResult> {
  const league = getLeagueById(options.referenceLeagueId);
  if (!league) {
    throw new UpstreamApiError(`Unknown reference league id: ${options.referenceLeagueId}`);
  }

  const season = options.season ?? league.season;
  const seasons = resolveSoccerdataSeasonFormats(season);
  const steps = {
    fixtures: options.steps?.fixtures !== false,
    understatXg: options.steps?.understatXg !== false,
    matchHistoryOdds: options.steps?.matchHistoryOdds !== false,
    players: options.steps?.players !== false,
  };

  const warnings: string[] = [];
  const result: SoccerdataLeagueBackfillResult["steps"] = {};

  if (!soccerdataLeagueIdForReference("FBref", options.referenceLeagueId)) {
    warnings.push("No FBref league mapping for this league; fixture backfill will be skipped.");
    steps.fixtures = false;
  }
  if (!soccerdataLeagueIdForReference("Understat", options.referenceLeagueId)) {
    warnings.push("No Understat league mapping; xG import will be skipped.");
    steps.understatXg = false;
  }
  if (!soccerdataLeagueIdForReference("MatchHistory", options.referenceLeagueId)) {
    warnings.push("No MatchHistory league mapping; odds import will be skipped.");
    steps.matchHistoryOdds = false;
  }

  const canonicalEventsInStore = await countCanonicalEvents(options.referenceLeagueId);
  if (canonicalEventsInStore === 0) {
    warnings.push(
      "No rows in synced_events for this league. Run POST /api/cron/sync first so Understat/odds can link to canonical SofaScore event_id values."
    );
  }

  if (steps.fixtures) {
    const fixtures = await runBackfillStep("Fixtures import", warnings, () =>
      importFixturesFromFbref({
        referenceLeagueId: options.referenceLeagueId,
        seasons: [seasons.fbref, season],
        force: options.forceCache,
      })
    );
    if (fixtures) {
      result.fixtures = fixtures;
      if (fixtures.scheduleSource === "Understat") {
        warnings.push(
          "FBref schedule was blocked (403); fixtures were imported from Understat instead."
        );
      }
      if (fixtures.fixturesUpserted === 0) {
        warnings.push(
          "Fixture import wrote 0 rows (team name mismatch or empty schedule). Check synced_teams and soccerdata_team_aliases."
        );
      }
    }
  }

  if (steps.understatXg) {
    if (canonicalEventsInStore === 0) {
      warnings.push("Skipped Understat xG linking (no canonical events).");
    } else {
      const xg = await runBackfillStep("Understat xG import", warnings, () =>
        importUnderstatXgToCanonical({
          referenceLeagueId: options.referenceLeagueId,
          seasons: [seasons.understat],
        })
      );
      if (xg) result.understatXg = xg;
    }
  }

  if (steps.matchHistoryOdds) {
    if (canonicalEventsInStore === 0) {
      warnings.push("Skipped MatchHistory odds linking (no canonical events).");
    } else {
      const odds = await runBackfillStep("MatchHistory odds import", warnings, () =>
        importMatchHistoryOddsToCanonical({
          referenceLeagueId: options.referenceLeagueId,
          seasons: [seasons.matchHistory],
        })
      );
      if (odds) result.matchHistoryOdds = odds;
    }
  }

  if (steps.players) {
    const players = await runBackfillStep("SoFIFA players import", warnings, () =>
      importPlayersFromSofifa({
        referenceLeagueId: options.referenceLeagueId,
        version: "latest",
      })
    );
    if (players) result.players = players;
  }

  const anyStepSucceeded = Object.keys(result).length > 0;

  return {
    ok: anyStepSucceeded || warnings.length === 0,
    leagueId: options.referenceLeagueId,
    leagueName: league.name,
    seasons,
    canonicalEventsInStore,
    steps: result,
    warnings,
  };
}
