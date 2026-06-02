import type { SofascoreBestPlayersResponse } from "@/lib/api/sofascore/types";
import type {
  SportApiEvent,
  SportApiH2HResponse,
  SportApiIncidentsResponse,
  SportApiLineupsResponse,
  SportApiSeason,
  SportApiStandingsResponse,
  SportApiStatisticsResponse,
  SportApiTeam,
} from "@/lib/types/sportapi";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

export function normalizeTeam(raw: unknown): SportApiTeam | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const id = asNumber(obj.id ?? obj.teamId, NaN);
  const name = pickString(obj, ["name", "displayName", "teamName"]);
  if (!Number.isFinite(id) || !name) return null;
  return {
    id,
    name,
    shortName: pickString(obj, ["shortName", "short_name"]),
    slug: pickString(obj, ["slug"]),
  };
}

type StandingsRow = SportApiStandingsResponse["standings"][0]["rows"][0];

export function normalizeStandingsRow(raw: unknown): StandingsRow | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const team = normalizeTeam(obj.team);
  if (!team) return null;

  const matches = asNumber(obj.matches ?? obj.played, 0);
  const wins = asNumber(obj.wins, 0);
  const draws = asNumber(obj.draws, 0);
  const losses = asNumber(obj.losses, 0);
  const scoresFor = asNumber(
    obj.scoresFor ?? obj.goalsFor ?? obj.goals_scored ?? obj.scored,
    0
  );
  const scoresAgainst = asNumber(
    obj.scoresAgainst ?? obj.goalsAgainst ?? obj.goals_conceded ?? obj.conceded,
    0
  );
  const points = asNumber(obj.points, wins * 3 + draws);
  const position = asNumber(obj.position ?? obj.rank, 0);

  return {
    team,
    position,
    matches,
    wins,
    draws,
    losses,
    scoresFor,
    scoresAgainst,
    points,
  };
}

export function normalizeStandingsResponse(raw: unknown): SportApiStandingsResponse {
  const root = asRecord(raw) ?? {};
  const groups = Array.isArray(root.standings)
    ? root.standings
    : Array.isArray(root.standingsGroups)
      ? root.standingsGroups
      : Array.isArray(root.groups)
        ? root.groups
        : [];

  const standings = groups
    .map((group) => {
      const g = asRecord(group);
      if (!g) return null;
      const rowsRaw = Array.isArray(g.rows)
        ? g.rows
        : Array.isArray(g.teams)
          ? g.teams
          : [];
      const rows = rowsRaw
        .map((row) => normalizeStandingsRow(row))
        .filter((row): row is StandingsRow => row !== null);
      if (!rows.length) return null;
      return {
        type: pickString(g, ["type", "name"]) ?? "total",
        rows,
      };
    })
    .filter((g): g is SportApiStandingsResponse["standings"][0] => g !== null);

  return { standings };
}

export function normalizeEvent(raw: unknown): SportApiEvent | null {
  const obj = asRecord(raw);
  if (!obj) return null;

  const id = asNumber(obj.id ?? obj.eventId, NaN);
  const homeTeam = normalizeTeam(obj.homeTeam ?? obj.home);
  const awayTeam = normalizeTeam(obj.awayTeam ?? obj.away);
  if (!Number.isFinite(id) || !homeTeam || !awayTeam) return null;

  const tournamentRaw = asRecord(obj.tournament) ?? asRecord(obj.uniqueTournament) ?? {};
  const uniqueRaw = asRecord(tournamentRaw.uniqueTournament) ?? tournamentRaw;

  const seasonRaw = asRecord(obj.season);
  const season = seasonRaw
    ? {
        id: asNumber(seasonRaw.id, 0),
        name: pickString(seasonRaw, ["name"]),
        year: pickString(seasonRaw, ["year"]),
      }
    : { id: 0 };

  const venueRaw = asRecord(obj.venue);
  const cityRaw = asRecord(venueRaw?.city);
  const stadiumRaw = asRecord(venueRaw?.stadium);

  const homeScoreRaw = asRecord(obj.homeScore);
  const awayScoreRaw = asRecord(obj.awayScore);

  return {
    id,
    startTimestamp: asNumber(obj.startTimestamp ?? obj.startTimeTimestamp, NaN) || undefined,
    startTime: pickString(obj, ["startTime", "startDate"]),
    homeTeam,
    awayTeam,
    tournament: {
      id: asNumber(tournamentRaw.id, 0),
      name: pickString(tournamentRaw, ["name"]) ?? "Tournament",
      uniqueTournament: uniqueRaw
        ? {
            id: asNumber(uniqueRaw.id, 0),
            name: pickString(uniqueRaw, ["name"]) ?? "",
            slug: pickString(uniqueRaw, ["slug"]),
          }
        : undefined,
    },
    season,
    status: asRecord(obj.status)
      ? {
          type: pickString(obj.status as Record<string, unknown>, ["type", "code"]),
          description: pickString(obj.status as Record<string, unknown>, [
            "description",
            "name",
          ]),
        }
      : undefined,
    homeScore: homeScoreRaw
      ? {
          current:
            asNumber(
              homeScoreRaw.current ??
                homeScoreRaw.display ??
                homeScoreRaw.normaltime ??
                homeScoreRaw.regular,
              NaN
            ) || undefined,
          display: asNumber(homeScoreRaw.display, NaN) || undefined,
        }
      : undefined,
    awayScore: awayScoreRaw
      ? {
          current:
            asNumber(
              awayScoreRaw.current ??
                awayScoreRaw.display ??
                awayScoreRaw.normaltime ??
                awayScoreRaw.regular,
              NaN
            ) || undefined,
          display: asNumber(awayScoreRaw.display, NaN) || undefined,
        }
      : undefined,
    venue: venueRaw
      ? {
          city: cityRaw ? { name: pickString(cityRaw, ["name"]) } : undefined,
          stadium: stadiumRaw
            ? {
                name: pickString(stadiumRaw, ["name"]),
                capacity: asNumber(stadiumRaw.capacity, NaN) || undefined,
              }
            : undefined,
        }
      : undefined,
  };
}

export function normalizeEventsResponse(raw: unknown): { events: SportApiEvent[] } {
  const root = asRecord(raw) ?? {};
  const list = Array.isArray(root.events)
    ? root.events
    : Array.isArray(root.nextEvents)
      ? root.nextEvents
      : Array.isArray(root.lastEvents)
        ? root.lastEvents
        : Array.isArray(raw)
          ? raw
          : [];

  const events = list
    .map((item) => normalizeEvent(item))
    .filter((event): event is SportApiEvent => event !== null);

  return { events };
}

export function normalizeSeasonsResponse(raw: unknown): { seasons: SportApiSeason[] } {
  const root = asRecord(raw) ?? {};
  const list = Array.isArray(root.seasons) ? root.seasons : [];
  const seasons: SportApiSeason[] = [];
  for (const item of list) {
    const s = asRecord(item);
    if (!s) continue;
    const id = asNumber(s.id, NaN);
    if (!Number.isFinite(id)) continue;
    seasons.push({
      id,
      name: pickString(s, ["name"]),
      year: pickString(s, ["year"]),
    });
  }

  return { seasons };
}

export function normalizeStatisticsResponse(raw: unknown): SportApiStatisticsResponse {
  const root = asRecord(raw) ?? {};
  const statistics = Array.isArray(root.statistics) ? root.statistics : [];
  return { statistics: statistics as SportApiStatisticsResponse["statistics"] };
}

function normalizeLineupSide(raw: unknown): SportApiLineupsResponse["home"] {
  const side = asRecord(raw);
  if (!side) return undefined;
  const playersRaw = Array.isArray(side.players) ? side.players : [];
  const players = playersRaw
    .map((p) => {
      const row = asRecord(p);
      if (!row) return null;
      const player = asRecord(row.player) ?? row;
      const id = asNumber(player.id, NaN);
      const name = pickString(player, ["name", "shortName"]);
      if (!Number.isFinite(id) || !name) return null;
      return {
        player: {
          id,
          name,
          position: pickString(player, ["position"]),
          jerseyNumber: pickString(player, ["jerseyNumber", "shirtNumber", "number"]),
        },
        substitute: Boolean(row.substitute ?? row.isSubstitute),
        position: pickString(row, ["position"]),
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  return {
    players,
    formation: pickString(side, ["formation"]),
  };
}

export function normalizeLineupsResponse(raw: unknown): SportApiLineupsResponse {
  const root = asRecord(raw) ?? {};
  const home =
    normalizeLineupSide(root.home) ??
    normalizeLineupSide(root.homeLineup) ??
    normalizeLineupSide(root.homeTeamLineup);
  const away =
    normalizeLineupSide(root.away) ??
    normalizeLineupSide(root.awayLineup) ??
    normalizeLineupSide(root.awayTeamLineup);

  return {
    confirmed:
      typeof root.confirmed === "boolean"
        ? root.confirmed
        : typeof root.lineupsConfirmed === "boolean"
          ? root.lineupsConfirmed
          : undefined,
    home,
    away,
  };
}

export function normalizeH2HResponse(raw: unknown): SportApiH2HResponse {
  const root = asRecord(raw) ?? {};
  const list = Array.isArray(root.events)
    ? root.events
    : Array.isArray(root.h2h)
      ? root.h2h
      : Array.isArray(root.previousMeetings)
        ? root.previousMeetings
        : Array.isArray(raw)
          ? raw
          : [];

  const events = list
    .map((item) => normalizeEvent(item))
    .filter((event): event is SportApiEvent => event !== null);

  return { events };
}

export function normalizeBestPlayersResponse(raw: unknown): SofascoreBestPlayersResponse {
  const root = asRecord(raw) ?? {};
  const list = Array.isArray(root.bestPlayers)
    ? root.bestPlayers
    : Array.isArray(root.players)
      ? root.players
      : [];

  const bestPlayers: SofascoreBestPlayersResponse["bestPlayers"] = [];
  for (const item of list) {
    const row = asRecord(item);
    if (!row) continue;
    const player = asRecord(row.player) ?? row;
    const id = asNumber(player.id, NaN);
    const rating = asNumber(
      row.rating ?? row.value ?? player.rating ?? player.averageRating,
      NaN
    );
    if (!Number.isFinite(id) || !Number.isFinite(rating)) continue;
    bestPlayers.push({ playerId: id, rating });
  }

  return { bestPlayers };
}

export function normalizeIncidentsResponse(raw: unknown): SportApiIncidentsResponse {
  const root = asRecord(raw) ?? {};
  const incidents = Array.isArray(root.incidents) ? root.incidents : [];
  return { incidents: incidents as SportApiIncidentsResponse["incidents"] };
}

export function normalizeSofascorePayload<T>(endpoint: string, data: unknown): T {
  const key = endpoint.split("?")[0].replace(/^\//, "");

  switch (key) {
    case "tournaments/get-seasons":
      return normalizeSeasonsResponse(data) as T;
    case "tournaments/get-standings":
      return normalizeStandingsResponse(data) as T;
    case "tournaments/get-next-matches":
    case "tournaments/get-last-matches":
      return normalizeEventsResponse(data) as T;
    case "matches/detail": {
      const event = normalizeEvent(asRecord(data)?.event ?? data);
      if (!event) {
        throw new Error("SofaScore match detail missing home/away teams or event id");
      }
      return { event } as T;
    }
    case "matches/get-statistics":
      return normalizeStatisticsResponse(data) as T;
    case "matches/get-lineups":
      return normalizeLineupsResponse(data) as T;
    case "matches/get-h2h":
      return normalizeH2HResponse(data) as T;
    case "matches/get-incidents":
      return normalizeIncidentsResponse(data) as T;
    case "matches/get-best-players":
      return normalizeBestPlayersResponse(data) as T;
    default:
      return data as T;
  }
}
