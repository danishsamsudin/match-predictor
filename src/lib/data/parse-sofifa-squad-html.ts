import {
  isWorldCup2026TeamName,
  normalizeNationalTeamName,
  WORLD_CUP_2026_TEAMS,
} from "@/lib/data/world-cup-2026-teams";

export interface SofifaSquadPlayer {
  sofifaPlayerId: number;
  shortName: string;
  fullName: string;
  age: number | null;
  overall: number | null;
  potential: number | null;
  valueEur: number | null;
  wageEur: number | null;
  totalStats: number | null;
  positions: string[];
  squadRole: string | null;
  jerseyNumber: number | null;
  contractYears: string | null;
  nationality: string | null;
  isStarter: boolean;
  /** 0-based row index in the Squad table tbody. */
  squadOrder: number;
}

export interface SofifaTeamRatings {
  overall: number | null;
  attack: number | null;
  midfield: number | null;
  defence: number | null;
}

export interface SofifaTeamTactics {
  formation: string | null;
  buildUpStyle: string | null;
  defensiveApproach: string | null;
  defensiveLineHeight: number | null;
}

export interface SofifaSquadImport {
  sofifaTeamId: number | null;
  rosterId: string | null;
  teamName: string;
  coachName: string | null;
  ratings: SofifaTeamRatings;
  tactics: SofifaTeamTactics;
  setPieces: Record<string, string>;
  players: SofifaSquadPlayer[];
}

function parseEmTitle(html: string): number | null {
  const m = html.match(/<em[^>]*title="(\d+)"/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function parseMoneyEur(raw: string | null | undefined): number | null {
  if (!raw?.trim()) return null;
  const text = raw.replace(/€/g, "").trim().toLowerCase();
  const m = text.match(/([\d.,]+)\s*([mk])?/);
  if (!m) return null;
  const num = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(num)) return null;
  const suffix = m[2] ?? "";
  const mult = suffix === "m" ? 1_000_000 : suffix === "k" ? 1_000 : 1;
  return Math.round(num * mult * 100) / 100;
}

function teamNameFromFilename(filename: string): string {
  const base = filename.replace(/\.html$/i, "");
  const idx = base.indexOf(" - FC ");
  return (idx >= 0 ? base.slice(0, idx) : base).trim().normalize("NFKC");
}

function parseTeamRatings(html: string): SofifaTeamRatings {
  const block = html.match(
    /<div class="col"><em title="(\d+)">\d+<\/em><div class="sub">Overall<\/div><\/div>[\s\S]*?<div class="col"><em title="(\d+)">\d+<\/em><div class="sub">Attack<\/div><\/div>[\s\S]*?<div class="col"><em title="(\d+)">\d+<\/em><div class="sub">Midfield<\/div><\/div>[\s\S]*?<div class="col"><em title="(\d+)">\d+<\/em><div class="sub">Defence<\/div><\/div>/
  );
  if (!block) {
    return { overall: null, attack: null, midfield: null, defence: null };
  }
  return {
    overall: Number(block[1]),
    attack: Number(block[2]),
    midfield: Number(block[3]),
    defence: Number(block[4]),
  };
}

function parseFormation(html: string): string | null {
  const baskets = [...html.matchAll(/<div class="field-basket"[^>]*>[\s\S]*?<span class="pos pos\d+">([A-Z]{2,3})<\/span>/g)];
  if (!baskets.length) return null;
  return baskets.map((m) => m[1]).join("-");
}

function parseTactics(html: string): SofifaTeamTactics {
  const buildUp =
    html.match(/Build-up style<\/div>\s*<div class="col col-1-2">([^<]+)</)?.[1]?.trim() ??
    null;
  const defApproach =
    html.match(/Defensive approach<\/div>\s*<div class="col col-1-2">[\s\S]*?<em[^>]*>(\d+)<\/em>\s*([^<]+)</);
  const defensiveLineHeight = defApproach ? Number(defApproach[1]) : null;
  const defensiveApproach = defApproach
    ? `${defApproach[1]} ${defApproach[2].trim()}`.trim()
    : null;
  return {
    formation: parseFormation(html),
    buildUpStyle: buildUp,
    defensiveApproach,
    defensiveLineHeight: Number.isFinite(defensiveLineHeight ?? NaN)
      ? defensiveLineHeight
      : null,
  };
}

function parseSetPieces(html: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const m of html.matchAll(
    /<label>([^<]+)<\/label>\s*<a[^>]*data-tooltip="([^"]+)"/g
  )) {
    result[m[1].trim()] = m[2].trim();
  }
  return result;
}

function parsePlayerRow(rowHtml: string, trAttrs = ""): SofifaSquadPlayer | null {
  const playerLink = rowHtml.match(
    /<a href="https:\/\/sofifa\.com\/player\/(\d+)\/[^"]*"[^>]*data-tippy-top=""[^>]*data-tippy-content="([^"]+)"[^>]*>([^<]*)<\/a>/
  );
  if (!playerLink) return null;

  const sofifaPlayerId = Number(playerLink[1]);
  const fullName = playerLink[2].replace(/&#39;/g, "'").trim();
  const shortName = playerLink[3].trim();
  if (!Number.isFinite(sofifaPlayerId) || !fullName) return null;

  const age = Number(rowHtml.match(/data-col="ae">(\d+)</)?.[1] ?? NaN);
  const overall = parseEmTitle(rowHtml.match(/data-col="oa">([\s\S]*?)<\/td>/)?.[1] ?? "");
  const potential = parseEmTitle(rowHtml.match(/data-col="pt">([\s\S]*?)<\/td>/)?.[1] ?? "");
  const valueEur = parseMoneyEur(rowHtml.match(/data-col="vl">([^<]+)</)?.[1]);
  const wageEur = parseMoneyEur(rowHtml.match(/data-col="wg">([^<]+)</)?.[1]);
  const totalStatsRaw = rowHtml.match(/data-col="tt"><em>(\d+)<\/em>/);
  const totalStats = totalStatsRaw ? Number(totalStatsRaw[1]) : null;

  const nameCellHtml =
    rowHtml.match(
      /<td>\s*<a href="https:\/\/sofifa\.com\/player\/[\s\S]*?<\/div>\s*<\/td>/
    )?.[0] ?? "";
  const naturalPositions = [
    ...nameCellHtml.matchAll(/<span class="pos pos\d+">([A-Z]{2,3})<\/span>/g),
  ].map((m) => m[1]);

  const contractCellHtml =
    rowHtml.match(
      /data-col="pt">[\s\S]*?<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td class="d6" data-col="vl"/
    )?.[1] ?? "";
  const squadRole =
    contractCellHtml.match(/<span class="pos pos\d+">([A-Z]{2,3})<\/span>/)?.[1] ?? null;
  const squadMeta = contractCellHtml.match(
    /<span class="pos pos\d+">[A-Z]{2,3}<\/span>\s*\((\d+)\)<div class="sub">\s*([\d\s~]+)<\/div>/
  );
  const jerseyNumber = squadMeta ? Number(squadMeta[1]) : null;
  const contractYears = squadMeta?.[2]?.trim() ?? null;

  const nationality =
    rowHtml.match(/<img title="([^"]+)" alt=""[^>]*class="flag"[^>]*width="21"/)?.[1] ??
    null;

  const isBenchSub = squadRole === "SUB";
  const isStarter = squadRole != null && !isBenchSub;

  return {
    sofifaPlayerId,
    shortName,
    fullName,
    age: Number.isFinite(age) ? age : null,
    overall,
    potential,
    valueEur,
    wageEur,
    totalStats: Number.isFinite(totalStats ?? NaN) ? totalStats : null,
    positions: [...new Set(naturalPositions)],
    squadRole,
    jerseyNumber: Number.isFinite(jerseyNumber ?? NaN) ? jerseyNumber : null,
    contractYears,
    nationality,
    isStarter,
    squadOrder: 0,
  };
}

/** True when Team & Contract squad role is a tactical slot (not bench SUB). */
export function isSofifaSquadTableStarter(squadRole: string | null | undefined): boolean {
  return squadRole != null && squadRole !== "SUB";
}

/** First 11 non-SUB players in Squad table order (canonical Model XI rule). */
export function extractSofifaStartingXi(
  players: SofifaSquadPlayer[]
): SofifaSquadPlayer[] {
  const starters: SofifaSquadPlayer[] = [];
  for (const player of players) {
    if (!isSofifaSquadTableStarter(player.squadRole)) continue;
    starters.push(player);
    if (starters.length >= 11) break;
  }
  return starters;
}

function parseSquadTableTbody(html: string): string | null {
  const squadSection = html.match(/<h5>\s*Squad\s*<\/h5>[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/i);
  return squadSection?.[1] ?? html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? null;
}

export function parseSofifaSquadHtml(html: string, filename = ""): SofifaSquadImport {
  const teamName = teamNameFromFilename(filename);
  const sofifaTeamId = Number(html.match(/var TEAM_ID = (\d+)/)?.[1] ?? NaN);
  const rosterId = html.match(/\/(\d{6})\/["']/)?.[1] ?? null;
  const coachName =
    html.match(/<a href="https:\/\/sofifa\.com\/coach\/\d+\/([^/]+)\/">/)?.[1]
      ?.replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase()) ?? null;

  const tbody = parseSquadTableTbody(html);
  const players: SofifaSquadPlayer[] = [];
  if (tbody) {
    let squadOrder = 0;
    for (const row of tbody.matchAll(/<tr([^>]*)>([\s\S]*?)<\/tr>/g)) {
      const player = parsePlayerRow(row[2], row[1]);
      if (!player) continue;
      players.push({ ...player, squadOrder });
      squadOrder += 1;
    }
  }

  return {
    sofifaTeamId: Number.isFinite(sofifaTeamId) ? sofifaTeamId : null,
    rosterId,
    teamName,
    coachName,
    ratings: parseTeamRatings(html),
    tactics: parseTactics(html),
    setPieces: parseSetPieces(html),
    players,
  };
}

/** True when this SoFIFA export belongs to a FIFA World Cup 2026 nation in our app. */
export function isWc2026SofifaSquadFilename(filename: string): boolean {
  const name = teamNameFromFilename(filename);
  return isWorldCup2026TeamName(name);
}

export function resolveWc2026SofifaTeamLabel(filename: string): string | null {
  const name = teamNameFromFilename(filename);
  if (!isWorldCup2026TeamName(name)) return null;
  const key = normalizeNationalTeamName(name);
  return WORLD_CUP_2026_TEAMS.find((team) => normalizeNationalTeamName(team.name) === key)?.name ?? null;
}

export const WC_2026_TEAM_ID_BY_LABEL = Object.fromEntries(
  WORLD_CUP_2026_TEAMS.map((team) => [team.name, team.id])
) as Record<string, number>;
