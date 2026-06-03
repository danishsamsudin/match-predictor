import { stableSyntheticPlayerId } from "@/lib/data/build-squad-from-scoutlyst";
import {
  computePlayerPerformanceScore,
  sofifaOverallToScore,
} from "@/lib/data/compute-player-performance-score";
import { formatPlayerDisplayNameIfNeeded } from "@/lib/data/format-player-display-name";
import { aggregateLineupAppearances } from "@/lib/data/infer-usual-squad-from-lineups";
import {
  buildPlayerDetailStats,
  type PlayerDisplayStat,
} from "@/lib/data/player-stat-display";
import {
  comparePlayersByPosition,
  positionDisplayLabel,
} from "@/lib/data/normalize-player-position";
import {
  pickSquadFromRecords,
  squadPickRecordFromStats,
  type SquadPickRecord,
} from "@/lib/data/pick-squad-from-records";
import { loadPreferredFormationForTeam } from "@/lib/data/team-formations";
import {
  loadMatchRatingsByPlayerIds,
  loadScoutlystSnapshotsByNames,
  loadSofifaOverallByNames,
  loadSofifaOverallByTeam,
  maxPerformanceInputs,
  resolveScoutlystSnapshot,
  resolveSofifaOverall,
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

function toSquadPlayer(input: {
  official: OfficialWcPlayer;
  scoutlyst: ScoutlystSnapshotRow | null;
  sofifaOverall: number | null;
  matchAvgRating: number | null;
  sofascorePlayerId: number;
  isStarter: boolean;
  teamId: number;
  teamName: string;
  entityType?: EntityType;
  benchmarkLeagueId?: number;
}): SquadPlayer {
  const displayName = formatPlayerDisplayNameIfNeeded(input.official.name);
  const playerKey = `wc2026:${input.teamName}:${normalizeText(displayName)}`;
  const positionLabel = input.scoutlyst?.position ?? input.official.position;
  const stats = {
    ...input.scoutlyst?.stats,
    club: input.official.club,
    height_cm: input.official.heightCm,
    date_of_birth: input.official.dob,
  };
  const fromStats = computePlayerPerformanceScore({
    scoutlystRating: input.scoutlyst?.rating ?? null,
    matchAvgRating: input.matchAvgRating,
    stats,
    position: positionLabel,
  });
  const fromSofifa =
    input.sofifaOverall != null ? sofifaOverallToScore(input.sofifaOverall) : null;
  const rawPerformanceScore = maxPerformanceInputs(fromStats, fromSofifa);
  const performanceScore = applyBenchmarkToPerformanceScore(rawPerformanceScore, {
    entityType: input.entityType,
    teamId: input.teamId,
    teamName: input.teamName,
    leagueId: input.benchmarkLeagueId ?? 1,
  });
  const detailStats: PlayerDisplayStat[] = buildPlayerDetailStats(stats);

  return {
    sofascorePlayerId: input.sofascorePlayerId,
    scoutlystPlayerKey: input.scoutlyst?.scoutlyst_player_key ?? playerKey,
    name: displayName,
    position: positionDisplayLabel(positionLabel),
    fieldPosition: positionLabel,
    performanceScore,
    startSharePct: input.isStarter ? null : null,
    detailStats,
    age: input.scoutlyst?.age ?? ageFromDob(input.official.dob),
  };
}

function officialPlayerToRecord(
  player: OfficialWcPlayer,
  teamName: string,
  rating: number | null
): SquadPickRecord {
  const displayName = formatPlayerDisplayNameIfNeeded(player.name);
  const id = `wc2026:${teamName}:${normalizeText(displayName)}`;
  const row = squadPickRecordFromStats({
    id,
    name: displayName,
    position: player.position,
    stats: {
      club: player.club,
      height_cm: player.heightCm,
    },
    rating,
  });
  return { ...row, starts: 1 };
}

/** Build squad comparison snapshot from FIFA official 26-man list. */
export async function loadOfficialWcSquadForComparison(
  supabase: ServiceClient | null,
  teamId: number,
  teamLabel: string,
  options?: {
    teamName?: string;
    domesticLeagueId?: number;
    entityType?: EntityType;
  }
): Promise<TeamSquadSnapshot | null> {
  const official = getOfficialWcTeamSquad(teamLabel);
  if (!official?.players.length) return null;

  const benchmarkLeagueId = options?.domesticLeagueId ?? 1;
  const teamName = options?.teamName ?? teamLabel;
  const displayNames = official.players.map((p) =>
    formatPlayerDisplayNameIfNeeded(p.name)
  );

  const formation = supabase
    ? await loadPreferredFormationForTeam(supabase, teamId, teamLabel)
    : null;
  const formationForXi = formation ?? "4-3-3";

  const [scoutlystByName, sofifaGlobal, sofifaTeam, lineupAgg] = supabase
    ? await Promise.all([
        loadScoutlystSnapshotsByNames(supabase, displayNames, { teamId }),
        loadSofifaOverallByNames(supabase, displayNames),
        loadSofifaOverallByTeam(supabase, teamId),
        aggregateLineupAppearances(supabase, teamId, teamName),
      ])
    : [
        new Map<string, ScoutlystSnapshotRow>(),
        new Map<string, number>(),
        new Map<string, number>(),
        null,
      ];

  const lineupIdByName = new Map<string, number>();
  for (const p of lineupAgg?.players ?? []) {
    const key = normalizeText(formatPlayerDisplayNameIfNeeded(p.name));
    if (!lineupIdByName.has(key)) lineupIdByName.set(key, p.sofascorePlayerId);
  }

  const sofascoreIds = new Set<number>();
  for (const name of displayNames) {
    const scout = resolveScoutlystSnapshot(name, scoutlystByName);
    const lineupId = lineupIdByName.get(normalizeText(name));
    const id =
      scout?.sofascore_player_id ??
      lineupId ??
      stableSyntheticPlayerId(`wc2026:${teamLabel}:${normalizeText(name)}`);
    if (id > 0) sofascoreIds.add(id);
  }

  const matchRatings = await loadMatchRatingsByPlayerIds(
    supabase,
    [...sofascoreIds]
  );

  const records = official.players.map((player) => {
    const displayName = formatPlayerDisplayNameIfNeeded(player.name);
    const scout = resolveScoutlystSnapshot(displayName, scoutlystByName);
    return officialPlayerToRecord(player, teamLabel, scout?.rating ?? null);
  });
  const { starters: starterRecords, substitutes: subRecords } = pickSquadFromRecords(
    records,
    formationForXi,
    { benchLimit: null }
  );

  const officialByNorm = new Map(
    official.players.map(
      (p) => [normalizeText(formatPlayerDisplayNameIfNeeded(p.name)), p] as const
    )
  );

  const mapRecord = (record: SquadPickRecord, isStarter: boolean): SquadPlayer => {
    const displayName = formatPlayerDisplayNameIfNeeded(record.name);
    const src =
      officialByNorm.get(normalizeText(displayName)) ??
      ({
        name: displayName,
        position: record.position ?? "MID",
        dob: "",
        club: String(record.stats.club ?? ""),
        heightCm: Number(record.stats.height_cm ?? 0),
      } satisfies OfficialWcPlayer);
    const scout = resolveScoutlystSnapshot(displayName, scoutlystByName);
    const lineupId = lineupIdByName.get(normalizeText(displayName));
    const sofascorePlayerId =
      scout?.sofascore_player_id ??
      lineupId ??
      stableSyntheticPlayerId(`wc2026:${teamLabel}:${normalizeText(displayName)}`);

    return toSquadPlayer({
      official: { ...src, name: displayName },
      scoutlyst: scout,
      sofifaOverall: resolveSofifaOverall(displayName, sofifaGlobal, sofifaTeam),
      matchAvgRating: matchRatings.get(sofascorePlayerId) ?? null,
      sofascorePlayerId,
      isStarter,
      teamId,
      teamName,
      entityType: options?.entityType,
      benchmarkLeagueId,
    });
  };

  const hasScoutlystData = displayNames.some((name) =>
    Boolean(resolveScoutlystSnapshot(name, scoutlystByName))
  );

  return {
    starters: sortSquadPlayers(starterRecords.map((r) => mapRecord(r, true))),
    substitutes: sortSquadPlayers(subRecords.map((r) => mapRecord(r, false))),
    hasLineupData: Boolean(lineupAgg?.players.length),
    hasScoutlystData,
    squadSource: "fifa_official",
    preferredFormation: formationForXi,
    snapshotDate: officialWcSquadPublishedDate(),
    coach: official.coach,
  };
}
