/**
 * Client-side bookmaker HTML/MHTML → Value Opportunities row prices.
 * Never sends the file to a server; parse in-memory only.
 */

export type ParsedHtmlOdds = {
  rowId: string;
  price: number;
  label: string;
};

export type ParseUnibetHtmlResult = {
  homeHint: string | null;
  awayHint: string | null;
  /** Detected bookmaker / company name (e.g. Unibet, Bet365). */
  bookmakerName: string | null;
  odds: ParsedHtmlOdds[];
  warnings: string[];
};

export type ParseUnibetHtmlOptions = {
  /** Expected home team (helps Toto team-name outcomes). */
  homeLabel?: string;
  /** Expected away team. */
  awayLabel?: string;
};

const DECIMAL_RE = /\b(\d{1,3}(?:[.,]\d{1,3})?)\b/;

const BOOKMAKER_PATTERNS: { re: RegExp; name: string }[] = [
  { re: /\bunibet\b/i, name: "Unibet" },
  { re: /\bpinnacle\b/i, name: "Pinnacle" },
  { re: /\bbet365\b/i, name: "Bet365" },
  { re: /\bbwin\b/i, name: "Bwin" },
  { re: /\bbetfair\b/i, name: "Betfair" },
  { re: /\bwilliam\s*hill\b/i, name: "William Hill" },
  { re: /\bladbrokes\b/i, name: "Ladbrokes" },
  { re: /\bcoral\b/i, name: "Coral" },
  { re: /\bdraftkings\b/i, name: "DraftKings" },
  { re: /\bfanduel\b/i, name: "FanDuel" },
  { re: /\bbetway\b/i, name: "Betway" },
  { re: /\btoto\.?nl\b/i, name: "TOTO" },
  { re: /\btoto\b/i, name: "TOTO" },
  { re: /\b888sport\b/i, name: "888sport" },
  { re: /\bsportsbet\b/i, name: "Sportsbet" },
];

const TOTO_LABEL_VALUE_RE =
  /_label_1lstj_\d+[^>]*>\s*(?:<!---->)?\s*([^<]+?)\s*<\/span>[\s\S]{0,500}?_value_1lstj_\d+[\s\S]{0,240}?>\s*(?:<!---->)?\s*(\d+[.,]\d{1,3})\s*</gi;

const OU_LINES = new Set(["0.5", "1.5", "2.5", "3.5", "4.5"]);

function toDecimal(raw: string): number | null {
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) && n > 1 && n < 1000 ? n : null;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function pushOdds(
  out: ParsedHtmlOdds[],
  seen: Set<string>,
  rowId: string,
  price: number,
  label: string
) {
  if (seen.has(rowId)) return;
  seen.add(rowId);
  out.push({ rowId, price, label });
}

/** Pull the primary HTML part out of an MHTML / MIME archive. */
export function extractHtmlFromMhtml(raw: string): string {
  if (!/Content-Type:\s*multipart\/related/i.test(raw) && !/------MultipartBoundary/i.test(raw)) {
    return raw;
  }

  const parts = raw.split(/\r?\n(?=------)/);
  let best: string | null = null;
  for (const part of parts) {
    if (!/Content-Type:\s*text\/html/i.test(part)) continue;
    const blank = part.search(/\r?\n\r?\n/);
    if (blank < 0) continue;
    let body = part.slice(blank).replace(/^\r?\n\r?\n/, "");
    if (/Content-Transfer-Encoding:\s*quoted-printable/i.test(part)) {
      body = body.replace(/=\r?\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, (_, h) =>
        String.fromCharCode(parseInt(h, 16))
      );
    }
    if (/Content-Transfer-Encoding:\s*base64/i.test(part)) {
      try {
        body = atob(body.replace(/\s+/g, ""));
      } catch {
        /* keep quoted body */
      }
    }
    if (!best || body.length > best.length) best = body;
  }
  return best ?? raw;
}

function stripWeddenPrefix(title: string): string {
  return title.replace(/^wedden\s+op\s+/i, "").trim();
}

function extractTeamHintsFromTitle(title: string): {
  homeHint: string | null;
  awayHint: string | null;
} {
  const cleaned = stripWeddenPrefix(title.split("|")[0] ?? title);
  const vs = cleaned.split(/\s+(?:vs\.?|v\.?|[-–—])\s+/i);
  if (vs.length >= 2) {
    return {
      homeHint: vs[0].trim() || null,
      awayHint: vs[1].replace(/\s*_.*$/, "").trim() || null,
    };
  }
  return { homeHint: null, awayHint: null };
}

function extractTeamHints(doc: Document): {
  homeHint: string | null;
  awayHint: string | null;
} {
  const title =
    doc.querySelector("title")?.textContent?.trim() ??
    doc.querySelector("h1")?.textContent?.trim() ??
    "";
  return extractTeamHintsFromTitle(title);
}

function extractBookmakerName(doc: Document, raw: string): string | null {
  const title = doc.querySelector("title")?.textContent ?? "";
  const og =
    doc.querySelector('meta[property="og:site_name"]')?.getAttribute("content") ??
    "";
  const app =
    doc.querySelector('meta[name="application-name"]')?.getAttribute("content") ??
    "";
  const hostname =
    doc.querySelector('link[rel="canonical"]')?.getAttribute("href") ??
    doc.querySelector("base")?.getAttribute("href") ??
    "";
  const hay = `${title}\n${og}\n${app}\n${hostname}\n${raw.slice(0, 8000)}`;
  for (const p of BOOKMAKER_PATTERNS) {
    if (p.re.test(hay)) return p.name;
  }
  if (og.trim()) return og.trim();
  if (app.trim()) return app.trim();
  try {
    const host = new URL(hostname).hostname.replace(/^www\./, "");
    if (host && !host.includes(" ")) {
      const brand = host.split(".")[0];
      if (brand.length >= 3) {
        return brand.charAt(0).toUpperCase() + brand.slice(1);
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

function scanTextBlocks(doc: Document): string[] {
  const blocks: string[] = [];
  const nodes = doc.querySelectorAll(
    "[data-testid], [class*='market'], [class*='outcome'], [class*='odd'], button, li, tr, div"
  );
  for (const el of nodes) {
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text.length >= 4 && text.length <= 160) blocks.push(text);
  }
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const b of blocks) {
    if (seen.has(b)) continue;
    seen.add(b);
    unique.push(b);
  }
  return unique;
}

export type TotoLabelPrice = { label: string; price: number };

export type TotoMarketSection = {
  name: string;
  pairs: TotoLabelPrice[];
};

/** Toto renders outcome name and decimal in sibling label/value spans. */
export function extractTotoLabelPrices(html: string): TotoLabelPrice[] {
  const out: TotoLabelPrice[] = [];
  const re = new RegExp(TOTO_LABEL_VALUE_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const label = m[1].replace(/\s+/g, " ").trim();
    const price = toDecimal(m[2]);
    if (!label || price == null) continue;
    out.push({ label, price });
  }
  return out;
}

/** Split Toto page into accordion sections with their label/price pairs. */
export function extractTotoSections(html: string): TotoMarketSection[] {
  const nameRe =
    /_name_1blp5_\d+[^>]*>\s*(?:<!---->)?\s*([^<]+?)\s*<\/span>/gi;
  const names: { name: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = nameRe.exec(html))) {
    names.push({ name: m[1].replace(/\s+/g, " ").trim(), index: m.index });
  }
  if (!names.length) {
    const pairs = extractTotoLabelPrices(html);
    return pairs.length ? [{ name: "", pairs }] : [];
  }
  const sections: TotoMarketSection[] = [];
  for (let i = 0; i < names.length; i++) {
    const start = names[i].index;
    const end = i + 1 < names.length ? names[i + 1].index : html.length;
    sections.push({
      name: names[i].name,
      pairs: extractTotoLabelPrices(html.slice(start, end)),
    });
  }
  return sections;
}

function teamTokenMatch(label: string, team: string | null | undefined): boolean {
  if (!team) return false;
  const a = norm(label);
  const b = norm(team);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const a0 = a.split(" ")[0];
  const b0 = b.split(" ")[0];
  return a0.length >= 4 && a0 === b0;
}

function isDrawLabel(label: string): boolean {
  const n = norm(label);
  return n === "x" || n === "draw" || n === "gelijkspel" || n === "gelijk";
}

function parseSignedLine(label: string): number | null {
  const m = label.trim().match(/^([+-]?\d+(?:[.,]\d+)?)$/);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function parseOuLabel(
  label: string
): { side: "over" | "under"; line: string } | null {
  const ou = label.trim().match(/^(over|under|meer|minder)\s+(\d+[.,]\d+)$/i);
  if (!ou) return null;
  const side =
    ou[1].toLowerCase() === "under" || ou[1].toLowerCase() === "minder"
      ? "under"
      : "over";
  return { side, line: ou[2].replace(",", ".") };
}

/**
 * Toto accordion markets that matter for Value Opportunities.
 * Collapsed sections save the header only - no `_value_*` price spans.
 */
const TOTO_VO_MARKET_ALIASES: { match: RegExp; label: string }[] = [
  { match: /^handicap\s*3-?way$/i, label: "European handicap" },
  { match: /^asian handicap$/i, label: "Asian handicap" },
  { match: /^aantal schoten$/i, label: "Shots O/U" },
  { match: /^aantal schoten op doel$/i, label: "Shots on target" },
];

/**
 * Find Toto market headers with no odds underneath (collapsed when saved).
 * A market counts as filled if any same-named section has prices.
 */
export function detectCollapsedTotoMarkets(html: string): string[] {
  const sections = extractTotoSections(html);
  if (!sections.length) return [];

  const byAlias = new Map<string, boolean>();
  for (const alias of TOTO_VO_MARKET_ALIASES) {
    byAlias.set(alias.label, false);
  }
  for (const section of sections) {
    for (const alias of TOTO_VO_MARKET_ALIASES) {
      if (!alias.match.test(section.name)) continue;
      if (section.pairs.length > 0) byAlias.set(alias.label, true);
    }
  }
  const collapsed: string[] = [];
  for (const [label, hasPrices] of byAlias) {
    const mentioned = sections.some((s) =>
      TOTO_VO_MARKET_ALIASES.some(
        (a) => a.label === label && a.match.test(s.name)
      )
    );
    if (mentioned && !hasPrices) collapsed.push(label);
  }
  return collapsed;
}

function mapResultSection(
  pairs: TotoLabelPrice[],
  home: string | null,
  away: string | null,
  odds: ParsedHtmlOdds[],
  seen: Set<string>
) {
  for (const { label, price } of pairs) {
    if (label.includes(" of ") || /beide|scoort/i.test(label)) continue;
    if (isDrawLabel(label)) {
      pushOdds(odds, seen, "1x2-draw", price, label);
      continue;
    }
    if (teamTokenMatch(label, home)) {
      pushOdds(odds, seen, "1x2-home", price, label);
      continue;
    }
    if (teamTokenMatch(label, away)) {
      pushOdds(odds, seen, "1x2-away", price, label);
    }
  }
}

function mapDoubleChanceSection(
  pairs: TotoLabelPrice[],
  home: string | null,
  away: string | null,
  odds: ParsedHtmlOdds[],
  seen: Set<string>
) {
  for (const { label, price } of pairs) {
    const ofParts = label.split(/\s+of\s+/i).map((s) => s.trim());
    if (ofParts.length !== 2) continue;
    const [left, right] = ofParts;
    const leftHome = teamTokenMatch(left, home);
    const leftAway = teamTokenMatch(left, away);
    const leftDraw = isDrawLabel(left);
    const rightHome = teamTokenMatch(right, home);
    const rightAway = teamTokenMatch(right, away);
    const rightDraw = isDrawLabel(right);
    if ((leftHome && rightDraw) || (leftDraw && rightHome)) {
      pushOdds(odds, seen, "dc-1x", price, label);
    } else if ((leftHome && rightAway) || (leftAway && rightHome)) {
      pushOdds(odds, seen, "dc-12", price, label);
    } else if ((leftDraw && rightAway) || (leftAway && rightDraw)) {
      pushOdds(odds, seen, "dc-x2", price, label);
    }
  }
}

function mapBttsSection(
  pairs: TotoLabelPrice[],
  odds: ParsedHtmlOdds[],
  seen: Set<string>
) {
  for (const { label, price } of pairs) {
    const n = norm(label);
    if (n === "ja" || n === "yes") pushOdds(odds, seen, "btts-yes", price, label);
    else if (n === "nee" || n === "no") pushOdds(odds, seen, "btts-no", price, label);
  }
}

function mapGoalsOuSection(
  pairs: TotoLabelPrice[],
  odds: ParsedHtmlOdds[],
  seen: Set<string>,
  idPrefix: "ou" | "tt-home" | "tt-away"
) {
  for (const { label, price } of pairs) {
    const ou = parseOuLabel(label);
    if (!ou) continue;
    if (idPrefix === "ou") {
      if (!OU_LINES.has(ou.line)) continue;
      pushOdds(odds, seen, `ou-${ou.side}-${ou.line}`, price, label);
    } else {
      // Team totals board uses 0.5 / 1.5 / 2.5; still accept whatever Toto shows.
      pushOdds(
        odds,
        seen,
        `${idPrefix}-${ou.side}-${ou.line}`,
        price,
        label
      );
    }
  }
}

/**
 * Handicap 3-Way: columns Home / Draw / Away. Each line is a triple of
 * signed tags (homeLine, homeLine, -homeLine). Toto may omit short-priced lines.
 */
function mapEuropeanHandicapSection(
  pairs: TotoLabelPrice[],
  odds: ParsedHtmlOdds[],
  seen: Set<string>
) {
  const signed = pairs
    .map((p) => ({ ...p, line: parseSignedLine(p.label) }))
    .filter((p): p is TotoLabelPrice & { line: number } => p.line != null);

  for (let i = 0; i + 2 < signed.length; i += 3) {
    const homeP = signed[i];
    const drawP = signed[i + 1];
    const awayP = signed[i + 2];
    // Home + draw share the market line; away is the mirror.
    if (homeP.line !== drawP.line) continue;
    if (Math.abs(awayP.line + homeP.line) > 1e-9) continue;
    const homeLine = homeP.line;
    // VO EH rows use integer lines (-3..-1, 1..3).
    if (!Number.isInteger(homeLine) || homeLine === 0) continue;
    const tag = String(homeLine);
    pushOdds(odds, seen, `eh-${tag}-h`, homeP.price, homeP.label);
    pushOdds(odds, seen, `eh-${tag}-d`, drawP.price, drawP.label);
    pushOdds(odds, seen, `eh-${tag}-a`, awayP.price, awayP.label);
  }
}

/**
 * Asian Handicap: two columns Home / Away. Pairs are (homeLine, -homeLine).
 * Offered lines vary by match; only map what Toto actually shows.
 */
function mapAsianHandicapSection(
  pairs: TotoLabelPrice[],
  odds: ParsedHtmlOdds[],
  seen: Set<string>
) {
  const signed = pairs
    .map((p) => ({ ...p, line: parseSignedLine(p.label) }))
    .filter((p): p is TotoLabelPrice & { line: number } => p.line != null);

  for (let i = 0; i + 1 < signed.length; i += 2) {
    const homeP = signed[i];
    const awayP = signed[i + 1];
    if (Math.abs(awayP.line + homeP.line) > 1e-9) continue;
    const homeLine = homeP.line;
    const tag = String(homeLine);
    pushOdds(odds, seen, `ah-home-${tag}`, homeP.price, homeP.label);
    pushOdds(odds, seen, `ah-away-${tag}`, awayP.price, awayP.label);
  }
}

function mapShotsOuSection(
  pairs: TotoLabelPrice[],
  odds: ParsedHtmlOdds[],
  seen: Set<string>
) {
  for (const { label, price } of pairs) {
    const ou = parseOuLabel(label);
    if (!ou) continue;
    pushOdds(odds, seen, `shots-${ou.side}-${ou.line}`, price, label);
  }
}

function mapSotOverSection(
  pairs: TotoLabelPrice[],
  odds: ParsedHtmlOdds[],
  seen: Set<string>
) {
  for (const { label, price } of pairs) {
    const ou = parseOuLabel(label);
    if (!ou || ou.side !== "over") continue;
    pushOdds(odds, seen, `sot-over-${ou.line}`, price, label);
  }
}

function mapGoalRangeSection(
  pairs: TotoLabelPrice[],
  scope: "match" | "home" | "away",
  odds: ParsedHtmlOdds[],
  seen: Set<string>
) {
  for (const { label, price } of pairs) {
    const cleaned = label.trim();
    if (!/^(?:\d+-\d+|\d+\+|0|\d+)$/.test(cleaned)) continue;
    pushOdds(odds, seen, `range-${scope}-${cleaned}`, price, label);
  }
}

function sectionIsExact(name: string, expected: string): boolean {
  return norm(name) === norm(expected);
}

function sectionIsTeamGoalsOu(
  name: string,
  team: string | null
): boolean {
  if (!team) return false;
  const n = norm(name);
  const t = norm(team);
  return (
    n === `${t} aantal goals over under` ||
    n.startsWith(`${t} aantal goals`)
  );
}

/**
 * Map Toto accordion sections onto VO row ids.
 * Layout is stable across matches; offered AH/EH/shots lines vary.
 */
export function mapTotoSectionsToOdds(
  sections: TotoMarketSection[],
  home: string | null,
  away: string | null
): ParsedHtmlOdds[] {
  const odds: ParsedHtmlOdds[] = [];
  const seen = new Set<string>();

  for (const section of sections) {
    if (!section.pairs.length) continue;
    const name = section.name;

    if (/^resultaat\s*-\s*vroege uitbetaling$/i.test(name)) {
      mapResultSection(section.pairs, home, away, odds, seen);
      continue;
    }
    if (sectionIsExact(name, "Dubbele Kans")) {
      mapDoubleChanceSection(section.pairs, home, away, odds, seen);
      continue;
    }
    if (sectionIsExact(name, "Beide Teams Scoren")) {
      mapBttsSection(section.pairs, odds, seen);
      continue;
    }
    if (sectionIsExact(name, "Aantal Goals - Over/Under")) {
      mapGoalsOuSection(section.pairs, odds, seen, "ou");
      continue;
    }
    if (sectionIsExact(name, "Handicap 3-Way")) {
      mapEuropeanHandicapSection(section.pairs, odds, seen);
      continue;
    }
    if (sectionIsExact(name, "Asian Handicap")) {
      mapAsianHandicapSection(section.pairs, odds, seen);
      continue;
    }
    if (sectionIsExact(name, "Aantal Schoten")) {
      mapShotsOuSection(section.pairs, odds, seen);
      continue;
    }
    if (sectionIsExact(name, "Aantal schoten op doel")) {
      mapSotOverSection(section.pairs, odds, seen);
      continue;
    }
    if (/^total goals range/i.test(name)) {
      mapGoalRangeSection(section.pairs, "match", odds, seen);
      continue;
    }
    if (home && new RegExp(`^${escapeRegExp(home)}\\s+Multi Goals$`, "i").test(name)) {
      mapGoalRangeSection(section.pairs, "home", odds, seen);
      continue;
    }
    if (away && new RegExp(`^${escapeRegExp(away)}\\s+Multi Goals$`, "i").test(name)) {
      mapGoalRangeSection(section.pairs, "away", odds, seen);
      continue;
    }
    if (sectionIsTeamGoalsOu(name, home)) {
      mapGoalsOuSection(section.pairs, odds, seen, "tt-home");
      continue;
    }
    if (sectionIsTeamGoalsOu(name, away)) {
      mapGoalsOuSection(section.pairs, odds, seen, "tt-away");
    }
  }

  return odds;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Flat-pair fallback (1X2 / DC / BTTS / match O/U) when section headers are absent.
 */
export function mapTotoPairsToOdds(
  pairs: TotoLabelPrice[],
  home: string | null,
  away: string | null
): ParsedHtmlOdds[] {
  const odds: ParsedHtmlOdds[] = [];
  const seen = new Set<string>();
  mapResultSection(pairs, home, away, odds, seen);
  mapDoubleChanceSection(pairs, home, away, odds, seen);
  mapBttsSection(pairs, odds, seen);
  mapGoalsOuSection(pairs, odds, seen, "ou");
  return odds;
}

function parseGenericBlocks(
  blocks: string[],
  odds: ParsedHtmlOdds[],
  seen: Set<string>
) {
  for (const block of blocks) {
    const n = norm(block);
    const priceMatch = block.match(DECIMAL_RE);
    if (!priceMatch) continue;
    const price = toDecimal(priceMatch[1]);
    if (price == null) continue;

    if (
      (/\b1\b/.test(n) || n.includes("home") || n.includes("thuis")) &&
      !n.includes("1x") &&
      !n.includes("12") &&
      price < 50
    ) {
      if (n === "1" || n.startsWith("1 ") || n.includes("home win") || n.includes("thuis")) {
        pushOdds(odds, seen, "1x2-home", price, block);
        continue;
      }
    }
    if (n === "x" || n === "draw" || n.includes("gelijk")) {
      pushOdds(odds, seen, "1x2-draw", price, block);
      continue;
    }
    if (
      (n === "2" || n.startsWith("2 ") || n.includes("away") || n.includes("uit")) &&
      !n.includes("x2") &&
      !n.includes("12")
    ) {
      pushOdds(odds, seen, "1x2-away", price, block);
      continue;
    }

    if (n.includes("btts") || n.includes("both teams") || n.includes("beide teams")) {
      if (n.includes("yes") || n.includes("ja")) {
        pushOdds(odds, seen, "btts-yes", price, block);
        continue;
      }
      if (n.includes("no") || n.includes("nee")) {
        pushOdds(odds, seen, "btts-no", price, block);
        continue;
      }
    }

    const ou = n.match(/\b(over|under|meer|minder)\s*(\d+[.,]?\d*)\b/);
    if (ou) {
      const side = ou[1] === "under" || ou[1] === "minder" ? "under" : "over";
      const line = ou[2].replace(",", ".");
      if (["0.5", "1.5", "2.5", "3.5"].includes(line)) {
        pushOdds(odds, seen, `ou-${side}-${line}`, price, block);
        continue;
      }
    }

    if (/\b1x\b/.test(n) || n.includes("home or draw")) {
      pushOdds(odds, seen, "dc-1x", price, block);
      continue;
    }
    if (/\b12\b/.test(n) || n.includes("home or away")) {
      pushOdds(odds, seen, "dc-12", price, block);
      continue;
    }
    if (/\bx2\b/.test(n) || n.includes("draw or away")) {
      pushOdds(odds, seen, "dc-x2", price, block);
      continue;
    }
  }
}

/**
 * Best-effort parse of a saved bookmaker event HTML/MHTML page.
 * High-confidence patterns only - prefer misses over wrong fills.
 */
export function parseUnibetHtmlToValueRows(
  rawInput: string,
  opts?: ParseUnibetHtmlOptions
): ParseUnibetHtmlResult {
  const warnings: string[] = [];
  if (!rawInput || rawInput.length < 40) {
    return {
      homeHint: null,
      awayHint: null,
      bookmakerName: null,
      odds: [],
      warnings: ["File looks empty."],
    };
  }
  if (rawInput.length > 8_000_000) {
    return {
      homeHint: null,
      awayHint: null,
      bookmakerName: null,
      odds: [],
      warnings: ["File is too large (max 8 MB)."],
    };
  }

  const html = extractHtmlFromMhtml(rawInput);

  let homeHint: string | null = null;
  let awayHint: string | null = null;
  let bookmakerName: string | null = null;
  let blocks: string[] = [];

  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(html, "text/html");
    ({ homeHint, awayHint } = extractTeamHints(doc));
    bookmakerName = extractBookmakerName(doc, rawInput);
    blocks = scanTextBlocks(doc);
  } else {
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    if (titleMatch) {
      ({ homeHint, awayHint } = extractTeamHintsFromTitle(titleMatch[1]));
    }
    for (const p of BOOKMAKER_PATTERNS) {
      if (p.re.test(rawInput.slice(0, 12000)) || p.re.test(html.slice(0, 12000))) {
        bookmakerName = p.name;
        break;
      }
    }
  }

  const home = homeHint || opts?.homeLabel || null;
  const away = awayHint || opts?.awayLabel || null;

  const totoSections = extractTotoSections(html);
  const totoPairCount = totoSections.reduce((n, s) => n + s.pairs.length, 0);
  const odds: ParsedHtmlOdds[] = [];
  const seen = new Set<string>();

  if (totoPairCount > 0) {
    if (!bookmakerName) bookmakerName = "TOTO";
    const named = totoSections.some((s) => s.name.length > 0);
    const mapped = named
      ? mapTotoSectionsToOdds(totoSections, home, away)
      : mapTotoPairsToOdds(
          totoSections.flatMap((s) => s.pairs),
          home,
          away
        );
    for (const row of mapped) {
      pushOdds(odds, seen, row.rowId, row.price, row.label);
    }
    const collapsed = detectCollapsedTotoMarkets(html);
    if (collapsed.length) {
      warnings.push(
        `Collapsed on Toto when saved (no prices in file): ${collapsed.join(", ")}. Expand those markets on toto.nl, save again, then re-upload.`
      );
    }
  }

  // Fill any remaining gaps from generic text blocks (Unibet-style, etc.)
  if (blocks.length) {
    parseGenericBlocks(blocks, odds, seen);
  }

  if (!odds.length) {
    warnings.push(
      "No recognizable markets found. Try a full event page save (.html or .mhtml)."
    );
  } else if (odds.length < 3) {
    warnings.push(
      "Only a few markets matched. Bookmaker markup changes often - review filled prices."
    );
  }

  return { homeHint, awayHint, bookmakerName, odds, warnings };
}

export function teamsLikelyMatch(
  hint: string | null,
  expected: string
): boolean {
  if (!hint || !expected) return true;
  const a = norm(hint);
  const b = norm(expected);
  if (!a || !b) return true;
  return a.includes(b) || b.includes(a) || a.split(" ")[0] === b.split(" ")[0];
}
