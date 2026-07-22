/**
 * Pre-score open GLPM fixtures into glpm_prediction_history for fast hub cards.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";
import { tryCreateServiceClient } from "@/lib/supabase";
import { runGlpmPredict } from "@/lib/glpm/run-predict";
import {
  loadGlpmSeasonReadiness,
  pickFixtureSeasonId,
  type GlpmSeasonRef,
} from "@/lib/glpm/season-ready";

type Client = SupabaseClient<Database>;

export const GLPM_HOME_LEAGUE_NAMES = [
  "Premier League",
  "Eredivisie",
  "Serie A",
  "Bundesliga",
  "Championship",
] as const;

export type UpcomingPredictionSnapshotResult = {
  ok: boolean;
  fixturesAttempted: number;
  predictionsWritten: number;
  skippedFresh: number;
  skippedNoVectors: number;
  errors: string[];
  byCompetition: Array<{
    competition: string;
    seasonId: number | null;
    written: number;
    attempted: number;
  }>;
};

function startOfUtcDayIso(d = new Date()): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

export async function runGlpmUpcomingPredictionSnapshots(options?: {
  client?: Client;
  competitionNames?: readonly string[];
  maxPerCompetition?: number;
  force?: boolean;
}): Promise<UpcomingPredictionSnapshotResult> {
  const errors: string[] = [];
  const client = options?.client ?? tryCreateServiceClient();
  if (!client) {
    return {
      ok: false,
      fixturesAttempted: 0,
      predictionsWritten: 0,
      skippedFresh: 0,
      skippedNoVectors: 0,
      errors: ["Supabase service client unavailable"],
      byCompetition: [],
    };
  }

  const names = options?.competitionNames ?? GLPM_HOME_LEAGUE_NAMES;
  const maxPer = options?.maxPerCompetition ?? 48;
  const force = options?.force === true;
  const freshAfter = startOfUtcDayIso();

  const { data: competitions } = await client
    .from("glpm_competitions")
    .select("sm_id,name");
  const { data: seasons } = await client
    .from("glpm_seasons")
    .select("sm_id,name,competition_id,start_date")
    .order("start_date", { ascending: false });

  const seasonList: GlpmSeasonRef[] = (seasons ?? []).map((s) => ({
    smId: s.sm_id,
    name: s.name,
    competitionId: s.competition_id,
  }));
  const readiness = await loadGlpmSeasonReadiness(client);

  let fixturesAttempted = 0;
  let predictionsWritten = 0;
  let skippedFresh = 0;
  let skippedNoVectors = 0;
  const byCompetition: UpcomingPredictionSnapshotResult["byCompetition"] = [];

  for (const leagueName of names) {
    const competition = (competitions ?? []).find(
      (c) => c.name.toLowerCase() === leagueName.toLowerCase()
    );
    if (!competition) {
      byCompetition.push({
        competition: leagueName,
        seasonId: null,
        written: 0,
        attempted: 0,
      });
      continue;
    }

    const seasonId = pickFixtureSeasonId(seasonList, readiness, competition.sm_id);
    if (seasonId == null) {
      byCompetition.push({
        competition: leagueName,
        seasonId: null,
        written: 0,
        attempted: 0,
      });
      continue;
    }

    const { data: openMatches } = await client
      .from("glpm_matches")
      .select("sm_id,home_team_sm_id,away_team_sm_id,match_date,kickoff_at")
      .eq("season_id", seasonId)
      .or("home_score.is.null,away_score.is.null")
      .order("match_date", { ascending: true })
      .limit(maxPer);

    const rows = [...(openMatches ?? [])].sort((a, b) => {
      const da = a.kickoff_at ?? a.match_date ?? "";
      const db = b.kickoff_at ?? b.match_date ?? "";
      return da.localeCompare(db);
    });

    let written = 0;
    let attempted = 0;

    for (const match of rows) {
      attempted += 1;
      fixturesAttempted += 1;

      if (!force) {
        const { data: existing } = await client
          .from("glpm_prediction_history")
          .select("id,executed_at")
          .eq("match_sm_id", match.sm_id)
          .gte("executed_at", freshAfter)
          .order("executed_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existing?.id) {
          skippedFresh += 1;
          continue;
        }
      }

      try {
        const result = await runGlpmPredict(client, {
          homeTeamSmId: match.home_team_sm_id,
          awayTeamSmId: match.away_team_sm_id,
          seasonId,
          matchSmId: match.sm_id,
          persist: true,
        });
        if (result.predictionId) {
          written += 1;
          predictionsWritten += 1;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/No GLPM rating vector/i.test(message)) {
          skippedNoVectors += 1;
        } else {
          errors.push(`${leagueName} match ${match.sm_id}: ${message}`);
        }
      }
    }

    byCompetition.push({
      competition: leagueName,
      seasonId,
      written,
      attempted,
    });
  }

  return {
    ok: errors.length === 0,
    fixturesAttempted,
    predictionsWritten,
    skippedFresh,
    skippedNoVectors,
    errors,
    byCompetition,
  };
}
