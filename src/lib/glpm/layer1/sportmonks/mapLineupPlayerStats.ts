/**
 * Map SportMonks lineups + team match stats → glpm_match_player_stats (GK).
 * Lineup details are optional; team-level psxg/saves/conceded fill gaps (SM-only path).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../supabase";
import { parseStatValue, SM_STAT_TYPE } from "../../../sportmonks/statTypes";
import type { SmFixture, SmLineup, SmScore } from "../../../sportmonks/types";

type Client = SupabaseClient<Database>;
type PlayerStatsInsert = Database["public"]["Tables"]["glpm_match_player_stats"]["Insert"];
type TeamStatsInsert = Database["public"]["Tables"]["glpm_match_team_stats"]["Insert"];

/** SportMonks lineup detail type_ids used for GK rows. */
const LINEUP_STAT = {
  MINUTES: 119,
  PASSES: 80,
  PASSES_COMPLETED: 116,
  AERIALS_WON: 107,
  PENALTIES_SAVED: 113,
  SAVES_IN_BOX: 104,
  GOALS_CONCEDED: 88,
} as const;

const GK_POSITION_IDS = new Set([24, 25]);
/** Starting XI row in SportMonks lineups. */
const LINEUP_STARTING = 11;

function lineupDetailValue(lineup: SmLineup, typeId: number): number | null {
  for (const d of lineup.details ?? []) {
    if (d.type_id !== typeId) continue;
    return parseStatValue(d.data?.value ?? d.value);
  }
  return null;
}

export function isGoalkeeperLineup(lineup: SmLineup): boolean {
  if (lineup.position_id != null && GK_POSITION_IDS.has(lineup.position_id)) return true;
  if (lineup.type_id != null && GK_POSITION_IDS.has(lineup.type_id)) return true;
  const saves = lineupDetailValue(lineup, SM_STAT_TYPE.SAVES);
  if (saves != null && saves > 0) return true;
  const posName = (
    lineup.position?.name ??
    lineup.player?.position?.name ??
    ""
  ).toLowerCase();
  return posName.includes("goalkeeper") || posName === "gk";
}

function findGkLineupForTeam(fixture: SmFixture, teamId: number): SmLineup | null {
  const gks = (fixture.lineups ?? []).filter(
    (l) => l.team_id === teamId && isGoalkeeperLineup(l)
  );
  if (!gks.length) return null;
  return gks.find((l) => l.type_id === LINEUP_STARTING) ?? gks[0] ?? null;
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

function baseGkRow(args: {
  fixture: SmFixture;
  lineup: SmLineup;
  teamStat?: TeamStatsInsert;
  oppTeamStat?: TeamStatsInsert;
  homeId: number;
  awayId: number;
}): PlayerStatsInsert | null {
  const { fixture, lineup, teamStat, oppTeamStat, homeId, awayId } = args;
  const playerId = lineup.player_id;
  const teamId = lineup.team_id;
  if (!playerId || !teamId) return null;

  const oppId = teamId === homeId ? awayId : homeId;
  const goalsFromLineup = lineupDetailValue(lineup, LINEUP_STAT.GOALS_CONCEDED);
  const goalsConceded =
    goalsFromLineup != null
      ? Math.round(Math.max(0, goalsFromLineup))
      : currentGoals(fixture.scores, oppId);

  const minutes =
    lineupDetailValue(lineup, LINEUP_STAT.MINUTES) ??
    (lineup.minutes != null ? lineup.minutes : null);

  const gkSaves =
    lineupDetailValue(lineup, SM_STAT_TYPE.SAVES) ?? teamStat?.gk_saves ?? null;

  const psxgFaced = teamStat?.psxg_faced ?? null;
  const shotsFaced = teamStat?.shots_conceded ?? oppTeamStat?.shots ?? null;
  const sotFaced = oppTeamStat?.shots_on_target ?? null;

  return {
    match_sm_id: fixture.id,
    player_sm_id: playerId,
    team_sm_id: teamId,
    is_goalkeeper: true,
    minutes_played: minutes ?? 90,
    goals_conceded: goalsConceded,
    gk_saves: gkSaves,
    psxg_faced: psxgFaced,
    shots_faced: shotsFaced,
    sot_faced: sotFaced,
    passes: lineupDetailValue(lineup, LINEUP_STAT.PASSES),
    passes_completed: lineupDetailValue(lineup, LINEUP_STAT.PASSES_COMPLETED),
    aerial_duels_won: lineupDetailValue(lineup, LINEUP_STAT.AERIALS_WON),
    penalties_saved: lineupDetailValue(lineup, LINEUP_STAT.PENALTIES_SAVED),
    payload: {
      source: teamStat?.psxg_faced != null ? "sportmonks_lineup_team" : "sportmonks_lineup",
      saves_in_box: lineupDetailValue(lineup, LINEUP_STAT.SAVES_IN_BOX),
      team_gk_proxy: teamStat?.psxg_faced != null && lineupDetailValue(lineup, SM_STAT_TYPE.SAVES) == null,
    },
    synced_at: new Date().toISOString(),
  };
}

/** Build GK player rows from lineups, enriched with team-level shot-stopping stats. */
export function mapSportmonksGkStatsFromFixture(args: {
  fixture: SmFixture;
  teamStats: TeamStatsInsert[];
  homeId: number;
  awayId: number;
}): PlayerStatsInsert[] {
  const { fixture, teamStats, homeId, awayId } = args;
  const byTeam = new Map(teamStats.map((s) => [s.team_sm_id, s]));
  const rows: PlayerStatsInsert[] = [];
  const coveredTeams = new Set<number>();

  for (const teamId of [homeId, awayId]) {
    const lineup = findGkLineupForTeam(fixture, teamId);
    if (!lineup) continue;
    const teamStat = byTeam.get(teamId);
    const oppId = teamId === homeId ? awayId : homeId;
    const oppTeamStat = byTeam.get(oppId);
    const row = baseGkRow({ fixture, lineup, teamStat, oppTeamStat, homeId, awayId });
    if (!row) continue;
    if (row.psxg_faced == null && row.gk_saves == null && row.goals_conceded == null) continue;
    rows.push(row);
    coveredTeams.add(teamId);
  }

  return rows;
}

/** @deprecated Prefer mapSportmonksGkStatsFromFixture */
export function mapSportmonksLineupGkStats(args: { fixture: SmFixture }): PlayerStatsInsert[] {
  const { home, away } = resolveParticipantsInline(args.fixture);
  return mapSportmonksGkStatsFromFixture({
    fixture: args.fixture,
    teamStats: [],
    homeId: home.id,
    awayId: away.id,
  });
}

function resolveParticipantsInline(fixture: SmFixture): { home: { id: number }; away: { id: number } } {
  const parts = fixture.participants ?? [];
  const home = parts.find((p) => p.meta?.location === "home");
  const away = parts.find((p) => p.meta?.location === "away");
  if (!home || !away) {
    throw new Error(`Cannot resolve home/away participants for fixture ${fixture.id}`);
  }
  return { home, away };
}

export async function upsertSportmonksGkStats(
  supabase: Client,
  args: {
    fixture: SmFixture;
    teamStats: TeamStatsInsert[];
    homeId: number;
    awayId: number;
  }
): Promise<{ playerRows: number }> {
  const rows = mapSportmonksGkStatsFromFixture(args);
  if (!rows.length) return { playerRows: 0 };

  const { error } = await supabase
    .from("glpm_match_player_stats")
    .upsert(rows, { onConflict: "match_sm_id,player_sm_id" });
  if (error) throw new Error(`upsert GK stats failed: ${error.message}`);

  return { playerRows: rows.length };
}

/** Backward-compatible alias */
export async function upsertSportmonksLineupGkStats(
  supabase: Client,
  fixture: SmFixture,
  teamStats?: TeamStatsInsert[],
  homeId?: number,
  awayId?: number
): Promise<{ playerRows: number }> {
  if (teamStats && homeId != null && awayId != null) {
    return upsertSportmonksGkStats(supabase, { fixture, teamStats, homeId, awayId });
  }
  const { home, away } = resolveParticipantsInline(fixture);
  return upsertSportmonksGkStats(supabase, {
    fixture,
    teamStats: teamStats ?? [],
    homeId: homeId ?? home.id,
    awayId: awayId ?? away.id,
  });
}
