import {
  buildSquadFromScoutlyst,
  stableSyntheticPlayerId,
  type ScoutlystSquadRow,
} from "@/lib/data/build-squad-from-scoutlyst";
import { loadFbrefTeamSquadSnapshot } from "@/lib/fbref/comparison-fallback";
import { loadPreferredFormationForTeam } from "@/lib/data/team-formations";
import {
  computePlayerPerformanceScore,
  sofifaOverallToScore,
} from "@/lib/data/compute-player-performance-score";
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

type ScoutlystRow = {
  scoutlyst_player_key: string;
  player_name: string;
  sofascore_player_id: number | null;
  position: string | null;
  age: number | null;
  rating: number | null;
  stats: Record<string, string | number | null>;
  snapshot_date: string;
  reference_league_id: number | null;
};

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
    if (!byName.has(normalizeText(row.player_name))) {
      byName.set(normalizeText(row.player_name), mapped);
    }
    if (row.sofascore_player_id != null && !bySofascoreId.has(row.sofascore_player_id)) {
      bySofascoreId.set(row.sofascore_player_id, mapped);
    }
  }

  return { bySofascoreId, byName, allRows: [...byName.values()], snapshotDate };
}

/** Latest snapshot per player name when team_id on the row is wrong or missing. */
async function loadScoutlystByPlayerNames(
  supabase: ServiceClient,
  normalizedNames: string[]
): Promise<Map<string, ScoutlystRow>> {
  const wanted = new Set(normalizedNames.filter(Boolean));
  if (!wanted.size) return new Map();

  const { data } = await supabase
    .from("scoutlyst_player_snapshots")
    .select(
      "scoutlyst_player_key, player_name, sofascore_player_id, position, age, rating, stats, snapshot_date, reference_league_id"
    )
    .order("snapshot_date", { ascending: false })
    .limit(4000);

  const byName = new Map<string, ScoutlystRow>();
  for (const row of data ?? []) {
    const key = normalizeText(row.player_name);
    if (!wanted.has(key) || byName.has(key)) continue;
    const stats =
      row.stats && typeof row.stats === "object" && !Array.isArray(row.stats)
        ? (row.stats as Record<string, string | number | null>)
        : {};
    byName.set(key, {
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
    });
  }
  return byName;
}

async function loadMatchRatings(
  supabase: ServiceClient,
  playerIds: number[]
): Promise<Map<number, number>> {
  if (!playerIds.length) return new Map();
  const { data } = await supabase
    .from("synced_player_ratings")
    .select("player_id, club_avg_rating")
    .in("player_id", playerIds);

  const map = new Map<number, number>();
  for (const row of data ?? []) {
    if (row.club_avg_rating != null) map.set(row.player_id, Number(row.club_avg_rating));
  }
  return map;
}

async function loadSofifaOverallByTeam(
  supabase: ServiceClient,
  teamId: number
): Promise<Map<string, number>> {
  const { data } = await supabase
    .from("soccerdata_players")
    .select("name, sofifa_overall")
    .eq("team_id", teamId)
    .not("sofifa_overall", "is", null)
    .limit(500);

  const byName = new Map<string, number>();
  for (const row of data ?? []) {
    const key = normalizeText(row.name);
    const overall = row.sofifa_overall;
    if (!key || overall == null || byName.has(key)) continue;
    byName.set(key, Number(overall));
  }
  return byName;
}

function buildLineupQualityMap(
  players: LineupAppearanceAgg[],
  ctx: {
    bySofascoreId: Map<number, ScoutlystRow>;
    byName: Map<string, ScoutlystRow>;
    globalByName: Map<string, ScoutlystRow>;
    matchRatings: Map<number, number>;
    sofifaByName: Map<string, number>;
  }
): Map<number, number> {
  const qualityById = new Map<number, number>();
  for (const p of players) {
    const scout =
      ctx.bySofascoreId.get(p.sofascorePlayerId) ??
      ctx.byName.get(normalizeText(p.name)) ??
      ctx.globalByName.get(normalizeText(p.name)) ??
      null;
    const position = p.fieldPosition ?? scout?.position ?? p.position;
    const fromStats = computePlayerPerformanceScore({
      scoutlystRating: scout?.rating ?? null,
      matchAvgRating: ctx.matchRatings.get(p.sofascorePlayerId) ?? null,
      stats: scout?.stats ?? {},
      position,
    });
    const sofifaOverall = ctx.sofifaByName.get(normalizeText(p.name));
    const fromSofifa =
      sofifaOverall != null ? sofifaOverallToScore(sofifaOverall) : null;
    const score = Math.max(fromStats ?? 0, fromSofifa ?? 0);
    if (score > 0) qualityById.set(p.sofascorePlayerId, score);
  }
  return qualityById;
}

function resolveScoutlyst(
  sofascorePlayerId: number,
  name: string,
  bySofascoreId: Map<number, ScoutlystRow>,
  byName: Map<string, ScoutlystRow>,
  byGlobalName?: Map<string, ScoutlystRow>
): ScoutlystRow | null {
  return (
    bySofascoreId.get(sofascorePlayerId) ??
    byName.get(normalizeText(name)) ??
    byGlobalName?.get(normalizeText(name)) ??
    null
  );
}

function toSquadPlayer(input: {
  sofascorePlayerId: number;
  name: string;
  position: string | null;
  fieldPosition: string | null;
  scoutlyst: ScoutlystRow | null;
  matchAvgRating: number | null;
  startSharePct: number | null;
  benchmarkLeagueId: number | undefined;
  teamId: number;
  teamName?: string;
  entityType?: EntityType;
}): SquadPlayer {
  const stats = input.scoutlyst?.stats ?? {};
  const positionLabel = input.fieldPosition ?? input.scoutlyst?.position ?? input.position;
  const rawPerformanceScore = computePlayerPerformanceScore({
    scoutlystRating: input.scoutlyst?.rating ?? null,
    matchAvgRating: input.matchAvgRating,
    stats,
    position: positionLabel,
  });
  const playerLeagueId =
    input.scoutlyst?.reference_league_id ?? input.benchmarkLeagueId;
  const performanceScore = applyBenchmarkToPerformanceScore(rawPerformanceScore, {
    entityType: input.entityType,
    teamId: input.teamId,
    teamName: input.teamName,
    leagueId: playerLeagueId ?? input.benchmarkLeagueId ?? 0,
  });
  const detailStats: PlayerDisplayStat[] = buildPlayerDetailStats(stats);

  return {
    sofascorePlayerId: input.sofascorePlayerId,
    scoutlystPlayerKey: input.scoutlyst?.scoutlyst_player_key ?? null,
    name: input.name,
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
  };

  if (!supabase) return empty;

  const [lineupAgg, scoutlyst] = await Promise.all([
    aggregateLineupAppearances(supabase, teamId, teamName),
    loadLatestScoutlystByTeam(supabase, teamId),
  ]);

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
    const lineupNames = lineupAgg.players.map((p) => p.name);
    const unmatchedNames = lineupNames.filter(
      (name) => !scoutlyst.byName.has(normalizeText(name))
    );
    const [globalByName, matchRatings, sofifaByName] = await Promise.all([
      unmatchedNames.length
        ? loadScoutlystByPlayerNames(
            supabase,
            unmatchedNames.map((name) => normalizeText(name))
          )
        : Promise.resolve(new Map<string, ScoutlystRow>()),
      loadMatchRatings(supabase, allIds),
      loadSofifaOverallByTeam(supabase, teamId),
    ]);

    const qualityById = buildLineupQualityMap(lineupAgg.players, {
      bySofascoreId: scoutlyst.bySofascoreId,
      byName: scoutlyst.byName,
      globalByName,
      matchRatings,
      sofifaByName,
    });

    const inferredStarters = pickLineupStartersFromAppearances(
      lineupAgg.players,
      lineupFormation,
      qualityById
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
          startSharePct: Math.round((p.starts / totalStarts) * 100),
          benchmarkLeagueId,
          teamId,
          teamName,
          entityType,
        });
      })
    );

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
    const matchRatings = await loadMatchRatings(supabase, slIds.filter((id) => id > 0));

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
    (squadSource === "none" || starters.length === 0);
  if (shouldTryFbref) {
    const fbref = await loadFbrefTeamSquadSnapshot(teamName!, teamId);
    if (fbref?.starters.length) {
      return fbref;
    }
  }

  return {
    starters,
    substitutes,
    hasLineupData,
    hasScoutlystData,
    squadSource,
    preferredFormation,
    snapshotDate: scoutlyst.snapshotDate,
  };
}
