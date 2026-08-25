import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../supabase";
import { estimateShotBasedXgProxy, SM_STAT_TYPE } from "../../../sportmonks/statTypes";
import type { SmEvent, SmFixture, SmParticipant, SmScore } from "../../../sportmonks/types";
import {
  ensureFixturePlayersReferenced,
  upsertSportmonksTeam,
} from "./mapEntities";
import { upsertSportmonksGkStats } from "./mapLineupPlayerStats";
import {
  computeBallRecoveriesProxy,
  computeDefensiveActions,
  computeFinalThirdEntriesProxy,
  computeHighTurnoversProxy,
  computePpdaProxy,
  computeProgressivePassesProxy,
  mergeXgFixtureIntoMaps,
  statsForParticipant,
  sumLineupGkSavesByTeam,
} from "./proxies";
import { upsertProviderPayload } from "../upsertPayload";

type Client = SupabaseClient<Database>;
type StatsInsert = Database["public"]["Tables"]["glpm_match_team_stats"]["Insert"];
type MatchInsert = Database["public"]["Tables"]["glpm_matches"]["Insert"];
type EventInsert = Database["public"]["Tables"]["glpm_match_events"]["Insert"];

export function resolveParticipants(fixture: SmFixture): {
  home: SmParticipant;
  away: SmParticipant;
} {
  const parts = fixture.participants ?? [];
  const home = parts.find((p) => p.meta?.location === "home");
  const away = parts.find((p) => p.meta?.location === "away");
  if (!home || !away) {
    throw new Error(`Cannot resolve home/away participants for fixture ${fixture.id}`);
  }
  return { home, away };
}

function currentGoals(scores: SmScore[] | undefined, participantId: number): number | null {
  if (!scores?.length) return null;
  const preferred = scores.find(
    (s) =>
      s.participant_id === participantId &&
      (s.description === "CURRENT" || s.description === "2ND_HALF" || s.description === "FULLTIME")
  );
  const any = preferred ?? scores.find((s) => s.participant_id === participantId);
  const g = any?.score?.goals;
  return typeof g === "number" ? g : null;
}

/**
 * Resolve team xG from plan-available statistics only.
 * Provider Expected Goals (5304) is preferred when present; otherwise a
 * shot/SoT/big-chance proxy keeps rating engines trainable without xGFixture.
 */
function resolveTeamXg(map: Map<number, number>): {
  xg: number | null;
  fromProxy: boolean;
} {
  const provider = map.get(SM_STAT_TYPE.EXPECTED_GOALS) ?? null;
  if (provider != null) return { xg: provider, fromProxy: false };
  const proxy = estimateShotBasedXgProxy({
    shots: map.get(SM_STAT_TYPE.SHOTS_TOTAL) ?? null,
    shotsOnTarget: map.get(SM_STAT_TYPE.SHOTS_ON_TARGET) ?? null,
    bigChances: map.get(SM_STAT_TYPE.BIG_CHANCES) ?? null,
  });
  return { xg: proxy, fromProxy: proxy != null };
}

function resolvePsxgFaced(
  oppMap: Map<number, number>,
  oppXg: number | null
): { psxg: number | null; fromProxy: boolean } {
  const provider = oppMap.get(SM_STAT_TYPE.EXPECTED_GOALS_ON_TARGET) ?? null;
  if (provider != null) return { psxg: provider, fromProxy: false };
  if (oppXg != null) {
    return { psxg: Math.round(oppXg * 0.85 * 1000) / 1000, fromProxy: true };
  }
  return { psxg: null, fromProxy: false };
}

export function mapSportmonksFixture(fixture: SmFixture): MatchInsert {
  const { home, away } = resolveParticipants(fixture);
  const starting = fixture.starting_at;
  const matchDate = starting ? starting.slice(0, 10) : null;
  const kickoff = starting
    ? new Date(starting.includes("T") ? starting : starting.replace(" ", "T") + "Z").toISOString()
    : null;

  const roundName = fixture.round?.name;
  const gameweek =
    roundName != null && /^\d+$/.test(String(roundName).trim())
      ? Number(roundName)
      : null;

  return {
    sm_id: fixture.id,
    competition_id: fixture.league_id ?? fixture.league?.id ?? null,
    season_id: fixture.season_id ?? fixture.season?.id ?? null,
    league_sm_id: fixture.league_id ?? fixture.league?.id ?? null,
    state_id: fixture.state_id ?? fixture.state?.id ?? null,
    venue_sm_id: fixture.venue_id ?? fixture.venue?.id ?? null,
    round_sm_id: fixture.round_id ?? fixture.round?.id ?? null,
    gameweek,
    match_date: matchDate,
    kickoff_at: kickoff && Number.isFinite(Date.parse(kickoff)) ? kickoff : null,
    home_team_sm_id: home.id,
    away_team_sm_id: away.id,
    venue: fixture.venue?.name ?? null,
    referee_sm_id: null,
    status: fixture.state?.name ?? fixture.state?.short_name ?? null,
    home_score: currentGoals(fixture.scores, home.id),
    away_score: currentGoals(fixture.scores, away.id),
    duration_minutes: fixture.length ?? 90,
    payload: fixture as unknown,
    synced_at: new Date().toISOString(),
  };
}

export function mapSportmonksTeamStats(args: {
  fixture: SmFixture;
  homeId: number;
  awayId: number;
}): StatsInsert[] {
  const { fixture, homeId, awayId } = args;
  const homeMap = statsForParticipant(fixture.statistics, homeId);
  const awayMap = statsForParticipant(fixture.statistics, awayId);
  mergeXgFixtureIntoMaps(fixture, homeId, awayId, homeMap, awayMap);
  const lineupGkSaves = sumLineupGkSavesByTeam(fixture);

  const homeXgRes = resolveTeamXg(homeMap);
  const awayXgRes = resolveTeamXg(awayMap);
  const homePsxg = resolvePsxgFaced(awayMap, awayXgRes.xg);
  const awayPsxg = resolvePsxgFaced(homeMap, homeXgRes.xg);

  function side(
    teamId: number,
    isHome: boolean,
    map: Map<number, number>,
    xgRes: { xg: number | null; fromProxy: boolean },
    psxgRes: { psxg: number | null; fromProxy: boolean },
    oppId: number,
    oppMap: Map<number, number>,
    oppXg: number | null
  ): StatsInsert {
    const shots = map.get(SM_STAT_TYPE.SHOTS_TOTAL) ?? null;
    const sot = map.get(SM_STAT_TYPE.SHOTS_ON_TARGET) ?? null;
    const passes = map.get(SM_STAT_TYPE.PASSES) ?? null;
    const succ = map.get(SM_STAT_TYPE.ACCURATE_PASSES) ?? null;
    const xg = xgRes.xg;
    const psxgFaced = psxgRes.psxg;
    const npxgProvider = map.get(SM_STAT_TYPE.NPXG) ?? null;
    const defensiveActions = computeDefensiveActions(map);
    const ppda = computePpdaProxy(map, oppMap);
    const ppdaSource = ppda != null ? ("sportmonks_proxy" as const) : null;
    const progressivePasses = computeProgressivePassesProxy(map);
    const finalThirdEntries = computeFinalThirdEntriesProxy(map);
    const ballRecoveries = computeBallRecoveriesProxy(map);
    const highTurnovers = computeHighTurnoversProxy(map);
    const teamGkSaves = map.get(SM_STAT_TYPE.SAVES) ?? lineupGkSaves.get(teamId) ?? null;
    const xgFromFixture = (fixture.xGFixture ?? []).some(
      (r) => r.participant_id === teamId && r.type_id === SM_STAT_TYPE.EXPECTED_GOALS
    );
    const psxgFromFixture = (fixture.xGFixture ?? []).some(
      (r) =>
        r.participant_id === oppId && r.type_id === SM_STAT_TYPE.EXPECTED_GOALS_ON_TARGET
    );
    return {
      match_sm_id: fixture.id,
      team_sm_id: teamId,
      is_home: isHome,
      goals: currentGoals(fixture.scores, teamId),
      xg,
      npxg: npxgProvider ?? xg,
      open_play_xg: null,
      set_piece_xg: null,
      shots,
      shots_on_target: sot,
      big_chances: map.get(SM_STAT_TYPE.BIG_CHANCES) ?? null,
      box_entries: map.get(SM_STAT_TYPE.SHOTS_INSIDE_BOX) ?? null,
      touches_in_box: null,
      progressive_passes: progressivePasses,
      progressive_carries: null,
      final_third_entries: finalThirdEntries,
      crosses: map.get(SM_STAT_TYPE.CROSSES) ?? null,
      through_balls: null,
      passes,
      successful_passes: succ,
      xg_conceded: map.get(SM_STAT_TYPE.EXPECTED_GOALS_AGAINST) ?? oppXg ?? null,
      shots_conceded: oppMap.get(SM_STAT_TYPE.SHOTS_TOTAL) ?? null,
      big_chances_conceded: oppMap.get(SM_STAT_TYPE.BIG_CHANCES) ?? null,
      box_entries_allowed: null,
      blocks: map.get(SM_STAT_TYPE.BLOCKS) ?? null,
      interceptions: map.get(SM_STAT_TYPE.INTERCEPTIONS) ?? null,
      tackles: map.get(SM_STAT_TYPE.TACKLES) ?? null,
      clearances: map.get(SM_STAT_TYPE.CLEARANCES) ?? null,
      pressures: null,
      pressing_duels: null,
      ppda,
      ppda_allowed: null,
      ball_recoveries: ballRecoveries,
      high_turnovers: highTurnovers,
      defensive_actions: defensiveActions,
      possession_pct: map.get(SM_STAT_TYPE.BALL_POSSESSION) ?? null,
      pass_completion_pct:
        passes != null && succ != null && passes > 0 ? (succ / passes) * 100 : null,
      field_tilt: null,
      territory_pct: null,
      psxg_faced: psxgFaced,
      gk_saves: teamGkSaves != null ? Math.round(teamGkSaves) : null,
      goals_prevented:
        map.get(SM_STAT_TYPE.EXPECTED_GOALS_PREVENTED) ??
        (psxgFaced != null && currentGoals(fixture.scores, oppId) != null
          ? psxgFaced - (currentGoals(fixture.scores, oppId) as number)
          : null),
      xg_source: xg != null && !xgRes.fromProxy ? "sportmonks" : null,
      psxg_source: psxgFaced != null && !psxgRes.fromProxy ? "sportmonks" : null,
      ppda_source: ppdaSource,
      validation_status: "pending",
      source_endpoint: `/fixtures/${fixture.id}`,
      payload: {
        teamId,
        opponentId: oppId,
        xg_proxy: xgRes.fromProxy,
        psxg_proxy: psxgRes.fromProxy,
        xg_from_xgfixture: xgFromFixture,
        psxg_from_xgfixture: psxgFromFixture,
        plan_note:
          "SportMonks xG Basic + proxies: Expected from statistics/xGFixture when present; PPDA from passes/defensive actions; build-up from key+long passes and dangerous attacks",
        build_up_proxy: progressivePasses != null || finalThirdEntries != null,
      } as unknown,
      synced_at: new Date().toISOString(),
    };
  }

  const homeSide = side(
    homeId,
    true,
    homeMap,
    homeXgRes,
    homePsxg,
    awayId,
    awayMap,
    awayXgRes.xg
  );
  const awaySide = side(
    awayId,
    false,
    awayMap,
    awayXgRes,
    awayPsxg,
    homeId,
    homeMap,
    homeXgRes.xg
  );
  // PPDA allowed = opponent pressing intensity (sibling team's PPDA).
  homeSide.ppda_allowed = awaySide.ppda ?? null;
  awaySide.ppda_allowed = homeSide.ppda ?? null;
  return [homeSide, awaySide];
}

export function mapSportmonksEvents(fixture: SmFixture): EventInsert[] {
  return (fixture.events ?? []).map((e: SmEvent) => ({
    event_id: e.id,
    match_sm_id: fixture.id,
    team_sm_id: e.participant_id ?? null,
    player_sm_id: e.player_id ?? null,
    source: "sportmonks" as const,
    match_period: null,
    event_sec: e.minute != null ? e.minute * 60 + (e.extra_minute ?? 0) : null,
    event_id_type: e.type_id ?? null,
    event_name: e.info ?? e.section ?? null,
    sub_event_id: null,
    sub_event_name: e.addition ?? null,
    pos_x: null,
    pos_y: null,
    tags: { sort_order: e.sort_order ?? null },
    xg: null,
    psxg: null,
    synced_at: new Date().toISOString(),
  }));
}

export async function upsertSportmonksFixtureBundle(
  supabase: Client,
  fixture: SmFixture,
  options?: { storeRaw?: boolean }
): Promise<{ match: MatchInsert; stats: StatsInsert[]; eventCount: number }> {
  if (options?.storeRaw !== false) {
    await upsertProviderPayload(supabase, {
      provider: "sportmonks",
      endpoint: `/fixtures/${fixture.id}`,
      entityType: "match",
      entityKey: String(fixture.id),
      payload: fixture,
    });
  }

  const { home, away } = resolveParticipants(fixture);

  if (fixture.league || fixture.league_id) {
    const leagueId = fixture.league?.id ?? fixture.league_id!;
    await supabase.from("glpm_competitions").upsert(
      {
        sm_id: leagueId,
        name: fixture.league?.name ?? `League ${leagueId}`,
        area_id: fixture.league?.country_id ?? null,
        payload: fixture.league ?? null,
        synced_at: new Date().toISOString(),
      },
      { onConflict: "sm_id" }
    );
  }

  if (fixture.season || fixture.season_id) {
    const seasonId = fixture.season?.id ?? fixture.season_id!;
    const competitionId = fixture.season?.league_id ?? fixture.league_id;
    if (competitionId != null) {
      await supabase.from("glpm_seasons").upsert(
        {
          sm_id: seasonId,
          competition_id: competitionId,
          name: fixture.season?.name ?? null,
          start_date: fixture.season?.starting_at ?? null,
          end_date: fixture.season?.ending_at ?? null,
          active: fixture.season?.is_current ?? false,
          payload: fixture.season ?? null,
          synced_at: new Date().toISOString(),
        },
        { onConflict: "sm_id" }
      );
    }
  }

  for (const p of [home, away]) {
    await upsertSportmonksTeam(supabase, p);
  }

  await ensureFixturePlayersReferenced(supabase, fixture);

  const match = mapSportmonksFixture(fixture);
  const { error: matchErr } = await supabase
    .from("glpm_matches")
    .upsert(match, { onConflict: "sm_id" });
  if (matchErr) throw new Error(`upsert match failed: ${matchErr.message}`);

  const stats = mapSportmonksTeamStats({
    fixture,
    homeId: home.id,
    awayId: away.id,
  });
  const { error: statsErr } = await supabase
    .from("glpm_match_team_stats")
    .upsert(stats, { onConflict: "match_sm_id,team_sm_id" });
  if (statsErr) throw new Error(`upsert stats failed: ${statsErr.message}`);

  await upsertSportmonksGkStats(supabase, {
    fixture,
    teamStats: stats,
    homeId: home.id,
    awayId: away.id,
  });

  const events = mapSportmonksEvents(fixture);
  if (events.length) {
    const { error: evErr } = await supabase
      .from("glpm_match_events")
      .upsert(events, { onConflict: "event_id" });
    if (evErr) throw new Error(`upsert events failed: ${evErr.message}`);
  }

  return { match, stats, eventCount: events.length };
}
