import { loadRecentFormEventsForTeam } from "@/lib/data/assemble-football-bundle";
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

type AppearanceAgg = {
  sofascorePlayerId: number;
  name: string;
  position: string | null;
  fieldPosition: string | null;
  starts: number;
  subAppearances: number;
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
  agg: Map<number, AppearanceAgg>
) {
  if (!side?.players?.length) return;
  for (const row of side.players) {
    const id = row.player?.id;
    const name = row.player?.name?.trim();
    if (!id || !name) continue;
    const existing = agg.get(id) ?? {
      sofascorePlayerId: id,
      name,
      position: row.position ?? row.player.position ?? null,
      fieldPosition: row.position ?? null,
      starts: 0,
      subAppearances: 0,
    };
    if (row.substitute) {
      existing.subAppearances += 1;
    } else {
      existing.starts += 1;
    }
    if (!existing.position && (row.position ?? row.player.position)) {
      existing.position = row.position ?? row.player.position ?? null;
    }
    agg.set(id, existing);
  }
}

function pickUsualStarters(players: AppearanceAgg[], limit = 11): AppearanceAgg[] {
  const sorted = [...players].sort((a, b) => b.starts - a.starts || b.subAppearances - a.subAppearances);
  const picked: AppearanceAgg[] = [];
  const used = new Set<number>();

  const gk = sorted.find((p) => normalizePlayerPosition(p.position) === "G" && p.starts > 0);
  if (gk) {
    picked.push(gk);
    used.add(gk.sofascorePlayerId);
  }

  for (const player of sorted) {
    if (picked.length >= limit) break;
    if (used.has(player.sofascorePlayerId)) continue;
    if (player.starts <= 0) continue;
    picked.push(player);
    used.add(player.sofascorePlayerId);
  }

  return picked;
}

function pickUsualSubstitutes(
  players: AppearanceAgg[],
  starterIds: Set<number>,
  limit = 9
): AppearanceAgg[] {
  return [...players]
    .filter((p) => !starterIds.has(p.sofascorePlayerId) && p.subAppearances > 0)
    .sort((a, b) => b.subAppearances - a.subAppearances || b.starts - a.starts)
    .slice(0, limit);
}

export async function inferUsualSquadFromLineups(
  supabase: ServiceClient,
  teamId: number,
  teamName?: string,
  maxMatches = 12
): Promise<{ starters: InferredSquadPlayer[]; substitutes: InferredSquadPlayer[] }> {
  const events = await loadRecentFormEventsForTeam(supabase, teamId, teamName, maxMatches);
  if (!events.length) return { starters: [], substitutes: [] };

  const eventIds = events.map((e) => e.id);
  const { data: lineupRows } = await supabase
    .from("synced_event_lineups")
    .select("event_id, payload")
    .in("event_id", eventIds);

  const lineupsByEvent = new Map<number, SportApiLineupsResponse>();
  for (const row of lineupRows ?? []) {
    if (row.payload) lineupsByEvent.set(row.event_id, row.payload as SportApiLineupsResponse);
  }

  const agg = new Map<number, AppearanceAgg>();
  for (const event of events) {
    const side = teamSideInEvent(event, teamId, teamName);
    const lineups = lineupsByEvent.get(event.id);
    if (!side || !lineups) continue;
    collectFromSide(side === "home" ? lineups.home : lineups.away, agg);
  }

  const all = [...agg.values()];
  const starters = pickUsualStarters(all);
  const starterIds = new Set(starters.map((p) => p.sofascorePlayerId));
  const substitutes = pickUsualSubstitutes(all, starterIds);

  return { starters, substitutes };
}
