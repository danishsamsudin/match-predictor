import type { SupabaseClient } from "@supabase/supabase-js";
import { tryCreateServiceClient } from "@/lib/supabase";

/** Until Supabase types include world_cup_* tables from migration 018. */
function wcDb(client: SupabaseClient) {
  return client as unknown as {
    from: (table: string) => {
      upsert: (row: unknown) => Promise<{ error: { message: string } | null }>;
      update: (row: unknown) => { eq: (col: string, val: string) => Promise<{ error: { message: string } | null }> };
    };
  };
}
import { enrichMatchEnvironment } from "@/lib/world-cup/enrich-matches";
import {
  buildTeamIdToGroupMap,
  inferGroupCodeFromDraw,
  resolveGroupCode,
} from "@/lib/world-cup/group-draw";
import { WORLD_CUP_FINALS_COMPETITION_OR } from "@/lib/world-cup/match-query";
import { filterWorldCup2026GroupStageMatches } from "@/lib/world-cup/tournament-fixtures";
import {
  isMatchday3Fixture,
  isMatchday3Pair,
  resolveGroupMatchday3Strategy,
  resolveSingleFixtureMotivation,
} from "@/lib/world-cup/motivation";
import {
  loadInternationalFormMatchesForTeam,
  type InternationalFormMatch,
} from "@/lib/world-cup/load-international-form";
import {
  baselineMd3Probs,
  runWorldCupPrediction,
  standingsForGroup,
} from "@/lib/world-cup/predict";
import {
  resolveMatchPhase,
  shouldRefreshHubPrediction,
} from "@/lib/world-cup/match-kickoff";
import {
  computeAllGroupStandings,
  type WcMatchRow,
} from "@/lib/world-cup/standings";

export type WorldCupSyncResult = {
  ok: boolean;
  matchesEnriched: number;
  predictionsUpserted: number;
  errors: string[];
};

type WcMatchWithMeta = WcMatchRow & {
  competition?: string | null;
  round?: string | null;
};

function mapMatchRow(
  row: Record<string, unknown>,
  teamNames: Map<string, string>,
  teamToGroup: Map<string, string>
): WcMatchWithMeta {
  const homeId = row.home_team_id as string | null;
  const awayId = row.away_team_id as string | null;
  const competition = row.competition as string | null;
  const round = row.round as string | null;
  const date = row.date as string | null;
  return {
    id: row.id as string,
    date,
    time: row.time as string | null,
    group_code: resolveGroupCode({
      existing: row.group_code as string | null,
      competition,
      round,
      date,
      homeTeamId: homeId,
      awayTeamId: awayId,
      teamToGroup,
    }),
    status: (row.status as string | null) ?? "scheduled",
    home_team_id: homeId,
    away_team_id: awayId,
    home_goals: row.home_goals as number | null,
    away_goals: row.away_goals as number | null,
    home_team_name: homeId ? teamNames.get(homeId) : undefined,
    away_team_name: awayId ? teamNames.get(awayId) : undefined,
    venue_city: (row.venue_city as string | null) ?? (row.venue as string | null),
    venue: row.venue as string | null,
    competition,
    round,
  };
}

export async function runWorldCupHubSync(): Promise<WorldCupSyncResult> {
  const supabase = tryCreateServiceClient();
  const errors: string[] = [];
  if (!supabase) {
    return { ok: false, matchesEnriched: 0, predictionsUpserted: 0, errors: ["No Supabase client"] };
  }

  const { data: teams } = await supabase.from("teams").select("id, name");
  const teamNames = new Map((teams ?? []).map((t) => [t.id, t.name]));
  const teamToGroup = buildTeamIdToGroupMap(teamNames);

  const { data: rawMatches, error: matchErr } = await supabase
    .from("matches")
    .select(
      "id, date, time, venue, round, competition, group_code, home_team_id, away_team_id, home_goals, away_goals"
    )
    .or(WORLD_CUP_FINALS_COMPETITION_OR);

  if (matchErr) {
    return { ok: false, matchesEnriched: 0, predictionsUpserted: 0, errors: [matchErr.message] };
  }

  const mapped: WcMatchWithMeta[] = (rawMatches ?? []).map((r) =>
    mapMatchRow(r as Record<string, unknown>, teamNames, teamToGroup)
  );
  let matches = filterWorldCup2026GroupStageMatches(mapped, teamToGroup) as WcMatchWithMeta[];

  let matchesEnriched = 0;
  for (const m of matches) {
    const patch = enrichMatchEnvironment(m, matches, teamNames, {
      teamToGroup,
      competition: m.competition,
      round: m.round,
    });
    const updatePayload: Record<string, unknown> = {
      status: patch.status,
    };
    if (patch.group_code) updatePayload.group_code = patch.group_code;
    try {
      Object.assign(updatePayload, {
        venue: patch.venue,
        venue_city: patch.venue_city,
        venue_altitude_meters: patch.venue_altitude_meters,
        rest_hours_home: patch.rest_hours_home,
        rest_hours_away: patch.rest_hours_away,
      });
    } catch {
      /* columns may not exist until migration 018 applied */
    }
    const { error } = await wcDb(supabase).from("matches").update(updatePayload).eq("id", m.id);
    if (!error) {
      matchesEnriched += 1;
      Object.assign(m, patch);
      m.status = patch.status ?? m.status;
      if (patch.group_code) m.group_code = patch.group_code;
    }
  }

  const allStandings = computeAllGroupStandings(matches, teamNames);
  const md3GroupsProcessed = new Set<string>();

  let predictionsUpserted = 0;
  const upcoming = matches.filter(
    (m) => m.status === "scheduled" && m.home_team_id && m.away_team_id
  );

  const internationalFormCache = new Map<string, InternationalFormMatch[]>();
  async function formForTeam(teamId: string, teamName: string): Promise<InternationalFormMatch[]> {
    const cached = internationalFormCache.get(teamId);
    if (cached) return cached;
    const loaded = await loadInternationalFormMatchesForTeam(supabase, teamId, teamName);
    internationalFormCache.set(teamId, loaded);
    return loaded;
  }

  for (const match of upcoming) {
    const phase = resolveMatchPhase({
      status: match.status,
      homeGoals: match.home_goals,
      awayGoals: match.away_goals,
      date: match.date,
      time: match.time,
      venueCity: match.venue_city,
    });
    if (!shouldRefreshHubPrediction(phase)) {
      continue;
    }

    let groupCode =
      match.group_code ??
      resolveGroupCode({
        existing: null,
        competition: match.competition,
        round: match.round,
        date: match.date,
        homeTeamId: match.home_team_id,
        awayTeamId: match.away_team_id,
        teamToGroup,
      }) ??
      (match.home_team_id && match.away_team_id
        ? inferGroupCodeFromDraw(match.home_team_id, match.away_team_id, teamToGroup)
        : null);
    if (groupCode) match.group_code = groupCode;
    if (!groupCode) {
      errors.push(`Skipped ${match.id}: could not resolve group for tournament fixture`);
      continue;
    }

    const standings = standingsForGroup(groupCode, allStandings);
    const finished = matches.filter((x) => x.status === "finished");

    let motivation;
    const groupFixtures = upcoming.filter((f) => f.group_code === groupCode);
    if (
      isMatchday3Fixture(match.home_team_id!, matches) &&
      isMatchday3Pair(groupFixtures) &&
      !md3GroupsProcessed.has(groupCode)
    ) {
      md3GroupsProcessed.add(groupCode);
      const pair = groupFixtures.slice(0, 2) as [WcMatchRow, WcMatchRow];
      const base = baselineMd3Probs(1.35, 1.25);
      const { matchA, matchB } = resolveGroupMatchday3Strategy(pair, standings, base);
      for (const [fx, mot] of [
        [pair[0], matchA],
        [pair[1], matchB],
      ] as const) {
        const env = enrichMatchEnvironment(fx, matches, teamNames, {
          teamToGroup,
          competition: fx.competition,
          round: fx.round,
        });
        const pred = await runWorldCupPrediction({
          match: fx,
          homeName: fx.home_team_name ?? "Home",
          awayName: fx.away_team_name ?? "Away",
          finishedMatches: finished,
          homeFormMatches: await formForTeam(
            fx.home_team_id!,
            fx.home_team_name ?? "Home"
          ),
          awayFormMatches: await formForTeam(
            fx.away_team_id!,
            fx.away_team_name ?? "Away"
          ),
          motivation: mot,
          priorHomeVenueTz: env.prior_home_tz,
          priorAwayVenueTz: env.prior_away_tz,
        });
        const { error } = await wcDb(supabase).from("world_cup_predictions").upsert({
          match_id: fx.id,
          ...pred,
          computed_at: new Date().toISOString(),
        });
        if (!error) predictionsUpserted += 1;
        else errors.push(error.message);
      }
      continue;
    }

    if (md3GroupsProcessed.has(groupCode) && isMatchday3Fixture(match.home_team_id!, matches)) {
      continue;
    }

    motivation = resolveSingleFixtureMotivation(
      match.home_team_id!,
      match.away_team_id!,
      standings,
      match.home_team_name ?? "Home",
      match.away_team_name ?? "Away"
    );

    const env = enrichMatchEnvironment(match, matches, teamNames, {
      teamToGroup,
      competition: match.competition,
      round: match.round,
    });
    const pred = await runWorldCupPrediction({
      match,
      homeName: match.home_team_name ?? "Home",
      awayName: match.away_team_name ?? "Away",
      finishedMatches: finished,
      homeFormMatches: await formForTeam(
        match.home_team_id!,
        match.home_team_name ?? "Home"
      ),
      awayFormMatches: await formForTeam(
        match.away_team_id!,
        match.away_team_name ?? "Away"
      ),
      motivation,
      priorHomeVenueTz: env.prior_home_tz,
      priorAwayVenueTz: env.prior_away_tz,
    });

    const { error } = await wcDb(supabase).from("world_cup_predictions").upsert({
      match_id: match.id,
      ...pred,
      computed_at: new Date().toISOString(),
    });
    if (!error) predictionsUpserted += 1;
    else errors.push(error.message);
  }

  return {
    ok: errors.length === 0,
    matchesEnriched,
    predictionsUpserted,
    errors,
  };
}
