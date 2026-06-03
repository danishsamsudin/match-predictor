import { stableSyntheticPlayerId } from "@/lib/data/build-squad-from-scoutlyst";
import {
  computePlayerPerformanceScore,
  sofifaOverallToScore,
} from "@/lib/data/compute-player-performance-score";
import { normalizeText } from "@/lib/soccerdata/normalize";
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
import type { Database } from "@/lib/supabase";
import type { SquadPlayer, TeamSquadSnapshot } from "@/lib/types/team-comparison";
import type { SupabaseClient } from "@supabase/supabase-js";

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

const FBREF_STAT_MERGE_ORDER = [
  "standard",
  "playing_time",
  "shooting",
  "passing",
  "possession",
  "misc",
  "defense",
  "keeper",
  "keeper_adv",
  "gca",
] as const;

function mergeAllFbrefStatsForPlayer(
  allStats: FbrefPlayerStatRow[],
  playerId: string
): Record<string, string | number | null> {
  const forPlayer = allStats.filter((s) => s.player_id === playerId);
  const byType = new Map<string, FbrefPlayerStatRow[]>();
  for (const row of forPlayer) {
    const list = byType.get(row.stat_type) ?? [];
    list.push(row);
    byType.set(row.stat_type, list);
  }

  const merged: Record<string, string | number | null> = {};
  const mergeRows = (rows: FbrefPlayerStatRow[]) => {
    const best = [...rows].sort(
      (a, b) => Number(b.stats?.minutes ?? 0) - Number(a.stats?.minutes ?? 0)
    )[0];
    if (!best) return;
    Object.assign(merged, statRecord(best.stats ?? {}));
  };

  for (const statType of FBREF_STAT_MERGE_ORDER) {
    const rows = byType.get(statType);
    if (rows?.length) mergeRows(rows);
  }
  for (const [statType, rows] of byType) {
    if ((FBREF_STAT_MERGE_ORDER as readonly string[]).includes(statType)) continue;
    mergeRows(rows);
  }
  return merged;
}

function fbrefPositionLabel(stats: Record<string, unknown>): string | null {
  const raw = stats.pos ?? stats.position;
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) return null;
  return primaryPositionToken(text) || text.split("-")[0]?.trim() || text;
}

function fbrefPositionForScoring(stats: Record<string, unknown>): string | null {
  const raw = stats.pos ?? stats.position;
  if (raw == null) return null;
  const text = String(raw).trim();
  return text || null;
}

type ScoutlystRatingRow = {
  rating: number | null;
  stats: Record<string, string | number | null>;
};

async function loadScoutlystByPlayerNames(
  supabase: SupabaseClient<Database> | null,
  normalizedNames: string[]
): Promise<Map<string, ScoutlystRatingRow>> {
  const wanted = new Set(normalizedNames.filter(Boolean));
  if (!supabase || !wanted.size) return new Map();

  const { data } = await supabase
    .from("scoutlyst_player_snapshots")
    .select("player_name, rating, stats, snapshot_date")
    .order("snapshot_date", { ascending: false })
    .limit(4000);

  const byName = new Map<string, ScoutlystRatingRow>();
  for (const row of data ?? []) {
    const key = normalizeText(row.player_name);
    if (!wanted.has(key) || byName.has(key)) continue;
    const stats =
      row.stats && typeof row.stats === "object" && !Array.isArray(row.stats)
        ? (row.stats as Record<string, string | number | null>)
        : {};
    byName.set(key, {
      rating: row.rating != null ? Number(row.rating) : null,
      stats,
    });
  }
  return byName;
}

async function loadSofifaOverallByName(
  supabase: SupabaseClient<Database> | null,
  normalizedNames: string[]
): Promise<Map<string, number>> {
  const wanted = new Set(normalizedNames.filter(Boolean));
  if (!supabase || !wanted.size) return new Map();

  const { data } = await supabase
    .from("soccerdata_players")
    .select("name, sofifa_overall")
    .not("sofifa_overall", "is", null)
    .limit(20000);

  const byName = new Map<string, number>();
  for (const row of data ?? []) {
    const key = normalizeText(row.name);
    if (!wanted.has(key) || row.sofifa_overall == null) continue;
    const overall = Number(row.sofifa_overall);
    const prev = byName.get(key);
    if (prev == null || overall > prev) byName.set(key, overall);
  }
  return byName;
}

function resolveFbrefPerformanceScore(input: {
  stats: Record<string, string | number | null>;
  position: string | null;
  scoutlystRating: number | null;
  scoutlystStats: Record<string, string | number | null>;
  sofifaOverall: number | null;
}): number | null {
  const fromFbref = computePlayerPerformanceScore({
    scoutlystRating: input.scoutlystRating,
    matchAvgRating: null,
    stats: input.stats,
    position: input.position,
  });
  const fromScoutlystOnly =
    input.scoutlystRating != null
      ? computePlayerPerformanceScore({
          scoutlystRating: input.scoutlystRating,
          matchAvgRating: null,
          stats: input.scoutlystStats,
          position: input.position,
        })
      : null;
  const fromSofifa =
    input.sofifaOverall != null ? sofifaOverallToScore(input.sofifaOverall) : null;

  const candidates = [fromFbref, fromScoutlystOnly, fromSofifa].filter(
    (v): v is number => v != null && Number.isFinite(v)
  );
  return candidates.length ? Math.max(...candidates) : null;
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
  stats: Record<string, string | number | null>;
  startSharePct?: number | null;
  scoutlyst: ScoutlystRatingRow | null;
  sofifaOverall: number | null;
}): SquadPlayer {
  const positionLabel = fbrefPositionLabel(input.stats);
  const scoringPosition = fbrefPositionForScoring(input.stats) ?? positionLabel;
  const performanceScore = resolveFbrefPerformanceScore({
    stats: input.stats,
    position: scoringPosition,
    scoutlystRating: input.scoutlyst?.rating ?? null,
    scoutlystStats: input.scoutlyst?.stats ?? {},
    sofifaOverall: input.sofifaOverall,
  });

  return {
    sofascorePlayerId: fbrefNumericId(`player:${input.player.id}`),
    scoutlystPlayerKey: `fbref:${input.player.id}`,
    name: input.player.name,
    position: positionDisplayLabel(positionLabel),
    fieldPosition: positionLabel,
    performanceScore,
    startSharePct: input.startSharePct ?? null,
    detailStats: buildPlayerDetailStats(input.stats),
    age:
      typeof input.stats.age === "number"
        ? input.stats.age
        : typeof input.stats.age === "string"
          ? Number(input.stats.age.replace(/[^\d]/g, "")) || null
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

  const normalizedNames = players.map((p) => normalizeText(p.name));
  const [scoutlyst, sofifa] = await Promise.all([
    loadScoutlystByPlayerNames(supabase, normalizedNames),
    loadSofifaOverallByName(supabase, normalizedNames),
  ]);

  const records = players.map((player) => {
    const merged = mergeAllFbrefStatsForPlayer(stats, player.id);
    const scout = scoutlyst.get(normalizeText(player.name)) ?? null;
    return squadPickRecordFromStats({
      id: player.id,
      name: player.name,
      position: fbrefPositionLabel(merged),
      stats: merged,
      rating: scout?.rating ?? null,
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
    const merged = mergeAllFbrefStatsForPlayer(stats, player.id);
    const nameKey = normalizeText(player.name);
    return toFbrefSquadPlayer({
      player,
      stats: merged,
      scoutlyst: scoutlyst.get(nameKey) ?? null,
      sofifaOverall: sofifa.get(nameKey) ?? null,
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
