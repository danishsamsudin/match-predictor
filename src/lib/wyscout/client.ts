/**
 * Minimal Wyscout REST client (Basic auth).
 * Base URL defaults to https://apirest.wyscout.com/v2
 */

const DEFAULT_BASE = "https://apirest.wyscout.com/v2";

export type WyscoutClientOptions = {
  username?: string;
  password?: string;
  baseUrl?: string;
  /** Optional fetch override (tests / mocks) */
  fetchImpl?: typeof fetch;
  minIntervalMs?: number;
};

export class WyscoutApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly path: string
  ) {
    super(message);
    this.name = "WyscoutApiError";
  }
}

function resolveCredentials(opts: WyscoutClientOptions): { username: string; password: string } {
  const username =
    opts.username ??
    process.env.WYSCOUT_USERNAME ??
    process.env.WYSCOUT_CLIENT_ID ??
    "";
  const password =
    opts.password ??
    process.env.WYSCOUT_PASSWORD ??
    process.env.WYSCOUT_CLIENT_SECRET ??
    "";
  if (!username || !password) {
    throw new Error(
      "Missing Wyscout credentials (WYSCOUT_USERNAME/WYSCOUT_PASSWORD or WYSCOUT_CLIENT_ID/WYSCOUT_CLIENT_SECRET)"
    );
  }
  return { username, password };
}

export class WyscoutClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly fetchImpl: typeof fetch;
  private readonly minIntervalMs: number;
  private lastRequestAt = 0;

  constructor(opts: WyscoutClientOptions = {}) {
    const { username, password } = resolveCredentials(opts);
    this.baseUrl = (opts.baseUrl ?? process.env.WYSCOUT_BASE_URL ?? DEFAULT_BASE).replace(
      /\/$/,
      ""
    );
    this.authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.minIntervalMs = opts.minIntervalMs ?? 200;
  }

  private async throttle(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < this.minIntervalMs) {
      await new Promise((r) => setTimeout(r, this.minIntervalMs - elapsed));
    }
    this.lastRequestAt = Date.now();
  }

  async get<T = unknown>(path: string, query?: Record<string, string | number | boolean | undefined>): Promise<T> {
    await this.throttle();
    const url = new URL(`${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined) continue;
        url.searchParams.set(k, String(v));
      }
    }
    const res = await this.fetchImpl(url.toString(), {
      method: "GET",
      headers: {
        Authorization: this.authHeader,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new WyscoutApiError(
        `Wyscout GET ${path} failed (${res.status}): ${body.slice(0, 200)}`,
        res.status,
        path
      );
    }
    return (await res.json()) as T;
  }

  getTeam(wyId: number) {
    return this.get(`/teams/${wyId}`);
  }

  getPlayer(wyId: number) {
    return this.get(`/players/${wyId}`);
  }

  getMatch(wyId: number, fetchObjects?: string) {
    return this.get(`/matches/${wyId}`, fetchObjects ? { fetch: fetchObjects } : undefined);
  }

  getMatchEvents(wyId: number, fetchObjects = "teams,players,match") {
    return this.get(`/matches/${wyId}/events`, { fetch: fetchObjects });
  }

  getMatchAdvancedStats(wyId: number) {
    return this.get(`/matches/${wyId}/advancedstats`);
  }

  getCompetition(wyId: number) {
    return this.get(`/competitions/${wyId}`);
  }

  getSeasonMatches(seasonId: number) {
    return this.get(`/seasons/${seasonId}/matches`);
  }

  getTeamAdvancedStats(wyId: number, compId: number, opts?: { seasonId?: number; matchDay?: number }) {
    return this.get(`/teams/${wyId}/advancedstats`, {
      compId,
      seasonId: opts?.seasonId,
      matchDay: opts?.matchDay,
    });
  }
}

export function createWyscoutClient(opts?: WyscoutClientOptions): WyscoutClient {
  return new WyscoutClient(opts);
}
