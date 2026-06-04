import type { SportApiEvent, SportApiIncidentsResponse } from "@/lib/types/sportapi";
import type { Database } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LINEUP_UNAVAILABLE_QUALITY } from "@/lib/data/formation-lineup";

type ServiceClient = SupabaseClient<Database>;

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

function competitionKey(event: SportApiEvent): number | null {
  return (
    event.tournament?.uniqueTournament?.id ??
    event.tournament?.id ??
    null
  );
}

function isRedCardIncident(incident: SportApiIncidentsResponse["incidents"][0]): boolean {
  const type = (incident.incidentType ?? "").toLowerCase();
  if (type.includes("red")) return true;
  const extra = incident as { incidentClass?: string; cardType?: string };
  const cardClass = (extra.incidentClass ?? extra.cardType ?? "").toLowerCase();
  return type === "card" && cardClass.includes("red");
}

export function redCardedPlayerIdsFromIncidents(
  payload: SportApiIncidentsResponse | null | undefined,
  side: "home" | "away"
): Set<number> {
  const ids = new Set<number>();
  if (!payload?.incidents?.length) return ids;

  for (const incident of payload.incidents) {
    if (!isRedCardIncident(incident)) continue;
    const onHome = incident.isHome === true;
    const onAway = incident.isHome === false;
    if (side === "home" && !onHome && !onAway) continue;
    if (side === "away" && !onAway && !onHome) continue;
    if (side === "home" && onAway) continue;
    if (side === "away" && onHome) continue;
    const playerId = incident.player?.id;
    if (playerId != null) ids.add(playerId);
  }
  return ids;
}

/** Red card in the team's prior finished match in the same competition → suspend for next XI. */
export async function loadCompetitionSuspendedPlayerIds(
  supabase: ServiceClient,
  teamId: number,
  teamName: string | undefined,
  recentEvents: SportApiEvent[],
  forCompetitionId?: number | null
): Promise<Set<number>> {
  if (!recentEvents.length) return new Set();

  const targetCompetition =
    forCompetitionId != null ? forCompetitionId : competitionKey(recentEvents[0]);
  const prior =
    targetCompetition != null
      ? recentEvents.find((e) => competitionKey(e) === targetCompetition)
      : recentEvents[0];
  if (!prior) return new Set();

  const side = teamSideInEvent(prior, teamId, teamName);
  if (!side) return new Set();

  const { data } = await supabase
    .from("synced_event_incidents")
    .select("payload")
    .eq("event_id", prior.id)
    .maybeSingle();

  const payload = data?.payload as SportApiIncidentsResponse | undefined;
  return redCardedPlayerIdsFromIncidents(payload, side);
}

export function applyUnavailableQualityOverrides(
  qualityById: Map<number, number>,
  unavailableIds: Iterable<number>
): void {
  for (const id of unavailableIds) {
    qualityById.set(id, LINEUP_UNAVAILABLE_QUALITY);
  }
}
