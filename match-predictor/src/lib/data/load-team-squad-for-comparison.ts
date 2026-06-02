import {
  buildSquadFromScoutlyst,
  stableSyntheticPlayerId,
  type ScoutlystSquadRow,
} from "@/lib/data/build-squad-from-scoutlyst";
import { computePlayerPerformanceScore } from "@/lib/data/compute-player-performance-score";
import { inferUsualSquadFromLineups } from "@/lib/data/infer-usual-squad-from-lineups";
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
      "scoutlyst_player_key, player_name, sofascore_player_id, position, age, rating, stats, snapshot_date"
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

function resolveScoutlyst(
  sofascorePlayerId: number,
  name: string,
  bySofascoreId: Map<number, ScoutlystRow>,
  byName: Map<string, ScoutlystRow>
): ScoutlystRow | null {
  return bySofascoreId.get(sofascorePlayerId) ?? byName.get(normalizeText(name)) ?? null;
}

function toSquadPlayer(input: {
  sofascorePlayerId: number;
  name: string;
  position: string | null;
  fieldPosition: string | null;
  scoutlyst: ScoutlystRow | null;
  matchAvgRating: number | null;
  startSharePct: number | null;
}): SquadPlayer {
  const stats = input.scoutlyst?.stats ?? {};
  const performanceScore = computePlayerPerformanceScore({
    scoutlystRating: input.scoutlyst?.rating ?? null,
    matchAvgRating: input.matchAvgRating,
    stats,
  });
  const detailStats: PlayerDisplayStat[] = buildPlayerDetailStats(stats);

  return {
    sofascorePlayerId: input.sofascorePlayerId,
    scoutlystPlayerKey: input.scoutlyst?.scoutlyst_player_key ?? null,
    name: input.name,
    position: positionDisplayLabel(input.scoutlyst?.position ?? input.position),
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
  teamName?: string
): Promise<TeamSquadSnapshot> {
  const empty: TeamSquadSnapshot = {
    starters: [],
    substitutes: [],
    hasLineupData: false,
    hasScoutlystData: false,
    squadSource: "none",
    snapshotDate: null,
  };

  if (!supabase) return empty;

  const [{ starters: inferredStarters, substitutes: inferredSubs }, scoutlyst] =
    await Promise.all([
      inferUsualSquadFromLineups(supabase, teamId, teamName),
      loadLatestScoutlystByTeam(supabase, teamId),
    ]);

  const hasLineupData = inferredStarters.length > 0 || inferredSubs.length > 0;
  const hasScoutlystData = scoutlyst.byName.size > 0;

  let squadSource: TeamSquadSnapshot["squadSource"] = "none";
  let starters: SquadPlayer[] = [];
  let substitutes: SquadPlayer[] = [];

  if (hasLineupData) {
    squadSource = "lineups";
    const allIds = [
      ...inferredStarters.map((p) => p.sofascorePlayerId),
      ...inferredSubs.map((p) => p.sofascorePlayerId),
    ];
    const matchRatings = await loadMatchRatings(supabase, allIds);
    const totalStarts = inferredStarters.reduce((sum, p) => sum + p.starts, 0) || 1;

    starters = sortSquadPlayers(
      inferredStarters.map((p) => {
        const scout = resolveScoutlyst(
          p.sofascorePlayerId,
          p.name,
          scoutlyst.bySofascoreId,
          scoutlyst.byName
        );
        return toSquadPlayer({
          sofascorePlayerId: p.sofascorePlayerId,
          name: p.name,
          position: p.position,
          fieldPosition: p.fieldPosition,
          scoutlyst: scout,
          matchAvgRating: matchRatings.get(p.sofascorePlayerId) ?? null,
          startSharePct: Math.round((p.starts / totalStarts) * 100),
        });
      })
    );

    substitutes = sortSquadPlayers(
      inferredSubs.map((p) => {
        const scout = resolveScoutlyst(
          p.sofascorePlayerId,
          p.name,
          scoutlyst.bySofascoreId,
          scoutlyst.byName
        );
        return toSquadPlayer({
          sofascorePlayerId: p.sofascorePlayerId,
          name: p.name,
          position: p.position,
          fieldPosition: p.fieldPosition,
          scoutlyst: scout,
          matchAvgRating: matchRatings.get(p.sofascorePlayerId) ?? null,
          startSharePct: null,
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
    const { starters: slStarters, substitutes: slSubs } = buildSquadFromScoutlyst(scoutRows);
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
      };
      return toSquadPlayer({
        sofascorePlayerId: sofascoreId,
        name: row.player_name,
        position: row.position,
        fieldPosition: row.position,
        scoutlyst: scoutRow,
        matchAvgRating: matchRatings.get(sofascoreId) ?? null,
        startSharePct: null,
      });
    };

    starters = sortSquadPlayers(slStarters.map((r) => mapRow(r, true)));
    substitutes = sortSquadPlayers(slSubs.map((r) => mapRow(r, false)));
  }

  return {
    starters,
    substitutes,
    hasLineupData,
    hasScoutlystData,
    squadSource,
    snapshotDate: scoutlyst.snapshotDate,
  };
}
