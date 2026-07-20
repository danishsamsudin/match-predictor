/**
 * Season-scoped GLPM league hub payload (rating leaders, recent, upcoming).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";
import {
  estimateExpectedGoals,
  predictMatch,
  PRIMARY_ORDER,
  type PrimaryKey,
} from "@/lib/glpm/engine";
import { toRatingVectorInput, type LoadedRatingVector } from "@/lib/glpm/load-vectors";
import type {
  GlpmHubMatchSummaryStats,
  GlpmHubPayload,
  GlpmHubRatingLeader,
  GlpmHubRecentMatch,
  GlpmHubUpcomingMatch,
} from "@/lib/glpm/hub-types";
import {
  annotateSeasonReadiness,
  loadGlpmSeasonReadiness,
  pickDefaultGlpmSeasonId,
  pickFixtureSeasonId,
} from "@/lib/glpm/season-ready";

export type {
  GlpmHubMatchSummaryStats,
  GlpmHubPayload,
  GlpmHubRatingLeader,
  GlpmHubRecentMatch,
  GlpmHubUpcomingMatch,
} from "@/lib/glpm/hub-types";

type Client = SupabaseClient<Database>;

function meanRatings(r: Record<PrimaryKey, number>): number {
  return PRIMARY_ORDER.reduce((s, k) => s + r[k], 0) / PRIMARY_ORDER.length;
}

function vectorFromRow(row: {
  team_sm_id: number;
  season_id: number;
  as_of_date: string;
  r_attack: number | null;
  r_defence: number | null;
  r_goalkeeper: number | null;
  r_build_up: number | null;
  r_possession: number | null;
  r_pressing: number | null;
  r_finishing: number | null;
  model_version: string;
  metadata: unknown;
}): LoadedRatingVector {
  const ratings = {
    attack: Number(row.r_attack ?? 60),
    defence: Number(row.r_defence ?? 60),
    goalkeeper: Number(row.r_goalkeeper ?? 60),
    build_up: Number(row.r_build_up ?? 60),
    possession: Number(row.r_possession ?? 60),
    pressing: Number(row.r_pressing ?? 60),
    finishing: Number(row.r_finishing ?? 60),
  } as Record<PrimaryKey, number>;
  return {
    teamSmId: row.team_sm_id,
    seasonId: row.season_id,
    asOfDate: row.as_of_date,
    ratings,
    metadata: {},
    modelVersion: row.model_version,
    teamName: null,
  };
}

function predictFromVectors(
  home: LoadedRatingVector,
  away: LoadedRatingVector
) {
  const xg = estimateExpectedGoals(
    toRatingVectorInput(home),
    toRatingVectorInput(away),
    { isNeutralVenue: false }
  );
  const pred = predictMatch(xg);
  return {
    homeWin: pred.homeWin,
    draw: pred.draw,
    awayWin: pred.awayWin,
    homeXg: pred.homeXg,
    awayXg: pred.awayXg,
    over25: pred.overUnder["2.5"]?.over ?? 0,
    bttsYes: pred.bttsYes,
  };
}

export async function loadGlpmHubPayload(
  client: Client,
  opts: {
    seasonId?: number | null;
    competitionId?: number | null;
    /** Prefer seasons with open-score fixtures (home upcoming preview). */
    preferFixtures?: boolean;
  } = {}
): Promise<GlpmHubPayload> {
  const updatedAt = new Date().toISOString();

  const { data: competitions } = await client
    .from("glpm_competitions")
    .select("sm_id,name,area_name")
    .order("name");

  const { data: seasons } = await client
    .from("glpm_seasons")
    .select("sm_id,name,competition_id")
    .order("start_date", { ascending: false });

  const seasonList = (seasons ?? []).map((s) => ({
    smId: s.sm_id,
    name: s.name,
    competitionId: s.competition_id,
  }));

  const readiness = await loadGlpmSeasonReadiness(client);

  const competitionList = (competitions ?? []).map((c) => ({
    smId: c.sm_id,
    name: c.name,
    areaName: c.area_name,
    defaultSeasonId: pickDefaultGlpmSeasonId(seasonList, readiness, c.sm_id),
  }));
  const seasonsForPayload = annotateSeasonReadiness(seasonList, readiness).map((s) => ({
    smId: s.smId,
    name: s.name,
    competitionId: s.competitionId,
    hasVectors: s.hasVectors,
    hasFinishedMatches: s.hasFinishedMatches,
    hasUpcomingMatches: s.hasUpcomingMatches,
    isPredictReady: s.isPredictReady,
  }));

  let seasonId = opts.seasonId ?? null;
  let competitionId = opts.competitionId ?? null;
  const preferFixtures = opts.preferFixtures === true;

  if (seasonId == null && seasonList.length > 0) {
    seasonId = preferFixtures
      ? pickFixtureSeasonId(seasonList, readiness, competitionId)
      : pickDefaultGlpmSeasonId(seasonList, readiness, competitionId);
    if (seasonId == null && competitionId != null) {
      seasonId = preferFixtures
        ? pickFixtureSeasonId(seasonList, readiness, null)
        : pickDefaultGlpmSeasonId(seasonList, readiness, null);
    }
  }

  const seasonMeta = seasonId != null ? seasonList.find((s) => s.smId === seasonId) ?? null : null;
  if (competitionId == null && seasonMeta) {
    competitionId = seasonMeta.competitionId;
  }
  const competitionMeta =
    competitionId != null
      ? competitionList.find((c) => c.smId === competitionId) ?? null
      : null;

  if (seasonId == null) {
    return {
      competition: competitionMeta,
      season: null,
      competitions: competitionList,
      seasons: seasonsForPayload,
      ratingLeaders: [],
      recent: [],
      upcoming: [],
      updatedAt,
    };
  }

  const { data: teams } = await client.from("glpm_teams").select("sm_id,name");
  const teamName = new Map(
    (teams ?? []).map((t) => [t.sm_id, t.name] as const)
  );

  // Latest vector per team in season
  const { data: vectorRows } = await client
    .from("glpm_team_rating_vectors")
    .select("*")
    .eq("season_id", seasonId)
    .order("as_of_date", { ascending: false });

  const latestByTeam = new Map<number, NonNullable<typeof vectorRows>[number]>();
  for (const row of vectorRows ?? []) {
    if (!latestByTeam.has(row.team_sm_id)) {
      latestByTeam.set(row.team_sm_id, row);
    }
  }

  const vectorsByTeam = new Map<number, LoadedRatingVector>();
  const ratingLeaders: GlpmHubRatingLeader[] = [];
  for (const row of latestByTeam.values()) {
    const loaded = vectorFromRow(row);
    loaded.teamName = teamName.get(row.team_sm_id) ?? `Team ${row.team_sm_id}`;
    vectorsByTeam.set(row.team_sm_id, loaded);
    ratingLeaders.push({
      teamSmId: loaded.teamSmId,
      teamName: loaded.teamName!,
      overall: meanRatings(loaded.ratings),
      attack: loaded.ratings.attack,
      defence: loaded.ratings.defence,
      goalkeeper: loaded.ratings.goalkeeper,
      buildUp: loaded.ratings.build_up,
      possession: loaded.ratings.possession,
      pressing: loaded.ratings.pressing,
      finishing: loaded.ratings.finishing,
      asOfDate: loaded.asOfDate,
    });
  }
  ratingLeaders.sort((a, b) => b.overall - a.overall);

  const { data: finishedMatches } = await client
    .from("glpm_matches")
    .select(
      "sm_id,home_team_sm_id,away_team_sm_id,home_score,away_score,match_date,kickoff_at,venue,gameweek,status"
    )
    .eq("season_id", seasonId)
    .not("home_score", "is", null)
    .not("away_score", "is", null)
    .order("match_date", { ascending: false })
    .limit(40);

  const { data: openMatches } = await client
    .from("glpm_matches")
    .select(
      "sm_id,home_team_sm_id,away_team_sm_id,home_score,away_score,match_date,kickoff_at,venue,gameweek,status"
    )
    .eq("season_id", seasonId)
    .or("home_score.is.null,away_score.is.null")
    .order("match_date", { ascending: true })
    .limit(24);

  const finished = finishedMatches ?? [];
  const upcomingRows = [...(openMatches ?? [])].sort((a, b) => {
    const da = a.kickoff_at ?? a.match_date ?? "";
    const db = b.kickoff_at ?? b.match_date ?? "";
    return da.localeCompare(db);
  });

  const recentSlice = finished.slice(0, 12);
  const recentIds = recentSlice.map((m) => m.sm_id);

  const { data: statsRows } =
    recentIds.length > 0
      ? await client
          .from("glpm_match_team_stats")
          .select(
            "match_sm_id,team_sm_id,is_home,goals,xg,shots,shots_on_target,possession_pct,ppda"
          )
          .in("match_sm_id", recentIds)
      : { data: [] as never[] };

  const statsByMatch = new Map<
    number,
    { home: GlpmHubMatchSummaryStats | null; away: GlpmHubMatchSummaryStats | null }
  >();
  for (const s of statsRows ?? []) {
    const cur = statsByMatch.get(s.match_sm_id) ?? { home: null, away: null };
    const block: GlpmHubMatchSummaryStats = {
      goals: s.goals,
      xg: s.xg != null ? Number(s.xg) : null,
      shots: s.shots,
      shotsOnTarget: s.shots_on_target,
      possession: s.possession_pct != null ? Number(s.possession_pct) : null,
      ppda: s.ppda != null ? Number(s.ppda) : null,
    };
    if (s.is_home) cur.home = block;
    else cur.away = block;
    statsByMatch.set(s.match_sm_id, cur);
  }

  const { data: predRows } =
    recentIds.length > 0
      ? await client
          .from("glpm_prediction_history")
          .select(
            "match_sm_id,home_win_pct,draw_pct,away_win_pct,home_xg,away_xg,executed_at"
          )
          .in("match_sm_id", recentIds)
          .order("executed_at", { ascending: false })
      : { data: [] as never[] };

  const predByMatch = new Map<number, NonNullable<typeof predRows>[number]>();
  for (const p of predRows ?? []) {
    if (p.match_sm_id != null && !predByMatch.has(p.match_sm_id)) {
      predByMatch.set(p.match_sm_id, p);
    }
  }

  const recent: GlpmHubRecentMatch[] = recentSlice.map((m) => {
    const stats = statsByMatch.get(m.sm_id);
    const stored = predByMatch.get(m.sm_id);
    let model: GlpmHubRecentMatch["model"] = null;
    if (stored) {
      model = {
        homeWin: Number(stored.home_win_pct),
        draw: Number(stored.draw_pct),
        awayWin: Number(stored.away_win_pct),
        homeXg: Number(stored.home_xg),
        awayXg: Number(stored.away_xg),
      };
    } else {
      const hv = vectorsByTeam.get(m.home_team_sm_id);
      const av = vectorsByTeam.get(m.away_team_sm_id);
      if (hv && av) {
        const p = predictFromVectors(hv, av);
        model = {
          homeWin: p.homeWin,
          draw: p.draw,
          awayWin: p.awayWin,
          homeXg: p.homeXg,
          awayXg: p.awayXg,
        };
      }
    }
    return {
      matchSmId: m.sm_id,
      homeName: teamName.get(m.home_team_sm_id) ?? `Team ${m.home_team_sm_id}`,
      awayName: teamName.get(m.away_team_sm_id) ?? `Team ${m.away_team_sm_id}`,
      homeTeamSmId: m.home_team_sm_id,
      awayTeamSmId: m.away_team_sm_id,
      homeGoals: m.home_score,
      awayGoals: m.away_score,
      date: m.match_date,
      homeStats: stats?.home ?? null,
      awayStats: stats?.away ?? null,
      model,
    };
  });

  const upcoming: GlpmHubUpcomingMatch[] = upcomingRows.map((m) => {
    const hv = vectorsByTeam.get(m.home_team_sm_id);
    const av = vectorsByTeam.get(m.away_team_sm_id);
    const prediction =
      hv && av
        ? predictFromVectors(hv, av)
        : null;
    return {
      matchSmId: m.sm_id,
      homeName: teamName.get(m.home_team_sm_id) ?? `Team ${m.home_team_sm_id}`,
      awayName: teamName.get(m.away_team_sm_id) ?? `Team ${m.away_team_sm_id}`,
      homeTeamSmId: m.home_team_sm_id,
      awayTeamSmId: m.away_team_sm_id,
      date: m.match_date,
      kickoffAt: m.kickoff_at,
      venue: m.venue,
      gameweek: m.gameweek,
      prediction,
    };
  });

  return {
    competition: competitionMeta,
    season: seasonMeta
      ? { smId: seasonMeta.smId, name: seasonMeta.name }
      : null,
    competitions: competitionList,
    seasons: seasonsForPayload,
    ratingLeaders: ratingLeaders.slice(0, 20),
    recent,
    upcoming,
    updatedAt,
  };
}
