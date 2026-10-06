import type {
  OddsApiBookmaker,
  OddsApiEvent,
  OddsApiMarket,
  OddsApiOutcome,
  OddsBookSource,
  SelectedBookOdds,
} from "@/lib/odds-api/types";

/** Match O/U lines shown on Value Opportunities. */
const OU_LINES = [0.5, 1.5, 2.5, 3.5] as const;
/** Asian handicap lines shown on Value Opportunities (home perspective). */
const AH_LINES = [-1.5, -0.5, 0.5, 1.5] as const;
/** Team total lines shown on Value Opportunities. */
const TT_LINES = [0.5, 1.5, 2.5] as const;

function isPinnacle(key: string): boolean {
  return key === "pinnacle";
}

function isUnibet(key: string): boolean {
  return key === "unibet_nl" || key === "unibet" || key.startsWith("unibet_");
}

function bookSource(key: string): OddsBookSource | null {
  if (isPinnacle(key)) return "pinnacle";
  if (isUnibet(key)) return "unibet";
  return null;
}

function marketsByKeys(
  book: OddsApiBookmaker | undefined,
  keys: string[]
): OddsApiMarket[] {
  if (!book) return [];
  return book.markets.filter((m) => keys.includes(m.key));
}

function outcomePrice(
  markets: OddsApiMarket[],
  predicate: (o: OddsApiOutcome) => boolean
): number | null {
  for (const market of markets) {
    const hit = market.outcomes.find(predicate);
    if (hit && hit.price > 1) return hit.price;
  }
  return null;
}

function pointsClose(a: number | undefined, b: number): boolean {
  if (a == null || !Number.isFinite(a)) return false;
  return Math.abs(a - b) < 1e-6;
}

/**
 * Prefer Pinnacle unless Unibet offers a strictly higher decimal price
 * (longer odds = better for the bettor on that selection).
 */
export function preferBestPrice(
  pinnacle: number | null,
  unibet: number | null
): { price: number; source: OddsBookSource; unibetPreferred: boolean } | null {
  if (pinnacle == null && unibet == null) return null;
  if (pinnacle == null && unibet != null) {
    return { price: unibet, source: "unibet", unibetPreferred: true };
  }
  if (unibet == null && pinnacle != null) {
    return { price: pinnacle, source: "pinnacle", unibetPreferred: false };
  }
  if (unibet! > pinnacle!) {
    return { price: unibet!, source: "unibet", unibetPreferred: true };
  }
  return { price: pinnacle!, source: "pinnacle", unibetPreferred: false };
}

function splitBooks(event: OddsApiEvent): {
  pinnacle?: OddsApiBookmaker;
  unibet?: OddsApiBookmaker;
} {
  let pinnacle: OddsApiBookmaker | undefined;
  let unibet: OddsApiBookmaker | undefined;
  for (const b of event.bookmakers ?? []) {
    const src = bookSource(b.key);
    if (src === "pinnacle") pinnacle = b;
    if (src === "unibet") unibet = b;
  }
  return { pinnacle, unibet };
}

function pushSelected(
  rows: SelectedBookOdds[],
  rowId: string,
  pinnaclePrice: number | null,
  unibetPrice: number | null
) {
  const best = preferBestPrice(pinnaclePrice, unibetPrice);
  if (!best) return;
  rows.push({
    rowId,
    price: best.price,
    source: best.source,
    unibetPreferred: best.unibetPreferred,
    pinnaclePrice,
    unibetPrice,
  });
}

function teamLabelMatch(outcome: OddsApiOutcome, teamName: string): boolean {
  const desc = (outcome.description ?? "").trim();
  if (!desc) return false;
  return desc === teamName || desc.toLowerCase() === teamName.toLowerCase();
}

/**
 * Map an Odds API event (with bookmakers) onto Value Opportunities row ids.
 * Uses featured + alternate markets when present (O/U lines, AH, team totals, BTTS, 1X2).
 */
export function mapEventToValueRows(event: OddsApiEvent): SelectedBookOdds[] {
  const { pinnacle, unibet } = splitBooks(event);
  const rows: SelectedBookOdds[] = [];
  const home = event.home_team;
  const away = event.away_team;

  const pinH2h = marketsByKeys(pinnacle, ["h2h", "h2h_3_way"]);
  const uniH2h = marketsByKeys(unibet, ["h2h", "h2h_3_way"]);

  pushSelected(
    rows,
    "1x2-home",
    outcomePrice(pinH2h, (o) => o.name === home),
    outcomePrice(uniH2h, (o) => o.name === home)
  );
  pushSelected(
    rows,
    "1x2-draw",
    outcomePrice(pinH2h, (o) => o.name.toLowerCase() === "draw"),
    outcomePrice(uniH2h, (o) => o.name.toLowerCase() === "draw")
  );
  pushSelected(
    rows,
    "1x2-away",
    outcomePrice(pinH2h, (o) => o.name === away),
    outcomePrice(uniH2h, (o) => o.name === away)
  );

  const pinBtts = marketsByKeys(pinnacle, ["btts"]);
  const uniBtts = marketsByKeys(unibet, ["btts"]);
  pushSelected(
    rows,
    "btts-yes",
    outcomePrice(pinBtts, (o) => o.name.toLowerCase() === "yes"),
    outcomePrice(uniBtts, (o) => o.name.toLowerCase() === "yes")
  );
  pushSelected(
    rows,
    "btts-no",
    outcomePrice(pinBtts, (o) => o.name.toLowerCase() === "no"),
    outcomePrice(uniBtts, (o) => o.name.toLowerCase() === "no")
  );

  const pinTotals = marketsByKeys(pinnacle, ["totals", "alternate_totals"]);
  const uniTotals = marketsByKeys(unibet, ["totals", "alternate_totals"]);
  for (const line of OU_LINES) {
    pushSelected(
      rows,
      `ou-over-${line}`,
      outcomePrice(
        pinTotals,
        (o) => o.name.toLowerCase() === "over" && pointsClose(o.point, line)
      ),
      outcomePrice(
        uniTotals,
        (o) => o.name.toLowerCase() === "over" && pointsClose(o.point, line)
      )
    );
    pushSelected(
      rows,
      `ou-under-${line}`,
      outcomePrice(
        pinTotals,
        (o) => o.name.toLowerCase() === "under" && pointsClose(o.point, line)
      ),
      outcomePrice(
        uniTotals,
        (o) => o.name.toLowerCase() === "under" && pointsClose(o.point, line)
      )
    );
  }

  const pinSpreads = marketsByKeys(pinnacle, ["spreads", "alternate_spreads"]);
  const uniSpreads = marketsByKeys(unibet, ["spreads", "alternate_spreads"]);
  for (const line of AH_LINES) {
    pushSelected(
      rows,
      `ah-home-${line}`,
      outcomePrice(
        pinSpreads,
        (o) => o.name === home && pointsClose(o.point, line)
      ),
      outcomePrice(
        uniSpreads,
        (o) => o.name === home && pointsClose(o.point, line)
      )
    );
    pushSelected(
      rows,
      `ah-away-${line}`,
      outcomePrice(
        pinSpreads,
        (o) => o.name === away && pointsClose(o.point, -line)
      ),
      outcomePrice(
        uniSpreads,
        (o) => o.name === away && pointsClose(o.point, -line)
      )
    );
  }

  const pinTt = marketsByKeys(pinnacle, ["team_totals", "alternate_team_totals"]);
  const uniTt = marketsByKeys(unibet, ["team_totals", "alternate_team_totals"]);
  for (const line of TT_LINES) {
    pushSelected(
      rows,
      `tt-home-over-${line}`,
      outcomePrice(
        pinTt,
        (o) =>
          o.name.toLowerCase() === "over" &&
          pointsClose(o.point, line) &&
          teamLabelMatch(o, home)
      ),
      outcomePrice(
        uniTt,
        (o) =>
          o.name.toLowerCase() === "over" &&
          pointsClose(o.point, line) &&
          teamLabelMatch(o, home)
      )
    );
    pushSelected(
      rows,
      `tt-home-under-${line}`,
      outcomePrice(
        pinTt,
        (o) =>
          o.name.toLowerCase() === "under" &&
          pointsClose(o.point, line) &&
          teamLabelMatch(o, home)
      ),
      outcomePrice(
        uniTt,
        (o) =>
          o.name.toLowerCase() === "under" &&
          pointsClose(o.point, line) &&
          teamLabelMatch(o, home)
      )
    );
    pushSelected(
      rows,
      `tt-away-over-${line}`,
      outcomePrice(
        pinTt,
        (o) =>
          o.name.toLowerCase() === "over" &&
          pointsClose(o.point, line) &&
          teamLabelMatch(o, away)
      ),
      outcomePrice(
        uniTt,
        (o) =>
          o.name.toLowerCase() === "over" &&
          pointsClose(o.point, line) &&
          teamLabelMatch(o, away)
      )
    );
    pushSelected(
      rows,
      `tt-away-under-${line}`,
      outcomePrice(
        pinTt,
        (o) =>
          o.name.toLowerCase() === "under" &&
          pointsClose(o.point, line) &&
          teamLabelMatch(o, away)
      ),
      outcomePrice(
        uniTt,
        (o) =>
          o.name.toLowerCase() === "under" &&
          pointsClose(o.point, line) &&
          teamLabelMatch(o, away)
      )
    );
  }

  return rows;
}

export function rowsToBookMaps(rows: SelectedBookOdds[]): {
  bookByRowId: Record<string, string>;
  sourceByRowId: Record<string, OddsBookSource>;
} {
  const bookByRowId: Record<string, string> = {};
  const sourceByRowId: Record<string, OddsBookSource> = {};
  for (const row of rows) {
    bookByRowId[row.rowId] = row.price.toFixed(2);
    sourceByRowId[row.rowId] = row.source;
  }
  return { bookByRowId, sourceByRowId };
}
