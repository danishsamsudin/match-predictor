import { stableSyntheticPlayerId } from "@/lib/data/build-squad-from-scoutlyst";
import { buildLineupQualityMap } from "@/lib/data/build-lineup-quality-map";
import {
  computePlayerPerformanceScore,
  sofifaOverallToScore,
} from "@/lib/data/compute-player-performance-score";
import { formatPlayerDisplayNameIfNeeded } from "@/lib/data/format-player-display-name";
import { aggregateLineupAppearances } from "@/lib/data/infer-usual-squad-from-lineups";
import type { LineupAppearanceAgg } from "@/lib/data/infer-usual-squad-from-lineups";
import { pickOfficialWcMatchdayXi } from "@/lib/data/official-wc-matchday-xi";
import {
  buildPlayerDetailStats,
  type PlayerDisplayStat,
} from "@/lib/data/player-stat-display";
import {
  comparePlayersByPosition,
  positionDisplayLabel,
} from "@/lib/data/normalize-player-position";
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

function scoutlystBySofascoreId(
  snapshots: Map<string, ScoutlystSnapshotRow>
): Map<number, ScoutlystSnapshotRow> {
  const byId = new Map<number, ScoutlystSnapshotRow>();
  for (const row of snapshots.values()) {
    if (row.sofascore_player_id != null && !byId.has(row.sofascore_player_id)) {
      byId.set(row.sofascore_player_id, row);
    }
  }
  return byId;
}

function toSquadPlayer(input: {
  official: OfficialWcPlayer;
  scoutlyst: ScoutlystSnapshotRow | null;
  sofifaOverall: number | null;
  matchAvgRating: number | null;
  sofascorePlayerId: number;
  startSharePct: number | null;
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
    startSharePct: input.startSharePct,
    detailStats,
    age: input.scoutlyst?.age ?? ageFromDob(input.official.dob),
  };
}

function mapAppearanceToSquadPlayer(
  appearance: LineupAppearanceAgg,
  ctx: {
    officialByNorm: Map<string, OfficialWcPlayer>;
    scoutlystByName: Map<string, ScoutlystSnapshotRow>;
    lineupIdByName: Map<string, number>;
    sofifaGlobal: Map<string, number>;
    sofifaTeam: Map<string, number>;
    matchRatings: Map<number, number>;
    teamLabel: string;
    teamId: number;
    teamName: string;
    entityType?: EntityType;
    benchmarkLeagueId: number;
    startSharePct: number | null;
  }
): SquadPlayer {
  const displayName = formatPlayerDisplayNameIfNeeded(appearance.name);
  const norm = normalizeText(displayName);
  const src =
    ctx.officialByNorm.get(norm) ??
    ({
      name: displayName,
      position: appearance.position ?? "MID",
      dob: "",
      club: "",
      heightCm: 0,
    } satisfies OfficialWcPlayer);
  const scout = resolveScoutlystSnapshot(displayName, ctx.scoutlystByName);
  const lineupId = ctx.lineupIdByName.get(norm);
  const sofascorePlayerId =
    appearance.sofascorePlayerId > 0
      ? appearance.sofascorePlayerId
      : (scout?.sofascore_player_id ??
        lineupId ??
        stableSyntheticPlayerId(`wc2026:${ctx.teamLabel}:${norm}`));

  return toSquadPlayer({
    official: { ...src, name: displayName },
    scoutlyst: scout,
    sofifaOverall: resolveSofifaOverall(displayName, ctx.sofifaGlobal, ctx.sofifaTeam),
    matchAvgRating: ctx.matchRatings.get(sofascorePlayerId) ?? null,
    sofascorePlayerId,
    startSharePct: ctx.startSharePct,
    teamId: ctx.teamId,
    teamName: ctx.teamName,
    entityType: ctx.entityType,
    benchmarkLeagueId: ctx.benchmarkLeagueId,
  });
}

/** Official 26-man roster with predicted matchday XI from recent international lineups. */
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

  const storedFormation = supabase
    ? await loadPreferredFormationForTeam(supabase, teamId, teamLabel)
    : null;

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
        { players: [], preferredFormation: null, formations: [] },
      ];

  const lineupIdByName = new Map<string, number>();
  for (const p of lineupAgg.players) {
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
  for (const p of lineupAgg.players) {
    if (p.sofascorePlayerId > 0) sofascoreIds.add(p.sofascorePlayerId);
  }

  const matchRatings = await loadMatchRatingsByPlayerIds(supabase, [...sofascoreIds]);

  const qualityById = buildLineupQualityMap(lineupAgg.players, {
    bySofascoreId: scoutlystBySofascoreId(scoutlystByName),
    byName: scoutlystByName,
    globalByName: scoutlystByName,
    matchRatings,
    sofifaByName: sofifaTeam,
    sofifaGlobalByName: sofifaGlobal,
  });

  const matchday = pickOfficialWcMatchdayXi({
    officialPlayers: official.players,
    lineupPlayers: lineupAgg.players,
    lineupPreferredFormation: lineupAgg.preferredFormation,
    storedFormation,
    formationDefault: "4-3-3",
    qualityById,
    teamLabel,
    scoutlystByName,
  });

  const officialByNorm = new Map(
    official.players.map(
      (p) => [normalizeText(formatPlayerDisplayNameIfNeeded(p.name)), p] as const
    )
  );

  const totalStarts = matchday.starters.reduce((sum, p) => sum + p.starts, 0) || 1;
  const mapCtx = {
    officialByNorm,
    scoutlystByName,
    lineupIdByName,
    sofifaGlobal,
    sofifaTeam,
    matchRatings,
    teamLabel,
    teamId,
    teamName,
    entityType: options?.entityType,
    benchmarkLeagueId,
  };

  const starters = sortSquadPlayers(
    matchday.starters.map((p) =>
      mapAppearanceToSquadPlayer(p, {
        ...mapCtx,
        startSharePct: Math.round((p.starts / totalStarts) * 100),
      })
    )
  );

  const substitutes = sortSquadPlayers(
    matchday.substitutes.map((p) =>
      mapAppearanceToSquadPlayer(p, { ...mapCtx, startSharePct: null })
    )
  );

  const hasScoutlystData = displayNames.some((name) =>
    Boolean(resolveScoutlystSnapshot(name, scoutlystByName))
  );

  return {
    starters,
    substitutes,
    hasLineupData: Boolean(lineupAgg.players.length),
    hasScoutlystData,
    squadSource: matchday.squadSource,
    preferredFormation: matchday.preferredFormation,
    snapshotDate: officialWcSquadPublishedDate(),
    coach: official.coach,
  };
}
