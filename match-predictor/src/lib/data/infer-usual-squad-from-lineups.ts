import { loadRecentFormEventsForTeam } from "@/lib/data/assemble-football-bundle";
import { filterEventsByCoachContinuity } from "@/lib/data/coach-continuity";
import {
  dominantStartPosition,
  dominantStartSubRole,
  mapFieldPositionToSubRole,
  pickPreferredFormation,
  pickStartersByFormation,
  type GranularSubRole,
} from "@/lib/data/formation-lineup";
import {
  applyUnavailableQualityOverrides,
  loadCompetitionSuspendedPlayerIds,
} from "@/lib/data/lineup-suspensions";
import { lineupRecencyWeight } from "@/lib/data/lineup-appearance-weights";
import { filterPlayersByAvailability, loadBlockingAvailabilityNameKeys } from "@/lib/data/player-availability";
import { formatPlayerDisplayNameIfNeeded } from "@/lib/data/format-player-display-name";
import { normalizePlayerPosition } from "@/lib/data/normalize-player-position";
import type { EntityType } from "@/lib/types/football-lookup";
import type { Database } from "@/lib/supabase";
import type { SportApiEvent, SportApiLineupsResponse } from "@/lib/types/sportapi";
import type { SupabaseClient } from "@supabase/supabase-js";

type ServiceClient = SupabaseClient<Database>;

export type InferredSquadPlayer = {
  sofascorePlayerId: number;
  name: string;
  position: string | null;
  fieldPosition: string | null;
  starts: number;
  subAppearances: number;
};

export type LineupAppearanceAgg = {
  sofascorePlayerId: number;
  name: string;
  position: string | null;
  fieldPosition: string | null;
  starts: number;
  subAppearances: number;
  startPositionCounts: Partial<Record<"G" | "D" | "M" | "F", number>>;
  startSubRoleCounts: Partial<Record<GranularSubRole, number>>;
};

export type AggregateLineupOptions = {
  maxMatches?: number;
  entityType?: EntityType;
  /** Club minutes / rating from Scoutlyst for national-team ranking blend. */
  clubMinutesById?: Map<number, number>;
  clubRatingById?: Map<number, number>;
};

function teamSideInEvent(
  event: SportApiEvent,
  teamId: number,
  teamName?: string
): "home" | "away" | null {
  if (event.homeTeam.id === teamId) return "home";
  if (event.awayTeam.id === teamId) return "away";
  if (!teamName) return null;
  const normalized = teamName.trim().toLowerCase();
  if (event.homeTeam.name.toLowerCase() === normalized) return "home";
  if (event.awayTeam.name.toLowerCase() === normalized) return "away";
  return null;
}

function collectFromSide(
  side: SportApiLineupsResponse["home"],
  agg: Map<number, LineupAppearanceAgg>,
  weight: number
) {
  if (!side?.players?.length) return;
  for (const row of side.players) {
    const id = row.player?.id;
    const name = formatPlayerDisplayNameIfNeeded(row.player?.name?.trim() ?? "");
    if (!id || !name) continue;
    const existing = agg.get(id) ?? {
      sofascorePlayerId: id,
      name,
      position: row.player.position ?? null,
      fieldPosition: row.position ?? null,
      starts: 0,
      subAppearances: 0,
      startPositionCounts: {},
      startSubRoleCounts: {},
    };
    const slotPosition = row.position ?? row.player.position ?? null;
    if (row.substitute) {
      existing.subAppearances += weight;
    } else {
      existing.starts += weight;
      const role = normalizePlayerPosition(slotPosition);
      existing.startPositionCounts[role] =
        (existing.startPositionCounts[role] ?? 0) + weight;
      const subRole = mapFieldPositionToSubRole(slotPosition);
      existing.startSubRoleCounts[subRole] =
        (existing.startSubRoleCounts[subRole] ?? 0) + weight;
      if (row.position) existing.fieldPosition = row.position;
    }
    if (!existing.position && row.player.position) {
      existing.position = row.player.position;
    }
    agg.set(id, existing);
  }
}

export async function aggregateLineupAppearances(
  supabase: ServiceClient,
  teamId: number,
  teamName?: string,
  maxMatches = 12,
  options?: AggregateLineupOptions
): Promise<{
  players: LineupAppearanceAgg[];
  formations: string[];
  preferredFormation: string | null;
}> {
  const limit = options?.maxMatches ?? maxMatches;
  let events = await loadRecentFormEventsForTeam(supabase, teamId, teamName, limit);
  events = await filterEventsByCoachContinuity(supabase, events, teamName);

  if (!events.length) {
    return { players: [], formations: [], preferredFormation: null };
  }

  const eventIds = events.map((e) => e.id);
  const { data: lineupRows } = await supabase
    .from("synced_event_lineups")
    .select("event_id, payload")
    .in("event_id", eventIds);

  const lineupsByEvent = new Map<number, SportApiLineupsResponse>();
  for (const row of lineupRows ?? []) {
    if (row.payload) lineupsByEvent.set(row.event_id, row.payload as SportApiLineupsResponse);
  }

  const agg = new Map<number, LineupAppearanceAgg>();
  const formations: string[] = [];
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const weight = lineupRecencyWeight(i);
    const side = teamSideInEvent(event, teamId, teamName);
    const lineups = lineupsByEvent.get(event.id);
    if (!side || !lineups) continue;
    const lineupSide = side === "home" ? lineups.home : lineups.away;
    if (lineupSide?.formation?.trim()) formations.push(lineupSide.formation.trim());
    collectFromSide(lineupSide, agg, weight);
  }

  const preferredFormation = pickPreferredFormation(formations);
  let players = [...agg.values()];

  const blockingNames = await loadBlockingAvailabilityNameKeys(supabase);
  players = filterPlayersByAvailability(players, blockingNames);

  return {
    players,
    formations,
    preferredFormation,
  };
}

export type PickLineupStartersOptions = {
  requireStarts?: boolean;
  entityType?: EntityType;
  clubMinutesById?: Map<number, number>;
  clubRatingById?: Map<number, number>;
  /** Apply competition red-card suspension from prior synced match. */
  supabase?: ServiceClient | null;
  teamId?: number;
  teamName?: string;
  recentEvents?: SportApiEvent[];
};

export async function pickLineupStartersFromAppearances(
  players: LineupAppearanceAgg[],
  formation: string | null,
  qualityById?: Map<number, number>,
  options?: PickLineupStartersOptions
): Promise<LineupAppearanceAgg[]> {
  const quality = new Map(qualityById ?? []);

  if (options?.supabase && options.teamId != null) {
    const events =
      options.recentEvents ??
      (await loadRecentFormEventsForTeam(
        options.supabase,
        options.teamId,
        options.teamName,
        5
      ));
    const suspended = await loadCompetitionSuspendedPlayerIds(
      options.supabase,
      options.teamId,
      options.teamName,
      events
    );
    applyUnavailableQualityOverrides(quality, suspended);
  }

  const mapped = players.map((p) => ({
    ...p,
    id: p.sofascorePlayerId,
    fieldPosition: p.fieldPosition ?? p.position,
    dominantPosition: () =>
      dominantStartPosition(p.startPositionCounts, p.fieldPosition ?? p.position),
    dominantSubRole: () =>
      dominantStartSubRole(p.startSubRoleCounts, p.fieldPosition ?? p.position),
  }));

  const picked = pickStartersByFormation(mapped, formation, {
    qualityById: quality,
    requireStarts: options?.requireStarts,
    entityType: options?.entityType ?? "club",
    clubMinutesById: options?.clubMinutesById,
    clubRatingById: options?.clubRatingById,
  });

  if (picked.length > 0) {
    return picked.map(({ id, ...rest }) => {
      const source = players.find((p) => p.sofascorePlayerId === id);
      return source ?? (rest as LineupAppearanceAgg);
    });
  }
  return [...players]
    .sort(
      (a, b) =>
        b.starts - a.starts ||
        b.subAppearances - a.subAppearances ||
        a.name.localeCompare(b.name)
    )
    .slice(0, 11);
}

export function pickLineupSubstitutesFromAppearances(
  players: LineupAppearanceAgg[],
  starterIds: Set<number>,
  limit = 9
): LineupAppearanceAgg[] {
  return [...players]
    .filter((p) => !starterIds.has(p.sofascorePlayerId) && p.subAppearances > 0)
    .sort((a, b) => b.subAppearances - a.subAppearances || b.starts - a.starts)
    .slice(0, limit);
}

function mapPlayer(p: LineupAppearanceAgg): InferredSquadPlayer {
  return {
    sofascorePlayerId: p.sofascorePlayerId,
    name: p.name,
    position: p.position,
    fieldPosition: p.fieldPosition,
    starts: p.starts,
    subAppearances: p.subAppearances,
  };
}

export async function inferUsualSquadFromLineups(
  supabase: ServiceClient,
  teamId: number,
  teamName?: string,
  maxMatches = 12,
  qualityById?: Map<number, number>,
  options?: Omit<AggregateLineupOptions, "maxMatches"> & PickLineupStartersOptions
): Promise<{
  starters: InferredSquadPlayer[];
  substitutes: InferredSquadPlayer[];
  preferredFormation: string | null;
}> {
  const { players, preferredFormation } = await aggregateLineupAppearances(
    supabase,
    teamId,
    teamName,
    maxMatches,
    options
  );
  if (!players.length) {
    return { starters: [], substitutes: [], preferredFormation: null };
  }

  const starters = await pickLineupStartersFromAppearances(
    players,
    preferredFormation,
    qualityById,
    {
      ...options,
      supabase,
      teamId,
      teamName,
    }
  );
  const starterIds = new Set(starters.map((p) => p.sofascorePlayerId));
  const substitutes = pickLineupSubstitutesFromAppearances(players, starterIds);

  return {
    starters: starters.map(mapPlayer),
    substitutes: substitutes.map(mapPlayer),
    preferredFormation,
  };
}
