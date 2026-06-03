import { stableSyntheticPlayerId } from "@/lib/data/build-squad-from-scoutlyst";
import { computePlayerPerformanceScore } from "@/lib/data/compute-player-performance-score";
import {
  comparePlayersByPosition,
  positionDisplayLabel,
  primaryPositionToken,
} from "@/lib/data/normalize-player-position";
import { buildPlayerDetailStats } from "@/lib/data/player-stat-display";
import {
  pickSquadFromRecords,
  squadPickRecordFromStats,
} from "@/lib/data/pick-squad-from-records";
import { loadPreferredFormationForTeam } from "@/lib/data/team-formations";
import { normalizeNationalTeamName } from "@/lib/data/world-cup-2026-teams";
import {
  fbrefStoreAvailable,
  listFbrefFinishedMatchesForTeam,
  listFbrefPlayerStatsForTeam,
  listFbrefPlayersForTeam,
  listFbrefTeams,
  listFbrefTeamsByIds,
  type FbrefMatchRow,
  type FbrefPlayerRow,
  type FbrefPlayerStatRow,
} from "@/lib/fbref/supabase-store";
import { tryCreateServiceClient } from "@/lib/supabase";
import type { FixtureResult } from "@/lib/types/football";
import type { SquadPlayer, TeamSquadSnapshot } from "@/lib/types/team-comparison";

const MIN_SYNCED_FORM = 5;

function fbrefNumericId(seed: string): number {
  return stableSyntheticPlayerId(`fbref:${seed}`);
}

function normalizeLookupName(name: string): string {
  return normalizeNationalTeamName(name.trim());
}

let fbrefTeamByNormalizedName: Map<string, { id: string; name: string }> | null = null;

async function loadFbrefTeamNameIndex(): Promise<Map<string, { id: string; name: string }>> {
  if (fbrefTeamByNormalizedName) return fbrefTeamByNormalizedName;

  const teams = await listFbrefTeams();
  const index = new Map<string, { id: string; name: string }>();
  for (const row of teams) {
    const key = normalizeLookupName(row.name);
    if (!index.has(key)) index.set(key, { id: row.id, name: row.name });
  }
  fbrefTeamByNormalizedName = index;
  return index;
}

export async function resolveFbrefTeamIdByName(
  teamName: string
): Promise<{ id: string; name: string } | null> {
  const key = normalizeLookupName(teamName);
  if (!key) return null;
  const index = await loadFbrefTeamNameIndex();
  return index.get(key) ?? null;
}

function winnerFromGoals(
  homeGoals: number,
  awayGoals: number
): { home: boolean | null; away: boolean | null } {
  if (homeGoals > awayGoals) return { home: true, away: false };
  if (homeGoals < awayGoals) return { home: false, away: true };
  return { home: null, away: null };
}

function matchToFixtureResult(
  match: FbrefMatchRow,
  team: { fbrefId: string; sofascoreId: number },
  teamNames: Map<string, string>
): FixtureResult | null {
  const homeGoals = match.home_goals;
  const awayGoals = match.away_goals;
  if (homeGoals == null || awayGoals == null || !match.date) return null;

  const homeFbrefId = match.home_team_id;
  const awayFbrefId = match.away_team_id;
  if (!homeFbrefId || !awayFbrefId) return null;

  const homeName = teamNames.get(homeFbrefId) ?? "Home";
  const awayName = teamNames.get(awayFbrefId) ?? "Away";
  const winners = winnerFromGoals(homeGoals, awayGoals);

  const homeId =
    homeFbrefId === team.fbrefId ? team.sofascoreId : fbrefNumericId(homeFbrefId);
  const awayId =
    awayFbrefId === team.fbrefId ? team.sofascoreId : fbrefNumericId(awayFbrefId);

  const kickoff = match.time ? `${match.date}T${match.time}` : match.date;

  return {
    fixture: {
      id: fbrefNumericId(`match:${match.id}`),
      date: kickoff,
      status: { short: "FT" },
    },
    teams: {
      home: { id: homeId, name: homeName, winner: winners.home },
      away: { id: awayId, name: awayName, winner: winners.away },
    },
    goals: { home: homeGoals, away: awayGoals },
  };
}

function formDedupeKey(match: FixtureResult): string {
  const date = match.fixture.date.slice(0, 10);
  const home = match.teams.home.name.toLowerCase();
  const away = match.teams.away.name.toLowerCase();
  return `${date}|${home}|${away}`;
}

export function mergeRecentFormFixtures(
  primary: FixtureResult[],
  fallback: FixtureResult[],
  limit = 10
): FixtureResult[] {
  const seen = new Set(primary.map(formDedupeKey));
  const merged = [...primary];
  for (const row of fallback) {
    const key = formDedupeKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
    if (merged.length >= limit) break;
  }
  return merged.slice(0, limit);
}

export async function loadFbrefRecentFormFixtures(
  teamName: string,
  sofascoreTeamId: number,
  limit = 5
): Promise<FixtureResult[]> {
  if (!fbrefStoreAvailable()) return [];

  const team = await resolveFbrefTeamIdByName(teamName);
  if (!team) return [];

  const matches = await listFbrefFinishedMatchesForTeam(
    team.id,
    Math.max(limit * 3, 15)
  );
  if (!matches.length) return [];

  const teamIds = new Set<string>();
  for (const row of matches) {
    if (row.home_team_id) teamIds.add(row.home_team_id);
    if (row.away_team_id) teamIds.add(row.away_team_id);
  }

  const nameRows = await listFbrefTeamsByIds([...teamIds]);
  const teamNames = new Map<string, string>();
  for (const row of nameRows) {
    teamNames.set(row.id, row.name);
  }

  const ctx = { fbrefId: team.id, sofascoreId: sofascoreTeamId };
  const fixtures: FixtureResult[] = [];
  for (const row of matches) {
    const fixture = matchToFixtureResult(row, ctx, teamNames);
    if (fixture) fixtures.push(fixture);
    if (fixtures.length >= limit) break;
  }
  return fixtures;
}

export const FBREF_FORM_MIN_SYNCED = MIN_SYNCED_FORM;

function statRecord(
  stats: Record<string, unknown>
): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {};
  for (const [key, value] of Object.entries(stats)) {
    if (value == null || value === "") continue;
    if (typeof value === "number" || typeof value === "string") out[key] = value;
    else out[key] = String(value);
  }
  return out;
}

function pickStandardStat(
  stats: FbrefPlayerStatRow[],
  playerId: string
): FbrefPlayerStatRow | undefined {
  const forPlayer = stats.filter((s) => s.player_id === playerId);
  const standard = forPlayer.filter((s) => s.stat_type === "standard");
  const pool = standard.length ? standard : forPlayer;
  return pool.sort((a, b) => {
    const minsA = Number(a.stats?.minutes ?? a.stats?.min ?? 0);
    const minsB = Number(b.stats?.minutes ?? b.stats?.min ?? 0);
    return minsB - minsA;
  })[0];
}

function pickPlayingTimeStat(
  stats: FbrefPlayerStatRow[],
  playerId: string
): FbrefPlayerStatRow | undefined {
  return stats
    .filter((s) => s.player_id === playerId && s.stat_type === "playing_time")
    .sort((a, b) => Number(b.stats?.minutes ?? 0) - Number(a.stats?.minutes ?? 0))[0];
}

function mergedStatBundle(
  standard: FbrefPlayerStatRow | undefined,
  playingTime: FbrefPlayerStatRow | undefined
): Record<string, string | number | null> {
  return {
    ...statRecord(standard?.stats ?? {}),
    ...statRecord(playingTime?.stats ?? {}),
  };
}

function fbrefPositionLabel(stats: Record<string, unknown>): string | null {
  const raw = stats.pos ?? stats.position;
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) return null;
  return primaryPositionToken(text) || text.split("-")[0]?.trim() || text;
}

function sortSquadPlayers(players: SquadPlayer[]): SquadPlayer[] {
  return [...players].sort((a, b) => {
    const pos = comparePlayersByPosition(
      { position: a.position },
      { position: b.position }
    );
    if (pos !== 0) return pos;
    return (b.performanceScore ?? 0) - (a.performanceScore ?? 0);
  });
}

function toFbrefSquadPlayer(input: {
  player: FbrefPlayerRow;
  stat: FbrefPlayerStatRow | undefined;
  playingTime?: FbrefPlayerStatRow | undefined;
  startSharePct?: number | null;
}): SquadPlayer {
  const stats = mergedStatBundle(input.stat, input.playingTime);
  const positionLabel = fbrefPositionLabel(input.stat?.stats ?? input.playingTime?.stats ?? {});
  const performanceScore =
    computePlayerPerformanceScore({
      scoutlystRating: null,
      matchAvgRating: null,
      stats,
      position: positionLabel,
    }) ?? 0;

  return {
    sofascorePlayerId: fbrefNumericId(`player:${input.player.id}`),
    scoutlystPlayerKey: `fbref:${input.player.id}`,
    name: input.player.name,
    position: positionDisplayLabel(positionLabel),
    fieldPosition: positionLabel,
    performanceScore,
    startSharePct: input.startSharePct ?? null,
    detailStats: buildPlayerDetailStats(stats),
    age:
      typeof stats.age === "number"
        ? stats.age
        : typeof stats.age === "string"
          ? Number(stats.age.replace(/[^\d]/g, "")) || null
          : null,
  };
}

export async function loadFbrefTeamSquadSnapshot(
  teamName: string,
  sofascoreTeamId: number
): Promise<TeamSquadSnapshot | null> {
  if (!fbrefStoreAvailable()) return null;

  const team = await resolveFbrefTeamIdByName(teamName);
  if (!team) return null;

  const supabase = tryCreateServiceClient();
  const preferredFormation =
    (await loadPreferredFormationForTeam(supabase, sofascoreTeamId, teamName)) ??
    "4-3-3";

  const [players, stats] = await Promise.all([
    listFbrefPlayersForTeam(team.id),
    listFbrefPlayerStatsForTeam(team.id),
  ]);

  if (!players.length) return null;

  const records = players.map((player) => {
    const standard = pickStandardStat(stats, player.id);
    const playingTime = pickPlayingTimeStat(stats, player.id);
    const merged = mergedStatBundle(standard, playingTime);
    return squadPickRecordFromStats({
      id: player.id,
      name: player.name,
      position: fbrefPositionLabel(standard?.stats ?? playingTime?.stats ?? {}),
      stats: merged,
    });
  });

  const { starters: pickedStarters, substitutes: pickedSubs } = pickSquadFromRecords(
    records,
    preferredFormation
  );

  if (!pickedStarters.length) return null;

  const playerById = new Map(players.map((p) => [p.id, p] as const));
  const totalStarts = pickedStarters.reduce((sum, p) => sum + p.starts, 0) || 1;

  const mapRecord = (record: (typeof records)[0]): SquadPlayer | null => {
    const player = playerById.get(record.id);
    if (!player) return null;
    const standard = pickStandardStat(stats, player.id);
    const playingTime = pickPlayingTimeStat(stats, player.id);
    return toFbrefSquadPlayer({
      player,
      stat: standard,
      playingTime,
      startSharePct: Math.round((record.starts / totalStarts) * 100),
    });
  };

  const starters = sortSquadPlayers(
    pickedStarters.map(mapRecord).filter((p): p is SquadPlayer => p != null)
  );

  const substitutes = sortSquadPlayers(
    pickedSubs.map(mapRecord).filter((p): p is SquadPlayer => p != null)
  );

  return {
    starters,
    substitutes,
    hasLineupData: false,
    hasScoutlystData: false,
    squadSource: "fbref",
    preferredFormation,
    snapshotDate: null,
  };
}

export function needsRecentFormHydration(form: FixtureResult[]): boolean {
  if (!form.length) return true;
  const withScores = form.filter(
    (m) => m.goals.home != null && m.goals.away != null
  );
  return withScores.length < 3;
}
