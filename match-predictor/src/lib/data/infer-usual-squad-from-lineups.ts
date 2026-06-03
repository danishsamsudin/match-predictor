import { loadRecentFormEventsForTeam } from "@/lib/data/assemble-football-bundle";
import {
  dominantStartPosition,
  pickPreferredFormation,
  pickStartersByFormation,
} from "@/lib/data/formation-lineup";
import { lineupRecencyWeight } from "@/lib/data/lineup-appearance-weights";
import { normalizePlayerPosition } from "@/lib/data/normalize-player-position";
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
    const name = row.player?.name?.trim();
    if (!id || !name) continue;
    const existing = agg.get(id) ?? {
      sofascorePlayerId: id,
      name,
      position: row.player.position ?? null,
      fieldPosition: row.position ?? null,
      starts: 0,
      subAppearances: 0,
      startPositionCounts: {},
    };
    const slotPosition = row.position ?? row.player.position ?? null;
    if (row.substitute) {
      existing.subAppearances += weight;
    } else {
      existing.starts += weight;
      const role = normalizePlayerPosition(slotPosition);
      existing.startPositionCounts[role] =
        (existing.startPositionCounts[role] ?? 0) + weight;
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
  maxMatches = 12
): Promise<{
  players: LineupAppearanceAgg[];
  formations: string[];
  preferredFormation: string | null;
}> {
  const events = await loadRecentFormEventsForTeam(supabase, teamId, teamName, maxMatches);
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
  return {
    players: [...agg.values()],
    formations,
    preferredFormation,
  };
}

export function pickLineupStartersFromAppearances(
  players: LineupAppearanceAgg[],
  formation: string | null,
  qualityById?: Map<number, number>
): LineupAppearanceAgg[] {
  return pickStartersByFormation(
    players.map((p) => ({
      ...p,
      id: p.sofascorePlayerId,
      dominantPosition: () =>
        dominantStartPosition(p.startPositionCounts, p.fieldPosition ?? p.position),
    })),
    formation,
    { qualityById }
  );
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
  qualityById?: Map<number, number>
): Promise<{
  starters: InferredSquadPlayer[];
  substitutes: InferredSquadPlayer[];
  preferredFormation: string | null;
}> {
  const { players, preferredFormation } = await aggregateLineupAppearances(
    supabase,
    teamId,
    teamName,
    maxMatches
  );
  if (!players.length) {
    return { starters: [], substitutes: [], preferredFormation: null };
  }

  const starters = pickLineupStartersFromAppearances(
    players,
    preferredFormation,
    qualityById
  );
  const starterIds = new Set(starters.map((p) => p.sofascorePlayerId));
  const substitutes = pickLineupSubstitutesFromAppearances(players, starterIds);

  return {
    starters: starters.map(mapPlayer),
    substitutes: substitutes.map(mapPlayer),
    preferredFormation,
  };
}
