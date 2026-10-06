import type {
  OddsApiBookmaker,
  OddsApiEvent,
  OddsApiMarket,
  OddsBookSource,
  SelectedBookOdds,
} from "@/lib/odds-api/types";

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

function marketByKey(
  book: OddsApiBookmaker | undefined,
  marketKey: string
): OddsApiMarket | undefined {
  return book?.markets.find((m) => m.key === marketKey);
}

function outcomePrice(
  market: OddsApiMarket | undefined,
  predicate: (o: { name: string; point?: number }) => boolean
): number | null {
  if (!market) return null;
  const hit = market.outcomes.find(predicate);
  if (!hit || !(hit.price > 1)) return null;
  return hit.price;
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
  // Both present: Unibet only wins when strictly better for us.
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

/**
 * Map an Odds API event (with bookmakers) onto Value Opportunities row ids.
 * Covers 1X2, BTTS, and totals lines we show (0.5 / 1.5 / 2.5 / 3.5).
 */
export function mapEventToValueRows(event: OddsApiEvent): SelectedBookOdds[] {
  const { pinnacle, unibet } = splitBooks(event);
  const rows: SelectedBookOdds[] = [];
  const home = event.home_team;
  const away = event.away_team;

  const pinH2h = marketByKey(pinnacle, "h2h");
  const uniH2h = marketByKey(unibet, "h2h");

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

  const pinBtts = marketByKey(pinnacle, "btts");
  const uniBtts = marketByKey(unibet, "btts");
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

  const totalsLines = [0.5, 1.5, 2.5, 3.5];
  const pinTotals = marketByKey(pinnacle, "totals");
  const uniTotals = marketByKey(unibet, "totals");
  for (const line of totalsLines) {
    pushSelected(
      rows,
      `ou-over-${line}`,
      outcomePrice(
        pinTotals,
        (o) => o.name.toLowerCase() === "over" && o.point === line
      ),
      outcomePrice(
        uniTotals,
        (o) => o.name.toLowerCase() === "over" && o.point === line
      )
    );
    pushSelected(
      rows,
      `ou-under-${line}`,
      outcomePrice(
        pinTotals,
        (o) => o.name.toLowerCase() === "under" && o.point === line
      ),
      outcomePrice(
        uniTotals,
        (o) => o.name.toLowerCase() === "under" && o.point === line
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
