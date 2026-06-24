import {
  DEFAULT_TOURNAMENT_DISCIPLINE_RULES,
  resolveTournamentDisciplineRules,
  type TournamentDisciplineRules,
  type TournamentRound,
} from "@/lib/config/tournament-rules";
import { LINEUP_UNAVAILABLE_QUALITY } from "@/lib/data/formation-lineup";
import { loadKnockoutBracket } from "@/lib/world-cup/knockout-bracket";
import type { Database } from "@/lib/supabase";
import type { SportApiEvent, SportApiIncidentsResponse } from "@/lib/types/sportapi";
import type { SupabaseClient } from "@supabase/supabase-js";

type ServiceClient = SupabaseClient<Database>;

type Incident = SportApiIncidentsResponse["incidents"][0];

function incidentExtras(incident: Incident): { incidentClass?: string; cardType?: string } {
  return incident as { incidentClass?: string; cardType?: string };
}

export function teamSideInEvent(
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

export function competitionKey(event: SportApiEvent): number | null {
  return event.tournament?.uniqueTournament?.id ?? event.tournament?.id ?? null;
}

export function eventDateIso(event: SportApiEvent): string | null {
  if (event.startTime) return event.startTime.slice(0, 10);
  if (event.startTimestamp) {
    return new Date(event.startTimestamp * 1000).toISOString().slice(0, 10);
  }
  return null;
}

function isFinishedEvent(event: SportApiEvent): boolean {
  return event.status?.type === "finished";
}

export function sortTournamentEventsChronologically(
  events: SportApiEvent[]
): SportApiEvent[] {
  return [...events].sort((a, b) => {
    const ta = a.startTimestamp ?? (a.startTime ? Date.parse(a.startTime) / 1000 : 0);
    const tb = b.startTimestamp ?? (b.startTime ? Date.parse(b.startTime) / 1000 : 0);
    if (ta !== tb) return ta - tb;
    return a.id - b.id;
  });
}

function isSecondYellowAsRedIncident(incident: Incident): boolean {
  const type = (incident.incidentType ?? "").toLowerCase();
  const extra = incidentExtras(incident);
  const cardClass = (extra.incidentClass ?? extra.cardType ?? "").toLowerCase();
  return (
    type.includes("yellowred") ||
    type.includes("yellow-red") ||
    type.includes("secondyellow") ||
    cardClass.includes("yellowred") ||
    cardClass.includes("second")
  );
}

export function isRedCardIncident(incident: Incident): boolean {
  if (isSecondYellowAsRedIncident(incident)) return true;
  const type = (incident.incidentType ?? "").toLowerCase();
  if (type.includes("red")) return true;
  const cardClass = (incidentExtras(incident).incidentClass ?? incidentExtras(incident).cardType ?? "").toLowerCase();
  return type === "card" && cardClass.includes("red");
}

export function isYellowCardIncident(incident: Incident): boolean {
  if (isRedCardIncident(incident)) return false;
  const type = (incident.incidentType ?? "").toLowerCase();
  if (type.includes("yellow")) return true;
  const cardClass = (incidentExtras(incident).incidentClass ?? incidentExtras(incident).cardType ?? "").toLowerCase();
  return type === "card" && cardClass.includes("yellow");
}

function incidentAppliesToSide(incident: Incident, side: "home" | "away"): boolean {
  const onHome = incident.isHome === true;
  const onAway = incident.isHome === false;
  if (side === "home" && onAway) return false;
  if (side === "away" && onHome) return false;
  if (!onHome && !onAway) return false;
  return true;
}

function playerIdsFromIncidents(
  payload: SportApiIncidentsResponse | null | undefined,
  side: "home" | "away",
  predicate: (incident: Incident) => boolean
): Set<number> {
  const ids = new Set<number>();
  if (!payload?.incidents?.length) return ids;

  for (const incident of payload.incidents) {
    if (!predicate(incident)) continue;
    if (!incidentAppliesToSide(incident, side)) continue;
    const playerId = incident.player?.id;
    if (playerId != null) ids.add(playerId);
  }
  return ids;
}

export function redCardedPlayerIdsFromIncidents(
  payload: SportApiIncidentsResponse | null | undefined,
  side: "home" | "away"
): Set<number> {
  return playerIdsFromIncidents(payload, side, isRedCardIncident);
}

export function yellowCardedPlayerIdsFromIncidents(
  payload: SportApiIncidentsResponse | null | undefined,
  side: "home" | "away"
): Set<number> {
  return playerIdsFromIncidents(payload, side, isYellowCardIncident);
}

export function secondYellowAsRedPlayerIdsFromIncidents(
  payload: SportApiIncidentsResponse | null | undefined,
  side: "home" | "away"
): Set<number> {
  return playerIdsFromIncidents(payload, side, isSecondYellowAsRedIncident);
}

/** Resolve WC 2026 knockout round from schedule metadata (group stage → GS). */
export function resolveWcRoundForEvent(event: SportApiEvent): TournamentRound {
  const tName = (event.tournament?.name ?? "").toLowerCase();
  if (tName.includes("group")) return "GS";

  const date = eventDateIso(event);
  if (!date) return "GS";

  const stadium = event.venue?.stadium?.name?.trim().toLowerCase() ?? "";
  const city = event.venue?.city?.name?.trim().toLowerCase() ?? "";
  const candidates = loadKnockoutBracket().filter((m) => m.date === date);

  if (stadium || city) {
    const byVenue = candidates.filter((m) => {
      const bracketStadium = m.stadium.trim().toLowerCase();
      const bracketCity = m.city.trim().toLowerCase();
      return (stadium && bracketStadium === stadium) || (city && bracketCity === city);
    });
    if (byVenue.length === 1) return byVenue[0].round;
  }

  if (candidates.length === 1) return candidates[0].round;
  return "GS";
}

export function buildWcRoundByEventId(events: SportApiEvent[]): Map<number, TournamentRound> {
  const map = new Map<number, TournamentRound>();
  for (const event of events) {
    map.set(event.id, resolveWcRoundForEvent(event));
  }
  return map;
}

function isLastEventInRound(
  events: SportApiEvent[],
  index: number,
  round: TournamentRound,
  roundByEventId: ReadonlyMap<number, TournamentRound>
): boolean {
  for (let i = index + 1; i < events.length; i++) {
    if ((roundByEventId.get(events[i].id) ?? "GS") === round) return false;
  }
  return true;
}

/**
 * Simulate discipline across prior tournament matches.
 * Caller must pre-filter `allTournamentEvents` to finished matches strictly before the upcoming fixture.
 */
export function computeTournamentSuspendedPlayerIds(input: {
  teamId: number;
  teamName?: string;
  allTournamentEvents: SportApiEvent[];
  incidentsByEventId: ReadonlyMap<number, SportApiIncidentsResponse>;
  rules?: TournamentDisciplineRules;
  roundByEventId?: ReadonlyMap<number, TournamentRound>;
}): Set<number> {
  const rules = input.rules ?? DEFAULT_TOURNAMENT_DISCIPLINE_RULES;
  const events = sortTournamentEventsChronologically(
    input.allTournamentEvents.filter(isFinishedEvent)
  );
  if (!events.length) return new Set();

  const roundByEventId = input.roundByEventId ?? buildWcRoundByEventId(events);

  let nextMatchBans = new Set<number>();
  const yellowCount = new Map<number, number>();

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const side = teamSideInEvent(event, input.teamId, input.teamName);
    if (!side) continue;

    const servingBan = nextMatchBans;
    nextMatchBans = new Set<number>();

    const payload = input.incidentsByEventId.get(event.id);
    const straightReds = redCardedPlayerIdsFromIncidents(payload, side);
    const secondYellowReds = secondYellowAsRedPlayerIdsFromIncidents(payload, side);
    const singleYellows = yellowCardedPlayerIdsFromIncidents(payload, side);

    const redCarded = new Set<number>([...straightReds, ...secondYellowReds]);
    for (const id of secondYellowReds) singleYellows.delete(id);
    for (const id of redCarded) singleYellows.delete(id);

    for (const playerId of servingBan) {
      yellowCount.delete(playerId);
    }

    for (const playerId of singleYellows) {
      if (servingBan.has(playerId)) continue;
      const next = (yellowCount.get(playerId) ?? 0) + 1;
      if (next >= rules.yellowsPerSuspension) {
        yellowCount.delete(playerId);
        nextMatchBans.add(playerId);
      } else {
        yellowCount.set(playerId, next);
      }
    }

    for (const playerId of redCarded) {
      if (servingBan.has(playerId)) continue;
      yellowCount.delete(playerId);
      nextMatchBans.add(playerId);
    }

    const round = roundByEventId.get(event.id) ?? "GS";
    if (
      rules.amnestyAfterRound &&
      round === rules.amnestyAfterRound &&
      isLastEventInRound(events, i, round, roundByEventId)
    ) {
      yellowCount.clear();
    }
  }

  return nextMatchBans;
}

export async function batchLoadIncidentsByEventId(
  supabase: ServiceClient,
  eventIds: number[]
): Promise<Map<number, SportApiIncidentsResponse>> {
  const map = new Map<number, SportApiIncidentsResponse>();
  if (!eventIds.length) return map;

  const uniqueIds = [...new Set(eventIds)];
  const { data, error } = await supabase
    .from("synced_event_incidents")
    .select("event_id, payload")
    .in("event_id", uniqueIds);

  if (error) return map;

  for (const row of data ?? []) {
    const payload = row.payload as SportApiIncidentsResponse | null;
    if (payload?.incidents) {
      map.set(row.event_id, payload);
    }
  }
  return map;
}

/** Suspensions for the next XI from reds and yellow accumulation in the same competition. */
export async function loadCompetitionSuspendedPlayerIds(
  supabase: ServiceClient,
  teamId: number,
  teamName: string | undefined,
  allTournamentEvents: SportApiEvent[],
  forCompetitionId?: number | null
): Promise<Set<number>> {
  if (!allTournamentEvents.length) return new Set();

  const targetCompetition =
    forCompetitionId != null ? forCompetitionId : competitionKey(allTournamentEvents[0]);
  if (targetCompetition == null) return new Set();

  const competitionEvents = sortTournamentEventsChronologically(
    allTournamentEvents.filter(
      (e) => competitionKey(e) === targetCompetition && isFinishedEvent(e)
    )
  );
  if (!competitionEvents.length) return new Set();

  const incidentsByEventId = await batchLoadIncidentsByEventId(
    supabase,
    competitionEvents.map((e) => e.id)
  );

  return computeTournamentSuspendedPlayerIds({
    teamId,
    teamName,
    allTournamentEvents: competitionEvents,
    incidentsByEventId,
    rules: resolveTournamentDisciplineRules(targetCompetition),
    roundByEventId: buildWcRoundByEventId(competitionEvents),
  });
}

export function countTeamCardsInTournament(input: {
  teamId: number;
  teamName?: string;
  allTournamentEvents: SportApiEvent[];
  incidentsByEventId: ReadonlyMap<number, SportApiIncidentsResponse>;
}): { yellows: number; reds: number; matchesPlayed: number } {
  let yellows = 0;
  let reds = 0;
  let matchesPlayed = 0;

  for (const event of sortTournamentEventsChronologically(
    input.allTournamentEvents.filter(isFinishedEvent)
  )) {
    const side = teamSideInEvent(event, input.teamId, input.teamName);
    if (!side) continue;
    matchesPlayed += 1;
    const payload = input.incidentsByEventId.get(event.id);
    yellows += yellowCardedPlayerIdsFromIncidents(payload, side).size;
    reds += redCardedPlayerIdsFromIncidents(payload, side).size;
  }

  return { yellows, reds, matchesPlayed };
}

export function applyUnavailableQualityOverrides(
  qualityById: Map<number, number>,
  unavailableIds: Iterable<number>
): void {
  for (const id of unavailableIds) {
    qualityById.set(id, LINEUP_UNAVAILABLE_QUALITY);
  }
}
