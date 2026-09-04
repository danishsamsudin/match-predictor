/**
 * Parse saved Statz.ai team HTML (Inertia data-page) into per-team match stats.
 */

export type StatzTeamStatMap = Record<string, string | number | null | undefined>;

export type StatzFixtureInfo = {
  id: number;
  current_team_id: number;
  name: string;
  home_team_id: number;
  away_team_id: number;
  home_team_name?: string;
  away_team_name?: string;
  home_team_goals?: number | null;
  away_team_goals?: number | null;
  formatted_kickoff_datetime?: string;
  season_name?: string;
  competition_id?: number;
  competition_name?: string;
};

export type StatzParsedFixture = {
  info: StatzFixtureInfo;
  selected_team_stats: StatzTeamStatMap;
  opposition_stats: StatzTeamStatMap;
};

export type StatzTeamPage = {
  teamId: number;
  teamName: string;
  fixtures: StatzParsedFixture[];
  fixtureLimit?: number | null;
  premierLeagueTeams?: { id: number; name: string }[];
  teamSummary?: unknown;
};

export type StatzTeamMatchRow = {
  matchSmId: number;
  teamSmId: number;
  opponentSmId: number;
  isHome: boolean;
  seasonName: string;
  competitionId: number | null;
  competitionName: string | null;
  kickoffLabel: string | null;
  homeTeamSmId: number;
  awayTeamSmId: number;
  homeGoals: number | null;
  awayGoals: number | null;
  corners: number | null;
  yellowCards: number | null;
  redCards: number | null;
  fouls: number | null;
  tackles: number | null;
  shots: number | null;
  shotsOnTarget: number | null;
  possessionPct: number | null;
  passes: number | null;
  saves: number | null;
  xg: number | null;
  goals: number | null;
  goalsConceded: number | null;
  shotsInsideBox: number | null;
  shotsOutsideBox: number | null;
  freeKicks: number | null;
  keyPasses: number | null;
  bigChancesMissed: number | null;
  accurateCrosses: number | null;
  duelsWon: number | null;
  dribbleAttempts: number | null;
  successfulDribbles: number | null;
  source: "statz";
  fromSelected: boolean;
};

const PL_COMPETITION_ID = 8;
const SEASON_2526 = "25/26";

export function parseStatzNumber(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const s = String(raw).trim();
  if (!s || s === "-" || s === "–" || s === "—") return 0;
  const n = Number(s.replace("%", "").trim());
  return Number.isFinite(n) ? n : null;
}

export function extractInertiaPageJson(html: string): unknown | null {
  const m = html.match(/data-page="([^"]+)"/);
  if (!m?.[1]) return null;
  const decoded = m[1]
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
  try {
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

export function parseStatzTeamPage(html: string): StatzTeamPage | null {
  const page = extractInertiaPageJson(html) as {
    props?: {
      team?: { id?: number; name?: string; short_name?: string };
      fixtures?: StatzParsedFixture[];
      limit?: number;
      premierLeagueTeams?: Array<{ id?: number; name?: string; short_name?: string }>;
      teamSummary?: unknown;
    };
  } | null;
  if (!page?.props?.team?.id || !Array.isArray(page.props.fixtures)) return null;
  const plTeams = Array.isArray(page.props.premierLeagueTeams)
    ? page.props.premierLeagueTeams
        .filter((t) => t?.id != null)
        .map((t) => ({
          id: Number(t.id),
          name: String(t.name ?? t.short_name ?? `Team ${t.id}`),
        }))
    : [];
  return {
    teamId: Number(page.props.team.id),
    teamName: String(page.props.team.name ?? page.props.team.short_name ?? `Team ${page.props.team.id}`),
    fixtures: page.props.fixtures,
    fixtureLimit: page.props.limit != null ? Number(page.props.limit) : null,
    premierLeagueTeams: plTeams,
    teamSummary: page.props.teamSummary ?? null,
  };
}

function mapStats(stats: StatzTeamStatMap | undefined): Omit<
  StatzTeamMatchRow,
  | "matchSmId"
  | "teamSmId"
  | "opponentSmId"
  | "isHome"
  | "seasonName"
  | "competitionId"
  | "competitionName"
  | "kickoffLabel"
  | "homeTeamSmId"
  | "awayTeamSmId"
  | "homeGoals"
  | "awayGoals"
  | "source"
  | "fromSelected"
> {
  const s = stats ?? {};
  return {
    corners: parseStatzNumber(s.CORNERS),
    yellowCards: parseStatzNumber(s.YELLOWCARDS),
    redCards: parseStatzNumber(s.REDCARDS),
    fouls: parseStatzNumber(s.FOULS),
    tackles: parseStatzNumber(s.TACKLES),
    shots: parseStatzNumber(s.SHOTS_TOTAL),
    shotsOnTarget: parseStatzNumber(s.SHOTS_ON_TARGET),
    possessionPct: parseStatzNumber(s.BALL_POSSESSION),
    passes: parseStatzNumber(s.PASSES),
    saves: parseStatzNumber(s.SAVES),
    xg: parseStatzNumber(s.EXPECTED_GOALS),
    goals: parseStatzNumber(s.GOALS),
    goalsConceded: parseStatzNumber(s.GOALS_CONCEDED),
    shotsInsideBox: parseStatzNumber(s.SHOTS_INSIDEBOX),
    shotsOutsideBox: parseStatzNumber(s.SHOTS_OUTSIDEBOX),
    freeKicks: parseStatzNumber(s.FREE_KICKS),
    keyPasses: parseStatzNumber(s.KEY_PASSES),
    bigChancesMissed: parseStatzNumber(s.BIG_CHANCES_MISSED),
    accurateCrosses: parseStatzNumber(s.ACCURATE_CROSSES),
    duelsWon: parseStatzNumber(s.DUELS_WON),
    dribbleAttempts: parseStatzNumber(s.DRIBBLED_ATTEMPTS),
    successfulDribbles: parseStatzNumber(s.SUCCESSFUL_DRIBBLES),
  };
}

export function fixtureToTeamRows(fx: StatzParsedFixture): StatzTeamMatchRow[] {
  const info = fx.info;
  if (info?.id == null || info.home_team_id == null || info.away_team_id == null) return [];
  const selectedId = Number(info.current_team_id);
  const homeId = Number(info.home_team_id);
  const awayId = Number(info.away_team_id);
  const selectedIsHome = selectedId === homeId;
  const opponentId = selectedIsHome ? awayId : homeId;
  const selected = mapStats(fx.selected_team_stats);
  const opposition = mapStats(fx.opposition_stats);
  const base = {
    matchSmId: Number(info.id),
    seasonName: String(info.season_name ?? ""),
    competitionId: info.competition_id != null ? Number(info.competition_id) : null,
    competitionName: info.competition_name ?? null,
    kickoffLabel: info.formatted_kickoff_datetime ?? null,
    homeTeamSmId: homeId,
    awayTeamSmId: awayId,
    homeGoals: info.home_team_goals ?? null,
    awayGoals: info.away_team_goals ?? null,
    source: "statz" as const,
  };
  return [
    {
      ...base,
      ...selected,
      teamSmId: selectedId,
      opponentSmId: opponentId,
      isHome: selectedIsHome,
      fromSelected: true,
    },
    {
      ...base,
      ...opposition,
      teamSmId: opponentId,
      opponentSmId: selectedId,
      isHome: !selectedIsHome,
      fromSelected: false,
    },
  ];
}

export function isPremierLeague2526(row: StatzTeamMatchRow): boolean {
  return row.seasonName === SEASON_2526 && row.competitionId === PL_COMPETITION_ID;
}

/** Prefer a team's own selected_team_stats when the same match appears on two club pages. */
export function mergeTeamRows(rows: StatzTeamMatchRow[]): StatzTeamMatchRow[] {
  const map = new Map<string, StatzTeamMatchRow>();
  for (const row of rows) {
    const key = `${row.matchSmId}:${row.teamSmId}`;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, row);
      continue;
    }
    if (row.fromSelected && !prev.fromSelected) {
      map.set(key, row);
    }
  }
  return [...map.values()];
}

export function collectRowsFromPages(pages: StatzTeamPage[]): {
  all: StatzTeamMatchRow[];
  pl2526: StatzTeamMatchRow[];
} {
  const raw: StatzTeamMatchRow[] = [];
  for (const page of pages) {
    for (const fx of page.fixtures) {
      // Rebuild current_team_id from the page when missing.
      if (fx.info && fx.info.current_team_id == null) {
        fx.info.current_team_id = page.teamId;
      }
      raw.push(...fixtureToTeamRows(fx));
    }
  }
  const all = mergeTeamRows(raw);
  return { all, pl2526: all.filter(isPremierLeague2526) };
}
