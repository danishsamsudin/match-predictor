/**
 * Parse SoFIFA /players listing pages (nationality-filtered catalog),
 * as saved via “Web Page, Complete” HTML dumps.
 */

export type SofifaListedPlayer = {
  sofifaPlayerId: number;
  shortName: string;
  fullName: string;
  age: number | null;
  overall: number | null;
  potential: number | null;
  positions: string[];
  nationality: string | null;
  clubName: string | null;
};

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function parseEmTitle(html: string): number | null {
  const m = html.match(/<em[^>]*title="(\d+)"/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function parseListedPlayerRow(rowHtml: string): SofifaListedPlayer | null {
  const playerLink = rowHtml.match(
    /<a href="https:\/\/sofifa\.com\/player\/(\d+)\/[^"]*"[^>]*data-tippy-top=""[^>]*data-tippy-content="([^"]+)"[^>]*>([^<]*)<\/a>/
  );
  if (!playerLink) return null;

  const sofifaPlayerId = Number(playerLink[1]);
  const fullName = decodeHtmlEntities(playerLink[2]);
  const shortName = decodeHtmlEntities(playerLink[3]);
  if (!Number.isFinite(sofifaPlayerId) || !fullName) return null;

  const age = Number(rowHtml.match(/data-col="ae">(\d+)</)?.[1] ?? NaN);
  const overall = parseEmTitle(rowHtml.match(/data-col="oa">([\s\S]*?)<\/td>/)?.[1] ?? "");
  const potential = parseEmTitle(rowHtml.match(/data-col="pt">([\s\S]*?)<\/td>/)?.[1] ?? "");

  const nameCellHtml =
    rowHtml.match(
      /<td>\s*<a href="https:\/\/sofifa\.com\/player\/[\s\S]*?<\/div>\s*<\/td>/
    )?.[0] ?? "";
  const positions = [
    ...nameCellHtml.matchAll(/<span class="pos pos\d+">([A-Z]{2,3})<\/span>/g),
  ].map((m) => m[1]);

  const nationality =
    rowHtml.match(/<img title="([^"]+)" alt=""[^>]*class="flag(?:\s|")/)?.[1] ??
    rowHtml.match(/<img title="([^"]+)"[^>]*class="flag/)?.[1] ??
    null;

  const clubName =
    rowHtml
      .match(/<a href="https:\/\/sofifa\.com\/team\/\d+\/[^"]*\/[^"]*\/">([^<]+)<\/a>/)?.[1]
      ?.trim() ?? null;

  return {
    sofifaPlayerId,
    shortName,
    fullName,
    age: Number.isFinite(age) ? age : null,
    overall,
    potential,
    positions: [...new Set(positions)],
    nationality: nationality ? decodeHtmlEntities(nationality) : null,
    clubName: clubName ? decodeHtmlEntities(clubName) : null,
  };
}

/** Parse one SoFIFA players-list HTML page into catalog rows. */
export function parseSofifaPlayersListHtml(html: string): SofifaListedPlayer[] {
  const tbody = html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1];
  if (!tbody) return [];

  const players: SofifaListedPlayer[] = [];
  const seen = new Set<number>();
  for (const row of tbody.matchAll(/<tr([^>]*)>([\s\S]*?)<\/tr>/g)) {
    const player = parseListedPlayerRow(row[2]);
    if (!player) continue;
    if (seen.has(player.sofifaPlayerId)) continue;
    seen.add(player.sofifaPlayerId);
    players.push(player);
  }
  return players;
}

/** Prefer higher overall when the same Sofifa id appears on multiple pages. */
export function mergeSofifaListedPlayers(
  batches: SofifaListedPlayer[][]
): SofifaListedPlayer[] {
  const byId = new Map<number, SofifaListedPlayer>();
  for (const batch of batches) {
    for (const player of batch) {
      const prev = byId.get(player.sofifaPlayerId);
      if (!prev) {
        byId.set(player.sofifaPlayerId, player);
        continue;
      }
      const prevOa = prev.overall ?? -1;
      const nextOa = player.overall ?? -1;
      if (nextOa >= prevOa) byId.set(player.sofifaPlayerId, player);
    }
  }
  return [...byId.values()].sort(
    (a, b) => (b.overall ?? 0) - (a.overall ?? 0) || a.fullName.localeCompare(b.fullName)
  );
}
