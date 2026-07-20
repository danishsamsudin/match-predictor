/**
 * SportMonks Football API v3 client.
 * Base: https://api.sportmonks.com/v3/football
 * Auth: SPORTMONKS_API_TOKEN (api_token query or Authorization header)
 *
 * Fixture includes are locked to the project subscription (no Expected Goals /
 * xGFixture / other premium includes). See {@link PLAN_FIXTURE_INCLUDE}.
 */

import type { SmApiResponse, SmCoach, SmPagination, SmPlayer, SmTeam } from "./types";
import { SM_LEAGUE } from "./constants";

export {
  SM_LEAGUE,
  SM_SEASON_2026_27,
  DEFAULT_GLPM_LEAGUE_IDS,
  DEFAULT_GLPM_SEASON_IDS_2026_27,
  parseIdList,
  chunkIds,
} from "./constants";

/** Full player profile includes (monthly sync). Some may 403 on lower plans — client falls back. */
export const PLAN_PLAYER_INCLUDE = [
  "country",
  "city",
  "nationality",
  "teams",
  "statistics",
  "position",
  "detailedPosition",
  "lineups",
  "latest",
  "trophies",
  "metadata",
  "transfers",
  "pendingTransfers",
  "sport",
].join(";");

export const PLAN_PLAYER_INCLUDE_MINIMAL = ["country", "nationality", "teams", "position"].join(";");

const DEFAULT_BASE = "https://api.sportmonks.com/v3/football";

/**
 * Only includes available on our SportMonks football plan.
 * Do not append premium includes (e.g. xGFixture) — they return 403 and break ingest.
 */
export const PLAN_FIXTURE_INCLUDE = [
  "round",
  "stage",
  "group",
  "aggregate",
  "season",
  "coaches",
  "tvStations",
  "venue",
  "state",
  "weatherReport",
  "events",
  "timeline",
  "comments",
  "trends",
  "statistics",
  "periods",
  "lineups",
  "sport",
  "participants",
  "sidelined",
  "referees",
  "formations",
  "scores",
  "metadata",
  "league",
].join(";");

const PLAN_FIXTURE_INCLUDE_SET = new Set(PLAN_FIXTURE_INCLUDE.split(";"));

/** Drop premium / unknown includes so callers cannot request plan-blocked fields. */
export function sanitizeFixtureInclude(include: string): string {
  const parts = include
    .split(";")
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && PLAN_FIXTURE_INCLUDE_SET.has(p));
  return parts.length > 0 ? parts.join(";") : PLAN_FIXTURE_INCLUDE;
}

/** @deprecated Use PLAN_FIXTURE_INCLUDE — kept as alias for older imports. */
export const FIXTURE_INCLUDE_CORE = PLAN_FIXTURE_INCLUDE;

/** @deprecated Use PLAN_FIXTURE_INCLUDE. */
export const DEFAULT_FIXTURE_INCLUDE = PLAN_FIXTURE_INCLUDE;

export type SportmonksClientOptions = {
  apiToken?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  minIntervalMs?: number;
  maxRetries?: number;
};

export class SportmonksApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly path: string,
    public readonly retryAfterSeconds?: number
  ) {
    super(message);
    this.name = "SportmonksApiError";
  }
}

function resolveToken(opts: SportmonksClientOptions): string {
  const token = opts.apiToken ?? process.env.SPORTMONKS_API_TOKEN ?? "";
  if (!token) throw new Error("Missing SPORTMONKS_API_TOKEN");
  return token;
}

export class SportmonksClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly minIntervalMs: number;
  private readonly maxRetries: number;
  private lastRequestAt = 0;

  constructor(opts: SportmonksClientOptions = {}) {
    this.token = resolveToken(opts);
    this.baseUrl = (opts.baseUrl ?? process.env.SPORTMONKS_BASE_URL ?? DEFAULT_BASE).replace(
      /\/$/,
      ""
    );
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.minIntervalMs = opts.minIntervalMs ?? 150;
    this.maxRetries = opts.maxRetries ?? 3;
  }

  private async throttle(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < this.minIntervalMs) {
      await new Promise((r) => setTimeout(r, this.minIntervalMs - elapsed));
    }
    this.lastRequestAt = Date.now();
  }

  async get<T = unknown>(
    path: string,
    query?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    let attempt = 0;
    while (true) {
      await this.throttle();
      const url = new URL(`${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`);
      url.searchParams.set("api_token", this.token);
      if (query) {
        for (const [k, v] of Object.entries(query)) {
          if (v === undefined) continue;
          url.searchParams.set(k, String(v));
        }
      }
      const res = await this.fetchImpl(url.toString(), {
        method: "GET",
        headers: {
          Authorization: this.token,
          Accept: "application/json",
        },
      });

      if (res.status === 429 && attempt < this.maxRetries) {
        const retryAfter = Number(res.headers.get("retry-after") ?? "2");
        await new Promise((r) => setTimeout(r, (Number.isFinite(retryAfter) ? retryAfter : 2) * 1000));
        attempt += 1;
        continue;
      }

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new SportmonksApiError(
          `SportMonks GET ${path} failed (${res.status}): ${body.slice(0, 200)}`,
          res.status,
          path
        );
      }
      return (await res.json()) as T;
    }
  }

  getFixture(id: number, include: string = PLAN_FIXTURE_INCLUDE) {
    return this.get(`/fixtures/${id}`, { include: sanitizeFixtureInclude(include) });
  }

  getFixturesMulti(ids: number[], include: string = PLAN_FIXTURE_INCLUDE) {
    const chunk = ids.slice(0, 50).join(",");
    return this.get(`/fixtures/multi/${chunk}`, { include: sanitizeFixtureInclude(include) });
  }

  getLeague(id: number, include?: string) {
    return this.get(`/leagues/${id}`, include ? { include } : undefined);
  }

  getSeason(id: number) {
    return this.get(`/seasons/${id}`);
  }

  getSeasonSchedule(seasonId: number) {
    return this.get(`/schedules/seasons/${seasonId}`);
  }

  getTeam(id: number, include?: string) {
    return this.get(`/teams/${id}`, include ? { include } : undefined);
  }

  getTeamSquad(seasonId: number, teamId: number, include = "player;position;detailedPosition") {
    return this.get(`/squads/seasons/${seasonId}/teams/${teamId}`, { include });
  }

  getPlayer(id: number, include?: string) {
    return this.get(`/players/${id}`, include ? { include } : undefined);
  }

  getCoach(id: number) {
    return this.get(`/coaches/${id}`);
  }

  /** Walk cursor-based pages until `has_more` is false. */
  async listAllPages<T>(
    path: string,
    query?: Record<string, string | number | boolean | undefined>,
    options?: { maxPages?: number }
  ): Promise<T[]> {
    const rows: T[] = [];
    let cursor: string | undefined;
    let pages = 0;
    const maxPages = options?.maxPages ?? Infinity;

    while (pages < maxPages) {
      const pageQuery: Record<string, string | number | boolean | undefined> = {
        ...query,
        ...(cursor ? { cursor } : { per_page: query?.per_page ?? 50 }),
      };
      const res = await this.get<SmApiResponse<T[]>>(path, pageQuery);
      const page = Array.isArray(res.data) ? res.data : [];
      rows.push(...page);
      pages += 1;

      const pagination: SmPagination | undefined = res.pagination;
      if (!pagination?.has_more || !pagination.next_cursor) break;
      cursor = pagination.next_cursor;
    }

    return rows;
  }

  listTeams(query?: Record<string, string | number | boolean | undefined>) {
    return this.listAllPages<SmTeam>("/teams", query);
  }

  listPlayers(query?: Record<string, string | number | boolean | undefined>, options?: { maxPages?: number }) {
    return this.listAllPages<SmPlayer>("/players", query, options);
  }

  listCoaches(query?: Record<string, string | number | boolean | undefined>, options?: { maxPages?: number }) {
    return this.listAllPages<SmCoach>("/coaches", query, options);
  }

  listPlayersBySeasons(seasonIds: number[], include: string = PLAN_PLAYER_INCLUDE, options?: { maxPages?: number }) {
    return this.listPlayers(
      {
        include,
        filters: `playerStatisticSeasons:${seasonIds.join(",")}`,
      },
      options
    );
  }

  listTeamsByIds(teamIds: number[], include?: string) {
    return this.listTeams({
      ...(include ? { include } : {}),
      filters: `teamIds:${teamIds.join(",")}`,
    });
  }

  getFixturesBetween(
    start: string,
    end: string,
    leagueIds = [SM_LEAGUE.PREMIER_LEAGUE, SM_LEAGUE.EREDIVISIE]
  ) {
    return this.get(`/fixtures/between/${start}/${end}`, {
      filters: `fixtureLeagues:${leagueIds.join(",")}`,
    });
  }
}

export function createSportmonksClient(opts?: SportmonksClientOptions): SportmonksClient {
  return new SportmonksClient(opts);
}
