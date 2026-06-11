import { stableSyntheticPlayerId } from "@/lib/data/build-squad-from-scoutlyst";
import {
  computePlayerPerformanceScore,
  sofifaOverallToScore,
} from "@/lib/data/compute-player-performance-score";
import { formatPlayerDisplayNameIfNeeded } from "@/lib/data/format-player-display-name";
import {
  comparePlayersByPosition,
  positionDisplayLabel,
  resolveSquadPlayerLineupRole,
} from "@/lib/data/normalize-player-position";
import {
  buildPlayerDetailStats,
  type PlayerDisplayStat,
} from "@/lib/data/player-stat-display";
import {
  loadMatchRatingsByPlayerIds,
  loadScoutlystSnapshotsByNames,
  maxPerformanceInputs,
  resolveScoutlystSnapshot,
  type ScoutlystSnapshotRow,
} from "@/lib/data/resolve-squad-player-metrics";
import {
  getOfficialWcTeamSquad,
  officialWcSquadPublishedDate,
  type OfficialWcPlayer,
} from "@/lib/data/world-cup-2026-official-squads";
import { applyBenchmarkToPerformanceScore } from "@/lib/prediction/team-strength";
import { normalizeText } from "@/lib/soccerdata/normalize";
import type { Database } from "@/lib/supabase";
import type { SquadPlayer, TeamSquadSnapshot } from "@/lib/types/team-comparison";
import type { EntityType } from "@/lib/types/football-lookup";
import type { SupabaseClient } from "@supabase/supabase-js";

type ServiceClient = SupabaseClient<Database>;

export type SofifaDbPlayerRow = {
  name: string;
  position: string | null;
  country: string | null;
  sofifa_overall: number | null;
  sofifa_potential: number | null;
  is_starter: boolean | null;
  field_position: string | null;
  jersey_number: number | null;
};

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

/** Infer a display formation (e.g. 4-3-3) from SoFIFA starter tactical slots. */
export function inferFormationFromSofifaStarters(
  starters: Array<{ fieldPosition: string | null }>
): string {
  let g = 0;
  let d = 0;
  let m = 0;
  let f = 0;
  for (const player of starters) {
    const role = resolveSquadPlayerLineupRole({
      fieldPosition: player.fieldPosition,
      position: player.fieldPosition,
    });
    if (role === "G") g += 1;
    else if (role === "D") d += 1;
    else if (role === "F") f += 1;
    else m += 1;
  }
  if (g < 1) g = 1;
  return `${Math.max(d, 3)}-${Math.max(m, 2)}-${Math.max(f, 1)}`;
}

function ageFromDob(dob: string, asOf = new Date(2026, 5, 11)): number | null {
  const parts = dob.split("/").map((p) => Number(p.trim()));
  if (parts.length !== 3) return null;
  const [day, month, year] = parts;
  if (!day || !month || !year) return null;
  const born = new Date(year, month - 1, day);
  if (Number.isNaN(born.getTime())) return null;
  let age = asOf.getFullYear() - born.getFullYear();
  const monthDelta = asOf.getMonth() - born.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && asOf.getDate() < born.getDate())) {
    age -= 1;
  }
  return age >= 0 && age < 60 ? age : null;
}

function toSquadPlayer(input: {
  displayName: string;
  teamLabel: string;
  teamId: number;
  teamName: string;
  entityType?: EntityType;
  benchmarkLeagueId: number;
  isStarter: boolean;
  naturalPosition: string | null;
  fieldPosition: string | null;
  sofifaOverall: number | null;
  scoutlyst: ScoutlystSnapshotRow | null;
  matchAvgRating: number | null;
  official: OfficialWcPlayer | null;
  sofascorePlayerId: number;
}): SquadPlayer {
  const stats = {
    ...(input.scoutlyst?.stats ?? {}),
    club: input.official?.club ?? "",
    height_cm: input.official?.heightCm ?? null,
    date_of_birth: input.official?.dob ?? null,
  };
  const tacticalForScore =
    input.fieldPosition && input.fieldPosition !== "SUB"
      ? input.fieldPosition
      : input.naturalPosition;
  const fromStats = computePlayerPerformanceScore({
    scoutlystRating: input.scoutlyst?.rating ?? null,
    matchAvgRating: input.matchAvgRating,
    stats,
    position: tacticalForScore,
  });
  const fromSofifa =
    input.sofifaOverall != null ? sofifaOverallToScore(input.sofifaOverall) : null;
  const rawPerformanceScore = maxPerformanceInputs(fromStats, fromSofifa);
  const performanceScore = applyBenchmarkToPerformanceScore(rawPerformanceScore, {
    entityType: input.entityType,
    teamId: input.teamId,
    teamName: input.teamName,
    leagueId: input.benchmarkLeagueId,
  });
  const detailStats: PlayerDisplayStat[] = buildPlayerDetailStats(stats);

  const displayPosition = input.isStarter
    ? positionDisplayLabel(tacticalForScore)
    : "SUB";

  return {
    sofascorePlayerId: input.sofascorePlayerId,
    scoutlystPlayerKey:
      input.scoutlyst?.scoutlyst_player_key ??
      `wc2026:${input.teamLabel}:${normalizeText(input.displayName)}`,
    name: input.displayName,
    position: displayPosition,
    fieldPosition: input.isStarter
      ? input.fieldPosition ?? input.naturalPosition
      : input.naturalPosition,
    performanceScore,
    startSharePct: input.isStarter ? 100 : null,
    detailStats,
    age:
      input.scoutlyst?.age ??
      (input.official?.dob ? ageFromDob(input.official.dob) : null),
  };
}

export async function loadSofifaPlayersForTeam(
  supabase: ServiceClient,
  teamId: number
): Promise<SofifaDbPlayerRow[]> {
  const { data, error } = await supabase
    .from("soccerdata_players")
    .select(
      "name, position, country, sofifa_overall, sofifa_potential, is_starter, field_position, jersey_number"
    )
    .eq("team_id", teamId)
    .not("sofifa_overall", "is", null)
    .order("is_starter", { ascending: false })
    .order("jersey_number", { ascending: true, nullsFirst: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as SofifaDbPlayerRow[];
}

/**
 * World Cup squad with starters/bench taken from SoFIFA HTML (is_starter + tactical slots).
 */
export async function loadSofifaWcSquadForComparison(
  supabase: ServiceClient | null,
  teamId: number,
  teamLabel: string,
  options?: {
    teamName?: string;
    domesticLeagueId?: number;
    entityType?: EntityType;
  }
): Promise<TeamSquadSnapshot | null> {
  if (!supabase) return null;

  const rows = await loadSofifaPlayersForTeam(supabase, teamId);
  if (!rows.length) return null;

  const startersRaw = rows.filter((row) => row.is_starter === true);
  const subsRaw = rows.filter((row) => row.is_starter !== true);
  if (startersRaw.length < 11) return null;

  const official = getOfficialWcTeamSquad(teamLabel);
  const officialByNorm = new Map(
    (official?.players ?? []).map(
      (p) => [normalizeText(formatPlayerDisplayNameIfNeeded(p.name)), p] as const
    )
  );

  const displayNames = rows.map((row) => formatPlayerDisplayNameIfNeeded(row.name));
  const benchmarkLeagueId = options?.domesticLeagueId ?? 1;
  const teamName = options?.teamName ?? teamLabel;

  const scoutlystByName = await loadScoutlystSnapshotsByNames(supabase, displayNames, {
    teamId,
  });

  const sofascoreIds = new Set<number>();
  for (const name of displayNames) {
    const scout = resolveScoutlystSnapshot(name, scoutlystByName);
    const norm = normalizeText(name);
    const id =
      scout?.sofascore_player_id ??
      stableSyntheticPlayerId(`wc2026:${teamLabel}:${norm}`);
    if (id > 0) sofascoreIds.add(id);
  }

  const matchRatings = await loadMatchRatingsByPlayerIds(supabase, [...sofascoreIds]);

  const mapRow = (row: SofifaDbPlayerRow, isStarter: boolean): SquadPlayer => {
    const displayName = formatPlayerDisplayNameIfNeeded(row.name);
    const norm = normalizeText(displayName);
    const officialPlayer = officialByNorm.get(norm) ?? null;
    const scout = resolveScoutlystSnapshot(displayName, scoutlystByName);
    const sofascorePlayerId =
      scout?.sofascore_player_id ??
      stableSyntheticPlayerId(`wc2026:${teamLabel}:${norm}`);

    return toSquadPlayer({
      displayName,
      teamLabel,
      teamId,
      teamName,
      entityType: options?.entityType,
      benchmarkLeagueId,
      isStarter,
      naturalPosition: row.position,
      fieldPosition: row.field_position,
      sofifaOverall: row.sofifa_overall != null ? Number(row.sofifa_overall) : null,
      scoutlyst: scout,
      matchAvgRating: matchRatings.get(sofascorePlayerId) ?? null,
      official: officialPlayer,
      sofascorePlayerId,
    });
  };

  const starters = startersRaw
    .map((row) => mapRow(row, true))
    .sort((a, b) => {
      const aNum = startersRaw.find((r) => r.name === a.name)?.jersey_number;
      const bNum = startersRaw.find((r) => r.name === b.name)?.jersey_number;
      if (aNum != null && bNum != null && aNum !== bNum) return aNum - bNum;
      return comparePlayersByPosition(
        { position: a.position },
        { position: b.position }
      );
    });
  const substitutes = sortSquadPlayers(subsRaw.map((row) => mapRow(row, false)));

  const hasScoutlystData = displayNames.some((name) =>
    Boolean(resolveScoutlystSnapshot(name, scoutlystByName))
  );

  return {
    starters,
    substitutes,
    hasLineupData: true,
    hasScoutlystData,
    squadSource: "sofifa",
    preferredFormation: inferFormationFromSofifaStarters(starters),
    snapshotDate: officialWcSquadPublishedDate(),
    coach: official?.coach ?? null,
  };
}
