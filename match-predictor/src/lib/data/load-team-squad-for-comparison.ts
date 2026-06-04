import {
  buildSquadFromScoutlyst,
  stableSyntheticPlayerId,
  type ScoutlystSquadRow,
} from "@/lib/data/build-squad-from-scoutlyst";
import { loadOfficialWcSquadForComparison } from "@/lib/data/load-official-wc-squad-for-comparison";
import { loadFbrefTeamSquadSnapshot } from "@/lib/fbref/comparison-fallback";
import { resolveWc2026TeamLabel } from "@/lib/data/world-cup-2026-official-squads";
import { loadPreferredFormationForTeam } from "@/lib/data/team-formations";
import { buildLineupQualityMap } from "@/lib/data/build-lineup-quality-map";
import {
  computePlayerPerformanceScore,
  sofifaOverallToScore,
} from "@/lib/data/compute-player-performance-score";
import { formatPlayerDisplayNameIfNeeded } from "@/lib/data/format-player-display-name";
import {
  loadMatchRatingsByPlayerIds,
  loadScoutlystSnapshotsByNames,
  loadSofifaOverallByNames,
  loadSofifaOverallByTeam,
  maxPerformanceInputs,
  playerNameLookupKeys,
  resolveScoutlystSnapshot,
  resolveSofifaOverall,
  type ScoutlystSnapshotRow,
} from "@/lib/data/resolve-squad-player-metrics";
import { buildClubMetricsBySofascoreId } from "@/lib/data/build-club-metrics-for-lineup";
import {
  aggregateLineupAppearances,
  pickLineupStartersFromAppearances,
  pickLineupSubstitutesFromAppearances,
  type LineupAppearanceAgg,
} from "@/lib/data/infer-usual-squad-from-lineups";
import { applyBenchmarkToPerformanceScore } from "@/lib/prediction/team-strength";
import type { EntityType } from "@/lib/types/football-lookup";
import { resolveDomesticLeagueId } from "@/lib/data/football-reference";
import {
  buildPlayerDetailStats,
  type PlayerDisplayStat,
} from "@/lib/data/player-stat-display";
import {
  comparePlayersByPosition,
  positionDisplayLabel,
} from "@/lib/data/normalize-player-position";
import { normalizeText } from "@/lib/soccerdata/normalize";
import type { Database } from "@/lib/supabase";
import type { SquadPlayer, TeamSquadSnapshot } from "@/lib/types/team-comparison";
import type { SupabaseClient } from "@supabase/supabase-js";

type ServiceClient = SupabaseClient<Database>;

type ScoutlystRow = ScoutlystSnapshotRow;

async function loadLatestScoutlystByTeam(
  supabase: ServiceClient,
  teamId: number
): Promise<{
  bySofascoreId: Map<number, ScoutlystRow>;
  byName: Map<string, ScoutlystRow>;
  allRows: ScoutlystRow[];
  snapshotDate: string | null;
}> {
  const { data } = await supabase
    .from("scoutlyst_player_snapshots")
    .select(
      "scoutlyst_player_key, player_name, sofascore_player_id, position, age, rating, stats, snapshot_date, reference_league_id"
    )
    .eq("reference_team_id", teamId)
    .order("snapshot_date", { ascending: false })
    .limit(500);

  const bySofascoreId = new Map<number, ScoutlystRow>();
  const byName = new Map<string, ScoutlystRow>();
  let snapshotDate: string | null = null;

  for (const row of data ?? []) {
    const stats =
      row.stats && typeof row.stats === "object" && !Array.isArray(row.stats)
        ? (row.stats as Record<string, string | number | null>)
        : {};
    const mapped: ScoutlystRow = {
      scoutlyst_player_key: row.scoutlyst_player_key,
      player_name: row.player_name,
      sofascore_player_id: row.sofascore_player_id,
      position: row.position,
      age: row.age != null ? Number(row.age) : null,
      rating: row.rating != null ? Number(row.rating) : null,
      stats,
      snapshot_date: row.snapshot_date,
      reference_league_id:
        row.reference_league_id != null ? Number(row.reference_league_id) : null,
    };
    if (!snapshotDate) snapshotDate = row.snapshot_date;
    for (const key of playerNameLookupKeys(row.player_name)) {
      if (!byName.has(key)) byName.set(key, mapped);
    }
    if (row.sofascore_player_id != null && !bySofascoreId.has(row.sofascore_player_id)) {
      bySofascoreId.set(row.sofascore_player_id, mapped);
    }
  }

  const uniqueRows = new Map<string, ScoutlystRow>();
  for (const row of byName.values()) {
    if (!uniqueRows.has(row.scoutlyst_player_key)) {
      uniqueRows.set(row.scoutlyst_player_key, row);
    }
  }

  return {
    bySofascoreId,
    byName,
    allRows: [...uniqueRows.values()],
    snapshotDate,
  };
}


function resolveScoutlyst(
  sofascorePlayerId: number,
  name: string,
  bySofascoreId: Map<number, ScoutlystRow>,
  byName: Map<string, ScoutlystRow>,
  byGlobalName?: Map<string, ScoutlystRow>
): ScoutlystRow | null {
  const displayName = formatPlayerDisplayNameIfNeeded(name);
  return (
    bySofascoreId.get(sofascorePlayerId) ??
    resolveScoutlystSnapshot(displayName, byName) ??
    (byGlobalName ? resolveScoutlystSnapshot(displayName, byGlobalName) : null)
  );
}

function toSquadPlayer(input: {
  sofascorePlayerId: number;
  name: string;
  position: string | null;
  fieldPosition: string | null;
  scoutlyst: ScoutlystRow | null;
  matchAvgRating: number | null;
  sofifaOverall?: number | null;
  startSharePct: number | null;
  benchmarkLeagueId: number | undefined;
  teamId: number;
  teamName?: string;
  entityType?: EntityType;
}): SquadPlayer {
  const stats = input.scoutlyst?.stats ?? {};
  const positionLabel = input.fieldPosition ?? input.scoutlyst?.position ?? input.position;
  const fromStats = computePlayerPerformanceScore({
    scoutlystRating: input.scoutlyst?.rating ?? null,
    matchAvgRating: input.matchAvgRating,
    stats,
    position: positionLabel,
  });
  const fromSofifa =
    input.sofifaOverall != null ? sofifaOverallToScore(input.sofifaOverall) : null;
  const rawPerformanceScore = maxPerformanceInputs(fromStats, fromSofifa);
  const playerLeagueId =
    input.scoutlyst?.reference_league_id ?? input.benchmarkLeagueId;
  const performanceScore = applyBenchmarkToPerformanceScore(rawPerformanceScore, {
    entityType: input.entityType,
    teamId: input.teamId,
    teamName: input.teamName,
    leagueId: playerLeagueId ?? input.benchmarkLeagueId ?? 0,
  });
  const detailStats: PlayerDisplayStat[] = buildPlayerDetailStats(stats);

  const displayName = formatPlayerDisplayNameIfNeeded(input.name);

  return {
    sofascorePlayerId: input.sofascorePlayerId,
    scoutlystPlayerKey: input.scoutlyst?.scoutlyst_player_key ?? null,
    name: displayName,
    position: positionDisplayLabel(
      input.fieldPosition ?? input.scoutlyst?.position ?? input.position
    ),
    fieldPosition: input.fieldPosition,
    performanceScore,
    startSharePct: input.startSharePct,
    detailStats,
    age: input.scoutlyst?.age ?? null,
  };
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

export async function loadTeamSquadForComparison(
  supabase: ServiceClient | null,
  teamId: number,
  teamName?: string,
  domesticLeagueId?: number,
  entityType?: EntityType
): Promise<TeamSquadSnapshot> {
  const benchmarkLeagueId =
    domesticLeagueId ?? resolveDomesticLeagueId(teamId) ?? undefined;
  const empty: TeamSquadSnapshot = {
    starters: [],
    substitutes: [],
    hasLineupData: false,
    hasScoutlystData: false,
    squadSource: "none",
    preferredFormation: null,
    snapshotDate: null,
    coach: null,
  };

  const wcTeamLabel = resolveWc2026TeamLabel(teamName, teamId);
  if (wcTeamLabel) {
    const official = await loadOfficialWcSquadForComparison(
      supabase,
      teamId,
      wcTeamLabel,
      { teamName, domesticLeagueId: benchmarkLeagueId, entityType }
    );
    if (official) return official;
  }

  if (!supabase) return empty;

  const effectiveEntity = entityType ?? "club";
  const [lineupAgg, scoutlyst] = await Promise.all([
    aggregateLineupAppearances(supabase, teamId, teamName, 12, {
      entityType: effectiveEntity,
    }),
    loadLatestScoutlystByTeam(supabase, teamId),
  ]);
  const { clubMinutesById, clubRatingById } = buildClubMetricsBySofascoreId(
    scoutlyst.bySofascoreId
  );

  const hasLineupData = lineupAgg.players.length > 0;
  const lineupFormation = lineupAgg.preferredFormation;
  const hasScoutlystData = scoutlyst.byName.size > 0;

  const storedFormation = await loadPreferredFormationForTeam(
    supabase,
    teamId,
    teamName
  );

  let squadSource: TeamSquadSnapshot["squadSource"] = "none";
  let preferredFormation: string | null =
    lineupFormation ?? storedFormation;
  let starters: SquadPlayer[] = [];
  let substitutes: SquadPlayer[] = [];

  if (hasLineupData) {
    squadSource = "lineups";
    const allIds = lineupAgg.players.map((p) => p.sofascorePlayerId);
    const lineupNames = lineupAgg.players.map((p) =>
      formatPlayerDisplayNameIfNeeded(p.name)
    );
    const [globalByName, matchRatings, sofifaByTeam, sofifaGlobal] = await Promise.all([
      loadScoutlystSnapshotsByNames(supabase, lineupNames, { teamId }),
      loadMatchRatingsByPlayerIds(supabase, allIds),
      loadSofifaOverallByTeam(supabase, teamId),
      loadSofifaOverallByNames(supabase, lineupNames),
    ]);

    const qualityById = buildLineupQualityMap(lineupAgg.players, {
      bySofascoreId: scoutlyst.bySofascoreId,
      byName: scoutlyst.byName,
      globalByName,
      matchRatings,
      sofifaByName: sofifaByTeam,
      sofifaGlobalByName: sofifaGlobal,
    });

    const resolvePlayerSofifa = (playerName: string) =>
      resolveSofifaOverall(
        formatPlayerDisplayNameIfNeeded(playerName),
        sofifaGlobal,
        sofifaByTeam
      );

    const inferredStarters = await pickLineupStartersFromAppearances(
      lineupAgg.players,
      lineupFormation,
      qualityById,
      {
        entityType: effectiveEntity,
        clubMinutesById:
          effectiveEntity === "national" ? clubMinutesById : undefined,
        clubRatingById:
          effectiveEntity === "national" ? clubRatingById : undefined,
        supabase,
        teamId,
        teamName,
      }
    );
    const starterIds = new Set(inferredStarters.map((p) => p.sofascorePlayerId));
    const inferredSubs = pickLineupSubstitutesFromAppearances(
      lineupAgg.players,
      starterIds
    );

    const totalStarts = inferredStarters.reduce((sum, p) => sum + p.starts, 0) || 1;

    starters = sortSquadPlayers(
      inferredStarters.map((p) => {
        const scout = resolveScoutlyst(
          p.sofascorePlayerId,
          p.name,
          scoutlyst.bySofascoreId,
          scoutlyst.byName,
          globalByName
        );
        return toSquadPlayer({
          sofascorePlayerId: p.sofascorePlayerId,
          name: p.name,
          position: p.position,
          fieldPosition: p.fieldPosition,
          scoutlyst: scout,
          matchAvgRating: matchRatings.get(p.sofascorePlayerId) ?? null,
          sofifaOverall: resolvePlayerSofifa(p.name),
          startSharePct: Math.round((p.starts / totalStarts) * 100),
          benchmarkLeagueId,
          teamId,
          teamName,
          entityType,
        });
      })
    );

    if (starters.length < 11 && hasScoutlystData) {
      const scoutRows: ScoutlystSquadRow[] = scoutlyst.allRows.map((r) => ({
        scoutlyst_player_key: r.scoutlyst_player_key,
        player_name: r.player_name,
        sofascore_player_id: r.sofascore_player_id,
        position: r.position,
        age: r.age,
        rating: r.rating,
        stats: r.stats,
      }));
      const formationForFill = preferredFormation ?? storedFormation ?? "4-3-3";
      const { starters: scoutStarters } = buildSquadFromScoutlyst(
        scoutRows,
        formationForFill
      );
      const starterIds = new Set(starters.map((p) => p.sofascorePlayerId));
      for (const row of scoutStarters) {
        if (starters.length >= 11) break;
        const sofascoreId =
          row.sofascore_player_id ?? stableSyntheticPlayerId(row.scoutlyst_player_key);
        if (starterIds.has(sofascoreId)) continue;
        const scoutRow: ScoutlystRow = {
          ...row,
          snapshot_date: scoutlyst.snapshotDate ?? "",
          reference_league_id: benchmarkLeagueId ?? null,
        };
        starters.push(
          toSquadPlayer({
            sofascorePlayerId: sofascoreId,
            name: row.player_name,
            position: row.position,
            fieldPosition: row.position,
            scoutlyst: scoutRow,
            matchAvgRating: matchRatings.get(sofascoreId) ?? null,
            sofifaOverall: resolvePlayerSofifa(row.player_name),
            startSharePct: null,
            benchmarkLeagueId,
            teamId,
            teamName,
            entityType,
          })
        );
        starterIds.add(sofascoreId);
      }
      starters = sortSquadPlayers(starters);
    }

    substitutes = sortSquadPlayers(
      inferredSubs.map((p) => {
        const scout = resolveScoutlyst(
          p.sofascorePlayerId,
          p.name,
          scoutlyst.bySofascoreId,
          scoutlyst.byName,
          globalByName
        );
        return toSquadPlayer({
          sofascorePlayerId: p.sofascorePlayerId,
          name: p.name,
          position: p.position,
          fieldPosition: p.fieldPosition,
          scoutlyst: scout,
          matchAvgRating: matchRatings.get(p.sofascorePlayerId) ?? null,
          sofifaOverall: resolvePlayerSofifa(p.name),
          startSharePct: null,
          benchmarkLeagueId,
          teamId,
          teamName,
          entityType,
        });
      })
    );
  } else if (hasScoutlystData) {
    squadSource = "scoutlyst";
    const scoutRows: ScoutlystSquadRow[] = scoutlyst.allRows.map((r) => ({
      scoutlyst_player_key: r.scoutlyst_player_key,
      player_name: r.player_name,
      sofascore_player_id: r.sofascore_player_id,
      position: r.position,
      age: r.age,
      rating: r.rating,
      stats: r.stats,
    }));
    const formationForScoutlyst = preferredFormation ?? storedFormation ?? "4-3-3";
    const { starters: slStarters, substitutes: slSubs } = buildSquadFromScoutlyst(
      scoutRows,
      formationForScoutlyst
    );
    if (!preferredFormation) preferredFormation = formationForScoutlyst;
    const slIds = [
      ...slStarters.map((p) => p.sofascore_player_id ?? stableSyntheticPlayerId(p.scoutlyst_player_key)),
      ...slSubs.map((p) => p.sofascore_player_id ?? stableSyntheticPlayerId(p.scoutlyst_player_key)),
    ];
    const slNames = [...slStarters, ...slSubs].map((r) => r.player_name);
    const [matchRatings, sofifaGlobal] = await Promise.all([
      loadMatchRatingsByPlayerIds(supabase, slIds.filter((id) => id > 0)),
      loadSofifaOverallByNames(supabase, slNames),
    ]);
    const sofifaByTeam = await loadSofifaOverallByTeam(supabase, teamId);

    const mapRow = (row: ScoutlystSquadRow, isStarter: boolean): SquadPlayer => {
      const sofascoreId =
        row.sofascore_player_id ?? stableSyntheticPlayerId(row.scoutlyst_player_key);
      const scoutRow: ScoutlystRow = {
        ...row,
        snapshot_date: scoutlyst.snapshotDate ?? "",
        reference_league_id: benchmarkLeagueId ?? null,
      };
      return toSquadPlayer({
        sofascorePlayerId: sofascoreId,
        name: row.player_name,
        position: row.position,
        fieldPosition: row.position,
        scoutlyst: scoutRow,
        matchAvgRating: matchRatings.get(sofascoreId) ?? null,
        sofifaOverall: resolveSofifaOverall(
          formatPlayerDisplayNameIfNeeded(row.player_name),
          sofifaGlobal,
          sofifaByTeam
        ),
        startSharePct: null,
        benchmarkLeagueId,
        teamId,
        teamName,
        entityType,
      });
    };

    starters = sortSquadPlayers(slStarters.map((r) => mapRow(r, true)));
    substitutes = sortSquadPlayers(slSubs.map((r) => mapRow(r, false)));
  }

  const shouldTryFbref =
    Boolean(teamName?.trim()) &&
    (squadSource === "none" || starters.length === 0 || starters.length < 11);
  if (shouldTryFbref) {
    const fbref = await loadFbrefTeamSquadSnapshot(teamName!, teamId);
    if (fbref?.starters.length) {
      return fbref;
    }
  }

  if (starters.length === 0 && substitutes.length > 0) {
    const promoted = substitutes.slice(0, 11);
    const remaining = substitutes.slice(11);
    return {
      starters: promoted,
      substitutes: remaining,
      hasLineupData,
      hasScoutlystData,
      squadSource,
      preferredFormation,
      snapshotDate: scoutlyst.snapshotDate,
      coach: null,
    };
  }

  return {
    starters,
    substitutes,
    hasLineupData,
    hasScoutlystData,
    squadSource,
    preferredFormation,
    snapshotDate: scoutlyst.snapshotDate,
    coach: null,
  };
}
