import fs from "node:fs";
import path from "node:path";
import {
  normalizeNationalTeamName,
  WORLD_CUP_2026_TEAMS,
} from "@/lib/data/world-cup-2026-teams";

export interface OptaNarrativeFeatures {
  setPieceGoal: boolean;
  setPieceGoalRateMentioned: number | null;
  redCardsHome: number;
  redCardsAway: number;
  yellowCardsHome: number;
  yellowCardsAway: number;
  comebackWin: boolean;
  dominantPossessionSide: "home" | "away" | null;
  possessionHomePct: number | null;
  possessionAwayPct: number | null;
}

export interface OptaParsedMatch {
  homeTeamName: string;
  awayTeamName: string;
  homeTeamApiId: number | null;
  awayTeamApiId: number | null;
  homeGoals: number;
  awayGoals: number;
  halfTimeHome: number | null;
  halfTimeAway: number | null;
  matchDate: string | null;
  venue: string | null;
  attendance: number | null;
  referee: string | null;
  homeFormation: string | null;
  awayFormation: string | null;
  homeXg: number | null;
  awayXg: number | null;
  homeShots: number | null;
  awayShots: number | null;
  homeShotsOnTarget: number | null;
  awayShotsOnTarget: number | null;
  articleText: string;
  optaFacts: string[];
  narrativeFeatures: OptaNarrativeFeatures;
  warnings: string[];
  sourcePath: string | null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

function resolveTeam(name: string): { apiId: number | null; canonicalName: string } {
  const key = normalizeNationalTeamName(name);
  const team = WORLD_CUP_2026_TEAMS.find(
    (t) => normalizeNationalTeamName(t.name) === key
  );
  return {
    apiId: team?.id ?? null,
    canonicalName: team?.name ?? name.trim(),
  };
}

function parseScorePair(text: string): { home: number; away: number } | null {
  const m = text.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (!m) return null;
  return { home: Number(m[1]), away: Number(m[2]) };
}

function extractMatchHeader(widgetHtml: string): {
  homeName: string | null;
  awayName: string | null;
  homeGoals: number | null;
  awayGoals: number | null;
  halfTimeHome: number | null;
  halfTimeAway: number | null;
  matchDate: string | null;
  homeFormation: string | null;
  awayFormation: string | null;
  venue: string | null;
  attendance: number | null;
  referee: string | null;
} {
  const homeNameMatch = widgetHtml.match(
    /class="Opta-Team[^"]*Opta-Home[^"]*Opta-TeamName[^"]*"[^>]*>\s*([^<]+?)\s*<\/td>/i
  );
  const awayNameMatch = widgetHtml.match(
    /class="Opta-Team[^"]*Opta-Away[^"]*Opta-TeamName[^"]*"[^>]*>\s*([^<]+?)\s*<\/td>/i
  );

  const homeScoreMatch = widgetHtml.match(
    /class="Opta-Score Opta-Home[^"]*"[^>]*><span class="Opta-Team-Score[^"]*">\s*(\d+)\s*<\/span>/i
  );
  const awayScoreMatch = widgetHtml.match(
    /class="Opta-Score Opta-Away[^"]*"[^>]*><span class="Opta-Team-Score[^"]*">\s*(\d+)\s*<\/span>/i
  );

  let halfTimeHome: number | null = null;
  let halfTimeAway: number | null = null;
  const htMatch = widgetHtml.match(/HT<\/abbr>\s*(\d+)\s*[-–]\s*(\d+)/i);
  if (htMatch) {
    halfTimeHome = Number(htMatch[1]);
    halfTimeAway = Number(htMatch[2]);
  }

  const formations = [...widgetHtml.matchAll(/<div class="Opta-TeamFormation">([^<]+)<\/div>/g)].map(
    (m) => m[1].trim()
  );

  const dateMatch = widgetHtml.match(/class="Opta-Date"[^>]*>([^<]+)</i);
  let matchDate: string | null = null;
  if (dateMatch) {
    const parsed = parseOptaDateString(dateMatch[1].trim());
    matchDate = parsed;
  }

  const venueMatch = widgetHtml.match(/<dt>Venue<\/dt><dd>([^<]+)</i);
  const attendanceMatch = widgetHtml.match(/<dt>Attendance<\/dt><dd>([\d,]+)</i);
  const refereeMatch = widgetHtml.match(/<dt>Referee<\/dt><dd>([^<]+)</i);

  return {
    homeName: homeNameMatch ? decodeHtmlEntities(homeNameMatch[1].trim()) : null,
    awayName: awayNameMatch ? decodeHtmlEntities(awayNameMatch[1].trim()) : null,
    homeGoals: homeScoreMatch ? Number(homeScoreMatch[1]) : null,
    awayGoals: awayScoreMatch ? Number(awayScoreMatch[1]) : null,
    halfTimeHome,
    halfTimeAway,
    matchDate,
    homeFormation: formations[0] ?? null,
    awayFormation: formations[1] ?? null,
    venue: venueMatch ? venueMatch[1].trim() : null,
    attendance: attendanceMatch
      ? Number(attendanceMatch[1].replace(/,/g, ""))
      : null,
    referee: refereeMatch ? refereeMatch[1].trim() : null,
  };
}

const MONTH_MAP: Record<string, string> = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
};

export function parseOptaDateString(raw: string): string | null {
  const m = raw.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/i);
  if (!m) return null;
  const month = MONTH_MAP[m[2].toLowerCase()];
  if (!month) return null;
  const day = m[1].padStart(2, "0");
  return `${m[3]}-${month}-${day}`;
}

function extractStatBarRow(
  widgetHtml: string,
  label: string
): { home: string | null; away: string | null } {
  const pattern = new RegExp(
    `<th[^>]*>${label}</th></tr><tr[^>]*><td class="Opta-Outer[^"]*">([^<]*)</td>[\\s\\S]*?<td class="Opta-Outer">([^<]*)</td>`,
    "i"
  );
  const m = widgetHtml.match(pattern);
  if (!m) return { home: null, away: null };
  return { home: m[1].trim(), away: m[2].trim() };
}

function parsePercent(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value.replace("%", "").trim());
  return Number.isFinite(n) ? n : null;
}

function parseIntStat(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function extractXgRow(widgetHtml: string): { home: number | null; away: number | null } {
  const m = widgetHtml.match(
    /<tr data-stat="expectedgoals"><td class="Opta-Home">([\d.]+)<\/td>[\s\S]*?<td class="Opta-Away">([\d.]+)<\/td>/i
  );
  if (!m) return { home: null, away: null };
  return { home: Number(m[1]), away: Number(m[2]) };
}

function countCards(widgetHtml: string, side: "Home" | "Away", type: "Red" | "Yellow"): number {
  const pattern = new RegExp(
    `class="Opta-Events Opta-${side}"[\\s\\S]*?</ul>`,
    "i"
  );
  const block = widgetHtml.match(pattern)?.[0] ?? widgetHtml;
  const icon = type === "Red" ? "Opta-IconRed" : "Opta-IconYellow";
  return (block.match(new RegExp(icon, "g")) ?? []).length;
}

function extractArticleBody(mainHtml: string): {
  articleText: string;
  optaFacts: string[];
} {
  const contentMatch = mainHtml.match(
    /class="post-content[^"]*"[^>]*>([\s\S]*?)(?:<\/div>\s*<div class="post-sidebar|<footer)/i
  );
  const content = contentMatch?.[1] ?? mainHtml;
  const paragraphs = [...content.matchAll(/<p>([\s\S]*?)<\/p>/gi)].map((m) =>
    stripHtml(m[1])
  );
  const facts = [...content.matchAll(/<li>([\s\S]*?)<\/li>/gi)]
    .map((m) => stripHtml(m[1]))
    .filter((t) => t.length > 20);

  const articleText = paragraphs.filter((p) => p.length > 30).join("\n\n");
  return { articleText, optaFacts: facts };
}

function extractNarrativeFromArticle(
  articleText: string,
  homeName: string,
  awayName: string,
  possessionHome: number | null,
  possessionAway: number | null,
  widgetHtml: string
): OptaNarrativeFeatures {
  const lower = articleText.toLowerCase();

  let setPieceGoalRateMentioned: number | null = null;
  const spRate = articleText.match(/scored\s+(\d+)\s+of\s+their\s+(\d+)\s+goals\s+from\s+set/i);
  if (spRate) {
    setPieceGoalRateMentioned = Number(spRate[1]) / Number(spRate[2]);
  }

  const setPieceGoal =
    /set-?piece|throw-?in|free-?kick|corner|penalty/i.test(articleText) &&
    /scored|goal|header|nod/i.test(articleText);

  const comebackWin =
    /came from behind|comeback|fought back|drew level/i.test(articleText) &&
    new RegExp(normalizeNationalTeamName(homeName), "i").test(articleText);

  let dominantPossessionSide: "home" | "away" | null = null;
  if (possessionHome != null && possessionAway != null) {
    if (possessionHome - possessionAway >= 8) dominantPossessionSide = "home";
    else if (possessionAway - possessionHome >= 8) dominantPossessionSide = "away";
  }

  const redCardsHome = countCards(widgetHtml, "Home", "Red");
  const redCardsAway = countCards(widgetHtml, "Away", "Red");
  const yellowCardsHome = countCards(widgetHtml, "Home", "Yellow");
  const yellowCardsAway = countCards(widgetHtml, "Away", "Yellow");

  const redMentions = (lower.match(/red card|sent off|dismissed/g) ?? []).length;

  return {
    setPieceGoal,
    setPieceGoalRateMentioned,
    redCardsHome: Math.max(redCardsHome, 0),
    redCardsAway: Math.max(redCardsAway, 0),
    yellowCardsHome,
    yellowCardsAway,
    comebackWin,
    dominantPossessionSide,
    possessionHomePct: possessionHome,
    possessionAwayPct: possessionAway,
    ...(redMentions > 0 && redCardsHome + redCardsAway === 0
      ? { redCardsHome: 0, redCardsAway: 0 }
      : {}),
  };
}

function extractTitleScore(mainHtml: string): {
  homeName: string | null;
  awayName: string | null;
  homeGoals: number | null;
  awayGoals: number | null;
} {
  const titleMatch =
    mainHtml.match(/<title>([^<]+)<\/title>/i) ??
    mainHtml.match(/property="og:title"\s+content="([^"]+)"/i);
  if (!titleMatch) return { homeName: null, awayName: null, homeGoals: null, awayGoals: null };

  const title = decodeHtmlEntities(titleMatch[1]);
  const scoreMatch = title.match(/^(.+?)\s+(\d+)\s*[-–]\s*(\d+)\s+(.+?)\s+Stats/i);
  if (!scoreMatch) return { homeName: null, awayName: null, homeGoals: null, awayGoals: null };

  return {
    homeName: scoreMatch[1].trim(),
    awayName: scoreMatch[4].trim(),
    homeGoals: Number(scoreMatch[2]),
    awayGoals: Number(scoreMatch[3]),
  };
}

function scoreWidgetHtml(content: string): number {
  return (
    (content.includes("Opta-Team-Score") ? 10 : 0) +
    (content.includes('data-stat="expectedgoals"') ? 5 : 0) +
    (content.includes("Opta-Date") ? 3 : 0) +
    content.length / 10_000
  );
}

function extractPublishedDateFromMain(mainHtml: string): string | null {
  const meta = mainHtml.match(
    /property="article:published_time"\s+content="(\d{4}-\d{2}-\d{2})/i
  );
  if (meta) return meta[1];
  const jsonLd = mainHtml.match(/"datePublished":"(\d{4}-\d{2}-\d{2})/i);
  if (jsonLd) return jsonLd[1];
  return null;
}

/** Resolve embedded Opta widget HTML next to a saved article page. */
export function resolveSiblingWidgetHtml(
  mainHtml: string,
  mainFilePath?: string | null
): string | null {
  if (!mainFilePath) return null;
  const iframeMatches = [
    ...mainHtml.matchAll(/iframe[^>]+src="([^"]*saved_resource[^"]*)"/gi),
  ];
  if (!iframeMatches.length) return null;

  const dir = path.dirname(mainFilePath);
  let best: { content: string; score: number } | null = null;

  for (const match of iframeMatches) {
    const rel = match[1].replace(/^\.\//, "");
    const widgetPath = path.join(dir, rel);
    if (!fs.existsSync(widgetPath)) continue;
    const content = fs.readFileSync(widgetPath, "utf8");
    const score = scoreWidgetHtml(content);
    if (!best || score > best.score) {
      best = { content, score };
    }
  }

  return best?.content ?? null;
}

export function parseOptaMatchHtml(
  mainHtml: string,
  options?: { widgetHtml?: string | null; sourcePath?: string | null }
): OptaParsedMatch {
  const warnings: string[] = [];
  const widgetHtml =
    options?.widgetHtml ??
    resolveSiblingWidgetHtml(mainHtml, options?.sourcePath ?? null) ??
    "";

  const combined = `${mainHtml}\n${widgetHtml}`;
  const { articleText, optaFacts } = extractArticleBody(mainHtml);
  const header = extractMatchHeader(widgetHtml || combined);
  const title = extractTitleScore(mainHtml);

  const homeRaw = header.homeName ?? title.homeName ?? "Home";
  const awayRaw = header.awayName ?? title.awayName ?? "Away";
  const homeResolved = resolveTeam(homeRaw);
  const awayResolved = resolveTeam(awayRaw);
  const homeTeamName = homeResolved.canonicalName;
  const awayTeamName = awayResolved.canonicalName;
  const homeGoals = header.homeGoals ?? title.homeGoals ?? 0;
  const awayGoals = header.awayGoals ?? title.awayGoals ?? 0;

  if (header.homeGoals == null && title.homeGoals != null) {
    warnings.push("Score taken from page title; widget header missing.");
  }
  if (!widgetHtml) {
    warnings.push("Opta match centre widget HTML not found; stats may be incomplete.");
  }

  const possession = extractStatBarRow(widgetHtml || combined, "Possession");
  const shots = extractStatBarRow(widgetHtml || combined, "Shots");
  const sot = extractStatBarRow(widgetHtml || combined, "Shots on target");
  const xg = extractXgRow(widgetHtml || combined);

  const possessionHome = parsePercent(possession.home);
  const possessionAway = parsePercent(possession.away);

  const narrativeFeatures = extractNarrativeFromArticle(
    articleText,
    homeTeamName,
    awayTeamName,
    possessionHome,
    possessionAway,
    widgetHtml
  );

  const homeTeamApiId = homeResolved.apiId;
  const awayTeamApiId = awayResolved.apiId;
  if (!homeTeamApiId) warnings.push(`Unresolved home team: ${homeRaw}`);
  if (!awayTeamApiId) warnings.push(`Unresolved away team: ${awayRaw}`);

  let articleXgHome: number | null = null;
  let articleXgAway: number | null = null;
  const narrativeXg = articleText.match(
    /([\d.]+)\s+expected goals?\s*\(xG\)\s+to\s+([^'']+?)['']s\s+([\d.]+)/i
  );
  if (narrativeXg) {
    const side1 = narrativeXg[2].trim();
    if (normalizeNationalTeamName(side1) === normalizeNationalTeamName(homeTeamName)) {
      articleXgHome = Number(narrativeXg[1]);
      articleXgAway = Number(narrativeXg[3]);
    } else {
      articleXgAway = Number(narrativeXg[1]);
      articleXgHome = Number(narrativeXg[3]);
    }
  }

  return {
    homeTeamName,
    awayTeamName,
    homeTeamApiId,
    awayTeamApiId,
    homeGoals,
    awayGoals,
    halfTimeHome: header.halfTimeHome,
    halfTimeAway: header.halfTimeAway,
    matchDate: header.matchDate ?? extractPublishedDateFromMain(mainHtml),
    venue: header.venue,
    attendance: header.attendance,
    referee: header.referee,
    homeFormation: header.homeFormation,
    awayFormation: header.awayFormation,
    homeXg: xg.home ?? articleXgHome,
    awayXg: xg.away ?? articleXgAway,
    homeShots: parseIntStat(shots.home),
    awayShots: parseIntStat(shots.away),
    homeShotsOnTarget: parseIntStat(sot.home),
    awayShotsOnTarget: parseIntStat(sot.away),
    articleText,
    optaFacts,
    narrativeFeatures,
    warnings,
    sourcePath: options?.sourcePath ?? null,
  };
}

export function parseOptaMatchFromFile(filePath: string): OptaParsedMatch {
  const abs = path.resolve(filePath);
  const mainHtml = fs.readFileSync(abs, "utf8");
  const widgetHtml = resolveSiblingWidgetHtml(mainHtml, abs);
  return parseOptaMatchHtml(mainHtml, { widgetHtml, sourcePath: abs });
}
