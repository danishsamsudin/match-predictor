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
  GlpmHubWeather,
} from "@/lib/glpm/hub-types";
import { hubPredictionFromHistoryRow } from "@/lib/glpm/hub-prediction-map";
import {
  buildCompetitionMeanVector,
  meanPrimaryRatings,
  predictionSourceFromResolved,
  resolveHubTeamVector,
} from "@/lib/glpm/hub-vector-resolve";
import { resolveHubMatchWeather } from "@/lib/glpm/hub-weather";
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

async function loadLatestAnySeasonVectors(
  client: Client,
  teamIds: number[],
  teamName: Map<number, string>
): Promise<Map<number, LoadedRatingVector>> {
  const out = new Map<number, LoadedRatingVector>();
  const missing = [...new Set(teamIds)].filter((id) => Number.isFinite(id));
  if (!missing.length) return out;

  const { data: rows } = await client
    .from("glpm_team_rating_vectors")
    .select("*")
    .in("team_sm_id", missing)
    .order("as_of_date", { ascending: false });

  for (const row of rows ?? []) {
    if (out.has(row.team_sm_id)) continue;
    const loaded = vectorFromRow(row);
    loaded.teamName = teamName.get(row.team_sm_id) ?? `Team ${row.team_sm_id}`;
    out.set(row.team_sm_id, loaded);
  }
  return out;
}

export async function loadGlpmHubPayload(
  client: Client,
  opts: {
    seasonId?: number | null;
    competitionId?: number | null;
    /** Prefer seasons with open-score fixtures (home upcoming preview). */
    preferFixtures?: boolean;
    /** Attach Open-Meteo / Sportmonks weather on upcoming cards (default true). */
    includeWeather?: boolean;
    /** Cap for open-score fixtures (default 24; home uses a higher limit). */
    upcomingLimit?: number;
  } = {}
): Promise<GlpmHubPayload> {
  const updatedAt = new Date().toISOString();
  const includeWeather = opts.includeWeather !== false;
  const upcomingLimit = Math.max(1, opts.upcomingLimit ?? 24);

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

  const { data: teams } = await client.from("glpm_teams").select("sm_id,name,city");
  const teamName = new Map((teams ?? []).map((t) => [t.sm_id, t.name] as const));
  const teamCity = new Map(
    (teams ?? [])
      .filter((t) => t.city != null && String(t.city).trim())
      .map((t) => [t.sm_id, String(t.city)] as const)
  );

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

  const seasonVectors = new Map<number, LoadedRatingVector>();
  const ratingLeaders: GlpmHubRatingLeader[] = [];
  for (const row of latestByTeam.values()) {
    const loaded = vectorFromRow(row);
    loaded.teamName = teamName.get(row.team_sm_id) ?? `Team ${row.team_sm_id}`;
    seasonVectors.set(row.team_sm_id, loaded);
    ratingLeaders.push({
      teamSmId: loaded.teamSmId,
      teamName: loaded.teamName!,
      overall: meanPrimaryRatings(loaded.ratings),
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

  let competitionVectorsForMean = [...seasonVectors.values()];
  if (competitionId != null && competitionVectorsForMean.length === 0) {
    const competitionSeasonIds = seasonList
      .filter((s) => s.competitionId === competitionId)
      .map((s) => s.smId);
    if (competitionSeasonIds.length) {
      const { data: compRows } = await client
        .from("glpm_team_rating_vectors")
        .select("*")
        .in("season_id", competitionSeasonIds)
        .order("as_of_date", { ascending: false });
      const latestComp = new Map<number, NonNullable<typeof compRows>[number]>();
      for (const row of compRows ?? []) {
        if (!latestComp.has(row.team_sm_id)) latestComp.set(row.team_sm_id, row);
      }
      competitionVectorsForMean = [...latestComp.values()].map((row) => {
        const loaded = vectorFromRow(row);
        loaded.teamName = teamName.get(row.team_sm_id) ?? `Team ${row.team_sm_id}`;
        return loaded;
      });

      if (!ratingLeaders.length && competitionVectorsForMean.length) {
        for (const loaded of competitionVectorsForMean) {
          ratingLeaders.push({
            teamSmId: loaded.teamSmId,
            teamName: loaded.teamName ?? `Team ${loaded.teamSmId}`,
            overall: meanPrimaryRatings(loaded.ratings),
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
      }
    }
  }

  const competitionMean = buildCompetitionMeanVector(competitionVectorsForMean, {
    teamSmId: 0,
    seasonId,
  });

  const { data: finishedMatches } = await client
    .from("glpm_matches")
    .select(
      "sm_id,home_team_sm_id,away_team_sm_id,home_score,away_score,match_date,kickoff_at,venue,gameweek,status,payload"
    )
    .eq("season_id", seasonId)
    .not("home_score", "is", null)
    .not("away_score", "is", null)
    .order("match_date", { ascending: false })
    .limit(40);

  const { data: openMatches } = await client
    .from("glpm_matches")
    .select(
      "sm_id,home_team_sm_id,away_team_sm_id,home_score,away_score,match_date,kickoff_at,venue,venue_sm_id,gameweek,status,payload"
    )
    .eq("season_id", seasonId)
    .or("home_score.is.null,away_score.is.null")
    .order("match_date", { ascending: true })
    .limit(upcomingLimit);

  const finished = finishedMatches ?? [];
  const upcomingRows = [...(openMatches ?? [])].sort((a, b) => {
    const da = a.kickoff_at ?? a.match_date ?? "";
    const db = b.kickoff_at ?? b.match_date ?? "";
    return da.localeCompare(db);
  });

  const fixtureTeamIds = [
    ...finished.flatMap((m) => [m.home_team_sm_id, m.away_team_sm_id]),
    ...upcomingRows.flatMap((m) => [m.home_team_sm_id, m.away_team_sm_id]),
  ];
  const teamsNeedingFallback = fixtureTeamIds.filter((id) => !seasonVectors.has(id));
  const anySeasonVectors = await loadLatestAnySeasonVectors(
    client,
    teamsNeedingFallback,
    teamName
  );

  const recentSlice = finished.slice(0, 12);
  const recentIds = recentSlice.map((m) => m.sm_id);
  const upcomingIds = upcomingRows.map((m) => m.sm_id);
  const historyIds = [...new Set([...recentIds, ...upcomingIds])];

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
    historyIds.length > 0
      ? await client
          .from("glpm_prediction_history")
          .select(
            "match_sm_id,home_win_pct,draw_pct,away_win_pct,home_xg,away_xg,btts_yes_pct,over_under,executed_at"
          )
          .in("match_sm_id", historyIds)
          .order("executed_at", { ascending: false })
      : { data: [] as never[] };

  const predByMatch = new Map<number, NonNullable<typeof predRows>[number]>();
  for (const p of predRows ?? []) {
    if (p.match_sm_id != null && !predByMatch.has(p.match_sm_id)) {
      predByMatch.set(p.match_sm_id, p);
    }
  }

  const resolvePair = (homeTeamSmId: number, awayTeamSmId: number) => {
    const home = resolveHubTeamVector(
      homeTeamSmId,
      seasonVectors,
      anySeasonVectors,
      competitionMean
    );
    const away = resolveHubTeamVector(
      awayTeamSmId,
      seasonVectors,
      anySeasonVectors,
      competitionMean
    );
    return { home, away };
  };

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
      const { home, away } = resolvePair(m.home_team_sm_id, m.away_team_sm_id);
      if (home && away) {
        const p = predictFromVectors(home.vector, away.vector);
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

  const weatherByMatch = new Map<number, GlpmHubWeather>();
  if (includeWeather && upcomingRows.length) {
    const venueIds = [
      ...new Set(
        upcomingRows
          .map((m) => m.venue_sm_id)
          .filter((id): id is number => id != null && Number.isFinite(id))
      ),
    ];
    const venuesById = new Map<
      number,
      {
        name: string;
        city_name: string | null;
        latitude: number;
        longitude: number;
      }
    >();
    if (venueIds.length) {
      const { data: venueRows } = await client
        .from("glpm_venues")
        .select("sm_id,name,city_name,latitude,longitude")
        .in("sm_id", venueIds);
      for (const v of venueRows ?? []) {
        venuesById.set(v.sm_id, {
          name: v.name,
          city_name: v.city_name,
          latitude: Number(v.latitude),
          longitude: Number(v.longitude),
        });
      }
    }

    await Promise.all(
      upcomingRows.map(async (m) => {
        // Match venue_sm_id is the home ground — never use away-team location.
        const stored =
          m.venue_sm_id != null ? venuesById.get(m.venue_sm_id) ?? null : null;
        try {
          const weather = await resolveHubMatchWeather({
            payload: m.payload,
            venueName: m.venue ?? stored?.name ?? null,
            homeTeamCity: teamCity.get(m.home_team_sm_id) ?? null,
            matchDate: m.match_date,
            kickoffAt: m.kickoff_at,
            storedVenue: stored,
          });
          weatherByMatch.set(m.sm_id, weather);
        } catch {
          weatherByMatch.set(m.sm_id, {
            status: "tbc",
            condition: "TBC",
            tempC: null,
            source: "pending",
            venueName: m.venue ?? stored?.name ?? null,
            cityName: stored?.city_name ?? teamCity.get(m.home_team_sm_id) ?? null,
          });
        }
      })
    );
  }

  const upcoming: GlpmHubUpcomingMatch[] = upcomingRows.map((m) => {
    const stored = predByMatch.get(m.sm_id);
    const { home, away } = resolvePair(m.home_team_sm_id, m.away_team_sm_id);

    let prediction: GlpmHubUpcomingMatch["prediction"] = null;
    let predictionSource: GlpmHubUpcomingMatch["predictionSource"] = null;

    if (stored) {
      prediction = hubPredictionFromHistoryRow(stored);
      predictionSource = "stored";
    } else if (home && away) {
      prediction = predictFromVectors(home.vector, away.vector);
      predictionSource = predictionSourceFromResolved(home, away, false);
    }

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
      predictionSource,
      weather: weatherByMatch.get(m.sm_id) ?? null,
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

export { meanPrimaryRatings as meanRatings, PRIMARY_ORDER };
