import { stableSyntheticPlayerId } from "@/lib/data/build-squad-from-scoutlyst";
import {
  computePlayerPerformanceScore,
  sofifaOverallToScore,
} from "@/lib/data/compute-player-performance-score";
import { formatPlayerDisplayNameIfNeeded } from "@/lib/data/format-player-display-name";
import {
  positionDisplayLabelFromTokens,
  resolveSquadPlayerLineupRole,
} from "@/lib/data/normalize-player-position";
import {
  buildScoutlystLookupIndex,
  findOfficialPlayerByNameKeys,
  resolveScoutlystForSofifaNames,
} from "@/lib/data/resolve-sofifa-scoutlyst-match";
import {
  buildPlayerDetailStats,
  type PlayerDisplayStat,
} from "@/lib/data/player-stat-display";
import {
  loadMatchRatingsByPlayerIds,
  loadScoutlystSnapshotsByNames,
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
  squad_order: number | null;
};

/** Infer a display formation (e.g. 4-3-3) from SoFIFA starter tactical slots. */
export function inferFormationFromSofifaStarters(
  starters: Array<{ fieldPosition: string | null; position: string }>
): string {
  let d = 0;
  let m = 0;
  let f = 0;
  for (const player of starters) {
    const role = resolveSquadPlayerLineupRole({
      fieldPosition: player.fieldPosition,
      position: player.position,
    });
    if (role === "G") continue;
    if (role === "D") d += 1;
    else if (role === "F") f += 1;
    else m += 1;
  }
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
  const tacticalSlot =
    input.fieldPosition && input.fieldPosition !== "SUB" ? input.fieldPosition : null;

  const fromSofifa =
    input.sofifaOverall != null ? sofifaOverallToScore(input.sofifaOverall) : null;
  const fromStats =
    fromSofifa == null
      ? computePlayerPerformanceScore({
          scoutlystRating: input.scoutlyst?.rating ?? null,
          matchAvgRating: input.matchAvgRating,
          stats,
          position: input.naturalPosition ?? tacticalSlot,
        })
      : null;
  const rawPerformanceScore = fromSofifa ?? fromStats;
  // SoFIFA overall is already on the FIFA 0–100 scale; do not re-scale by national Ω.
  const performanceScore =
    fromSofifa != null
      ? fromSofifa
      : applyBenchmarkToPerformanceScore(rawPerformanceScore, {
          entityType: input.entityType,
          teamId: input.teamId,
          teamName: input.teamName,
          leagueId: input.benchmarkLeagueId,
        });
  const detailStats: PlayerDisplayStat[] = buildPlayerDetailStats(stats);

  const displayPosition = input.isStarter
    ? positionDisplayLabelFromTokens(input.naturalPosition, tacticalSlot)
    : "SUB";

  return {
    sofascorePlayerId: input.sofascorePlayerId,
    scoutlystPlayerKey:
      input.scoutlyst?.scoutlyst_player_key ??
      `wc2026:${input.teamLabel}:${normalizeText(input.displayName)}`,
    name: input.displayName,
    position: displayPosition,
    fieldPosition: input.isStarter
      ? tacticalSlot ?? input.naturalPosition
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
      "name, position, country, sofifa_overall, sofifa_potential, is_starter, field_position, jersey_number, squad_order"
    )
    .eq("team_id", teamId)
    .not("sofifa_overall", "is", null)
    .order("is_starter", { ascending: false })
    .order("squad_order", { ascending: true, nullsFirst: false })
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
  const officialPlayers = official?.players ?? [];

  const lookupNames = rows.flatMap((row) => {
    const display = formatPlayerDisplayNameIfNeeded(row.name);
    return [display, row.name];
  });
  const benchmarkLeagueId = options?.domesticLeagueId ?? 1;
  const teamName = options?.teamName ?? teamLabel;

  const scoutlystSnapshots = await loadScoutlystSnapshotsByNames(supabase, lookupNames, {
    teamId,
  });
  const scoutlystByKey = buildScoutlystLookupIndex(scoutlystSnapshots);

  const sofascoreIds = new Set<number>();
  for (const row of rows) {
    const displayName = formatPlayerDisplayNameIfNeeded(row.name);
    const officialPlayer = findOfficialPlayerByNameKeys(
      [displayName, row.name],
      officialPlayers
    );
    const scout = resolveScoutlystForSofifaNames(
      [displayName, row.name, officialPlayer?.name].filter(
        (name): name is string => Boolean(name?.trim())
      ),
      scoutlystByKey
    );
    const id =
      scout?.sofascore_player_id ??
      stableSyntheticPlayerId(
        `wc2026:${teamLabel}:${normalizeText(officialPlayer?.name ?? displayName)}`
      );
    if (id > 0) sofascoreIds.add(id);
  }

  const matchRatings = await loadMatchRatingsByPlayerIds(supabase, [...sofascoreIds]);

  const mapRow = (row: SofifaDbPlayerRow, isStarter: boolean): SquadPlayer => {
    const displayName = formatPlayerDisplayNameIfNeeded(row.name);
    const officialPlayer = findOfficialPlayerByNameKeys(
      [displayName, row.name],
      officialPlayers
    );
    const scout = resolveScoutlystForSofifaNames(
      [displayName, row.name, officialPlayer?.name].filter(
        (name): name is string => Boolean(name?.trim())
      ),
      scoutlystByKey
    );
    const sofascorePlayerId =
      scout?.sofascore_player_id ??
      stableSyntheticPlayerId(
        `wc2026:${teamLabel}:${normalizeText(officialPlayer?.name ?? displayName)}`
      );

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

  const starters = startersRaw.slice(0, 11).map((row) => mapRow(row, true));
  const substitutes = subsRaw.map((row) => mapRow(row, false));

  const hasScoutlystData = [...scoutlystSnapshots.values()].length > 0;

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
