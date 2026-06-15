import fs from "node:fs";
import {
  normalizeNationalTeamName,
  WORLD_CUP_2026_TEAMS,
} from "@/lib/data/world-cup-2026-teams";
import type { WcPlayerStatsFixtureFiles } from "@/lib/world-cup/wc-player-stats-dir";

export type PlayerSide = "home" | "away";

export interface ParsedOptaPlayerRow {
  optaPlayerId: string;
  playerName: string;
  side: PlayerSide | null;
  teamOptaId: string | null;
  isStarter: boolean;
  position: string | null;
  minutes: number | null;
  optaPoints: number | null;
  matchRank: number | null;
  stats: Record<string, number | string | boolean | null>;
}

export interface ParsedOptaFixture {
  homeTeamName: string;
  awayTeamName: string;
  homeTeamApiId: number | null;
  awayTeamApiId: number | null;
  homeGoals: number | null;
  awayGoals: number | null;
  matchDate: string | null;
  homeTeamOptaId: string | null;
  awayTeamOptaId: string | null;
  players: ParsedOptaPlayerRow[];
  warnings: string[];
  sourcePaths: Partial<Record<"matchSummary" | "optaSummary" | "matchDetails", string>>;
}

const FIXTURE_FILENAME_RE =
  /^(.+?)\s+vs\s+(.+?)\s+-\s+(\d{1,2}\s+\w{3}\s+\d{4})/i;

function decodeHtml(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseNum(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const cleaned = raw.replace(/,/g, "").trim();
  if (!cleaned || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function resolveTeam(name: string): { apiId: number | null; canonicalName: string } {
  const key = normalizeNationalTeamName(name);
  const team = WORLD_CUP_2026_TEAMS.find(
    (t) => normalizeNationalTeamName(t.name) === key
  );
  return { apiId: team?.id ?? null, canonicalName: team?.name ?? name.trim() };
}

function extractTeamOptaIds(html: string): { home: string | null; away: string | null } {
  const homeM = html.match(/Opta-Home[^>]*Opta-Team-([a-z0-9]+)/i);
  const awayM = html.match(/Opta-Away[^>]*Opta-Team-([a-z0-9]+)/i);
  return {
    home: homeM?.[1] ?? null,
    away: awayM?.[1] ?? null,
  };
}

function extractScore(html: string): { home: number | null; away: number | null } {
  const m = html.match(
    /Opta-Score Opta-Home[^>]*>[\s\S]*?Opta-Team-Score[^>]*>\s*(\d+)\s*<[\s\S]*?Opta-Score Opta-Away[^>]*>[\s\S]*?Opta-Team-Score[^>]*>\s*(\d+)\s*</i
  );
  if (m) return { home: Number(m[1]), away: Number(m[2]) };
  return { home: null, away: null };
}

function extractMatchDate(html: string): string | null {
  const m = html.match(/class="Opta-Date"[^>]*>([^<]+)</i);
  if (!m) return null;
  const parsed = new Date(m[1].trim());
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

const MATCH_SUMMARY_ABBR_MAP: Record<string, string> = {
  G: "goals",
  A: "assists",
  RC: "cards_red",
  YC: "cards_yellow",
  Crn: "corners_won",
  S: "shots",
  SOnT: "shots_on_target",
  BS: "shots_blocked",
  P: "passes",
  C: "crosses",
  Tk: "tackles",
  O: "offsides",
  FC: "fouls_conceded",
  FW: "fouls_won",
  SAV: "saves_total",
};

function statKeyFromClass(classAttr: string): string | null {
  const m = classAttr.match(/Opta-Stat-([a-zA-Z0-9_]+)/);
  if (!m) return null;
  const key = m[1];
  if (key === "Position" || key === "Player" || key === "Total") return null;
  return key;
}

function extractMatchSummaryColumnKeys(tableHtml: string): string[] {
  const headerRow =
    tableHtml.match(/<thead[^>]*>[\s\S]*?<tr[^>]*>([\s\S]*?)<\/tr>[\s\S]*?<\/thead>/i)?.[1] ??
    "";
  const keys: string[] = [];
  for (const th of headerRow.matchAll(/<th[^>]*class="[^"]*Opta-Stat[^"]*"[^>]*>([\s\S]*?)<\/th>/gi)) {
    const inner = th[1];
    const abbr = inner.match(/<abbr[^>]*>([^<]+)<\/abbr>/i)?.[1]?.trim();
    const title = inner.match(/title="([^"]+)"/i)?.[1]?.trim();
    if (abbr && MATCH_SUMMARY_ABBR_MAP[abbr]) {
      keys.push(MATCH_SUMMARY_ABBR_MAP[abbr]);
      continue;
    }
    if (title) {
      const fromTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, "_");
      keys.push(fromTitle);
      continue;
    }
    keys.push(`col_${keys.length}`);
  }
  return keys;
}

function prefixOptaSummaryStats(
  stats: Record<string, number | string | boolean | null>
): Record<string, number | string | boolean | null> {
  const prefixed: Record<string, number | string | boolean | null> = {};
  for (const [key, value] of Object.entries(stats)) {
    prefixed[`opta_pts_${key}`] = value;
  }
  return prefixed;
}

function parseStatRowsFromTable(
  tableHtml: string,
  defaults: Partial<ParsedOptaPlayerRow>,
  rowHtmlOuter?: string
): ParsedOptaPlayerRow[] {
  const players: ParsedOptaPlayerRow[] = [];
  const rowRe = /<tr[^>]*role="row"[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(tableHtml))) {
    const rowHtml = rowMatch[1];
    const fullRow = rowHtmlOuter ?? rowMatch[0];
    const playerM = rowHtml.match(
      /<th[^>]*class="[^"]*Opta-Player[^"]*Opta-Player-([a-z0-9]+)[^"]*"[^>]*>[\s\S]*?(?:playername">|<span class="playername">)([^<]+)/i
    );
    if (!playerM) continue;

    const optaPlayerId = playerM[1];
    const playerName = decodeHtml(playerM[2].trim());
    const isStarter =
      /starter-icon|Opta-starter|class="starter"|title>Starter</i.test(rowHtml) &&
      !/sub-icon|Opta-sub|title>Substitute</i.test(rowHtml);
    const isSub = /sub-icon|Opta-sub|title>Substitute</i.test(rowHtml);

    let side = defaults.side ?? null;
    const sideAttr = rowHtml.match(/data-playerside="(home|away)"/i);
    if (sideAttr) side = sideAttr[1].toLowerCase() as PlayerSide;
    else if (/class="[^"]*side-home/i.test(fullRow)) side = "home";
    else if (/class="[^"]*side-away/i.test(fullRow)) side = "away";

    let position: string | null = null;
    const posM = rowHtml.match(/title="(Goalkeeper|Defender|Midfielder|Forward)"/i);
    if (posM) {
      const map: Record<string, string> = {
        goalkeeper: "GK",
        defender: "DF",
        midfielder: "MF",
        forward: "FW",
      };
      position = map[posM[1].toLowerCase()] ?? posM[1].slice(0, 2).toUpperCase();
    }

    const stats: Record<string, number | string | boolean | null> = {};
    for (const cell of rowHtml.matchAll(
      /<td[^>]*class="([^"]*)"[^>]*>([^<]*)</gi
    )) {
      const key = statKeyFromClass(cell[1]);
      if (!key) continue;
      stats[key] = parseNum(cell[2]) ?? (cell[2].trim() || null);
    }

    const minutes =
      parseNum(String(stats.minutes_played ?? stats.minsPlayed ?? "")) ??
      defaults.minutes ??
      null;
    const optaPoints = parseNum(String(stats.points ?? ""));
    const matchRank = parseNum(String(stats.match_rank ?? ""));

    players.push({
      optaPlayerId,
      playerName,
      side,
      teamOptaId: defaults.teamOptaId ?? null,
      isStarter: isStarter || (!isSub && defaults.isStarter === true),
      position,
      minutes,
      optaPoints,
      matchRank,
      stats,
    });
  }

  return players;
}

function parseMatchDetailsPlayers(html: string): ParsedOptaPlayerRow[] {
  const block = html.match(/<playerstats-match[\s\S]*?<\/playerstats-match>/i)?.[0] ?? html;
  return parseStatRowsFromTable(block, {});
}

function parseOptaSummaryPlayers(html: string): ParsedOptaPlayerRow[] {
  const block =
    html.match(/<ul class="Opta-TabbedContent">[\s\S]*?<\/ul>/i)?.[0] ?? html;
  return parseStatRowsFromTable(block, {}).map((row) => ({
    ...row,
    stats: prefixOptaSummaryStats(row.stats),
  }));
}

function parseMatchSummaryTable(
  tableHtml: string,
  defaults: Partial<ParsedOptaPlayerRow>
): ParsedOptaPlayerRow[] {
  const columnKeys = extractMatchSummaryColumnKeys(tableHtml);
  const players: ParsedOptaPlayerRow[] = [];
  const rowRe = /<tr[^>]*role="row"[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRe.exec(tableHtml))) {
    const rowHtml = rowMatch[1];
    const playerM =
      rowHtml.match(
        /<th[^>]*class="[^"]*Opta-Player[^"]*Opta-Player-([a-z0-9]+)[^"]*"[^>]*>([^<]+)/i
      ) ??
      rowHtml.match(
        /<th[^>]*class="[^"]*Opta-Player[^"]*Opta-Player-([a-z0-9]+)[^"]*"[^>]*>[\s\S]*?playername">([^<]+)/i
      );
    if (!playerM) continue;

    const optaPlayerId = playerM[1];
    const playerName = decodeHtml(playerM[2].trim());
    const stats: Record<string, number | string | boolean | null> = {};
    const cells = [...rowHtml.matchAll(/<td[^>]*class="[^"]*Opta-Stat[^"]*"[^>]*>([^<]*)</gi)];
    for (let i = 0; i < cells.length && i < columnKeys.length; i++) {
      const key = columnKeys[i];
      if (!key || key.startsWith("col_")) continue;
      stats[key] = parseNum(cells[i][1]) ?? (cells[i][1].trim() || null);
    }

    players.push({
      optaPlayerId,
      playerName,
      side: defaults.side ?? null,
      teamOptaId: defaults.teamOptaId ?? null,
      isStarter: defaults.isStarter ?? false,
      position: defaults.position ?? null,
      minutes: defaults.minutes ?? null,
      optaPoints: null,
      matchRank: null,
      stats,
    });
  }

  return players;
}

function parseMatchSummaryPlayers(
  html: string,
  teamOptaIds: { home: string | null; away: string | null }
): ParsedOptaPlayerRow[] {
  const players: ParsedOptaPlayerRow[] = [];

  for (const block of html.matchAll(
    /<div class="Opta-Team Opta-Team-([a-z0-9]+)">([\s\S]*?)<table class="Opta-Striped">([\s\S]*?)<\/table>/gi
  )) {
    const teamOptaId = block[1];
    if (teamOptaId.toLowerCase() === "both") continue;
    const table = block[0];
    const side: PlayerSide =
      teamOptaId === teamOptaIds.home
        ? "home"
        : teamOptaId === teamOptaIds.away
          ? "away"
          : "home";
    players.push(...parseMatchSummaryTable(table, { side, teamOptaId }));
  }

  if (!players.length) {
    const allTable = html.match(/<table class="Opta-Striped">[\s\S]*?<\/table>/i)?.[0];
    if (allTable) players.push(...parseMatchSummaryTable(allTable, {}));
  }

  return players;
}

function mergePlayerRows(target: Map<string, ParsedOptaPlayerRow>, rows: ParsedOptaPlayerRow[]) {
  for (const row of rows) {
    const existing = target.get(row.optaPlayerId);
    if (!existing) {
      target.set(row.optaPlayerId, { ...row, stats: { ...row.stats } });
      continue;
    }
    existing.playerName = row.playerName || existing.playerName;
    existing.side = row.side ?? existing.side;
    existing.teamOptaId = row.teamOptaId ?? existing.teamOptaId;
    existing.isStarter = row.isStarter || existing.isStarter;
    existing.position = row.position ?? existing.position;
    existing.minutes = row.minutes ?? existing.minutes;
    existing.optaPoints = row.optaPoints ?? existing.optaPoints;
    existing.matchRank = row.matchRank ?? existing.matchRank;
    existing.stats = { ...existing.stats, ...row.stats };
  }
}

export function parseOptaPlayerStatsFixture(files: WcPlayerStatsFixtureFiles): ParsedOptaFixture {
  const warnings: string[] = [];
  const sourcePaths: ParsedOptaFixture["sourcePaths"] = {};
  const homeResolved = resolveTeam(files.homeName);
  const awayResolved = resolveTeam(files.awayName);

  let headerHtml = "";
  if (files.matchDetails && fs.existsSync(files.matchDetails)) {
    headerHtml = fs.readFileSync(files.matchDetails, "utf8");
    sourcePaths.matchDetails = files.matchDetails;
  } else if (files.matchSummary && fs.existsSync(files.matchSummary)) {
    headerHtml = fs.readFileSync(files.matchSummary, "utf8");
  } else if (files.optaSummary && fs.existsSync(files.optaSummary)) {
    headerHtml = fs.readFileSync(files.optaSummary, "utf8");
  }

  const teamOptaIds = extractTeamOptaIds(headerHtml);
  const score = extractScore(headerHtml);
  const matchDate = files.matchDate ?? extractMatchDate(headerHtml);

  const playerMap = new Map<string, ParsedOptaPlayerRow>();

  if (files.matchSummary && fs.existsSync(files.matchSummary)) {
    sourcePaths.matchSummary = files.matchSummary;
    mergePlayerRows(
      playerMap,
      parseMatchSummaryPlayers(fs.readFileSync(files.matchSummary, "utf8"), teamOptaIds)
    );
  } else warnings.push("missing match summary");

  if (files.optaSummary && fs.existsSync(files.optaSummary)) {
    sourcePaths.optaSummary = files.optaSummary;
    mergePlayerRows(
      playerMap,
      parseOptaSummaryPlayers(fs.readFileSync(files.optaSummary, "utf8"))
    );
  } else warnings.push("missing opta summary");

  if (files.matchDetails && fs.existsSync(files.matchDetails)) {
    mergePlayerRows(
      playerMap,
      parseMatchDetailsPlayers(fs.readFileSync(files.matchDetails, "utf8"))
    );
  } else warnings.push("missing match details");

  const players = [...playerMap.values()];
  if (!players.length) warnings.push("no players parsed");

  for (const p of players) {
    if (!p.side && p.teamOptaId) {
      if (p.teamOptaId === teamOptaIds.home) p.side = "home";
      else if (p.teamOptaId === teamOptaIds.away) p.side = "away";
    }
  }

  return {
    homeTeamName: homeResolved.canonicalName,
    awayTeamName: awayResolved.canonicalName,
    homeTeamApiId: homeResolved.apiId,
    awayTeamApiId: awayResolved.apiId,
    homeGoals: score.home,
    awayGoals: score.away,
    matchDate,
    homeTeamOptaId: teamOptaIds.home,
    awayTeamOptaId: teamOptaIds.away,
    players,
    warnings,
    sourcePaths,
  };
}
