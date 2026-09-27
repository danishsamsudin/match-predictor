/**
 * Fetch SoFIFA players-list pages for UEFA Nations League nationalities.
 *
 * Saves “Web Page”-style HTML under data/nations-league-2026/nl-scoutlyst-rankings
 * so `nl:import-sofifa` / `nl:postmatch` can ingest them offline.
 *
 * SoFIFA often blocks automated clients (Cloudflare). If fetch fails, open the
 * printed URLs in a browser and save as “Web Page, Complete”.
 *
 * Usage:
 *   npx tsx scripts/fetch-nl-sofifa-players.ts
 *   npx tsx scripts/fetch-nl-sofifa-players.ts --pages 5 --delay-ms 1500
 *   npx tsx scripts/fetch-nl-sofifa-players.ts --print-urls-only
 */
import fs from "fs";
import path from "path";
import { NL_SOFIFA_PLAYERS_DIR } from "../src/lib/nations-league/import-nl-sofifa-players";

/** Sofifa `na[]` nationality ids used by the Sep 2026 NL dump (UEFA nations). */
export const NL_SOFIFA_NATIONALITY_IDS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 208, 16, 17, 18, 20, 21, 205,
  22, 23, 24, 27, 165, 219, 28, 29, 30, 31, 32, 33, 15, 34, 19, 35, 36, 37, 38,
  25, 39, 41, 42, 51, 43, 44, 45, 46, 47, 48, 49, 50,
] as const;

function parseArgs(): {
  pages: number;
  delayMs: number;
  offsetStart: number;
  printUrlsOnly: boolean;
  fillGaps: boolean;
  outDir: string;
} {
  const pagesIdx = process.argv.indexOf("--pages");
  const delayIdx = process.argv.indexOf("--delay-ms");
  const offsetIdx = process.argv.indexOf("--offset-start");
  const dirIdx = process.argv.indexOf("--dir");
  return {
    pages: pagesIdx >= 0 ? Number(process.argv[pagesIdx + 1]) || 3 : 3,
    delayMs: delayIdx >= 0 ? Number(process.argv[delayIdx + 1]) || 1500 : 1500,
    offsetStart: offsetIdx >= 0 ? Number(process.argv[offsetIdx + 1]) || 0 : 0,
    printUrlsOnly: process.argv.includes("--print-urls-only"),
    fillGaps: process.argv.includes("--fill-gaps"),
    outDir: path.resolve(
      dirIdx >= 0 ? process.argv[dirIdx + 1] : NL_SOFIFA_PLAYERS_DIR
    ),
  };
}

function buildPlayersListUrl(offset: number): string {
  const params = new URLSearchParams();
  params.set("type", "all");
  NL_SOFIFA_NATIONALITY_IDS.forEach((id, i) => {
    params.set(`na[${i}]`, String(id));
  });
  params.set("col", "oa");
  params.set("sort", "desc");
  if (offset > 0) params.set("offset", String(offset));
  return `https://sofifa.com/players?${params.toString()}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.text();
}

function listExistingOffsets(outDir: string): Set<number> {
  const found = new Set<number>();
  if (!fs.existsSync(outDir)) return found;
  for (const name of fs.readdirSync(outDir)) {
    if (!name.toLowerCase().endsWith(".html")) continue;
    const html = fs.readFileSync(path.join(outDir, name), "utf8");
    const nextOffsets = [...html.matchAll(/offset=(\d+)/g)].map((m) => Number(m[1]));
    if (!nextOffsets.length) {
      found.add(0);
      continue;
    }
    const next = Math.min(...nextOffsets.filter((n) => Number.isFinite(n)));
    if (next >= 60) found.add(next - 60);
    else found.add(0);
  }
  return found;
}

function detectOffsetGaps(existing: Set<number>): number[] {
  const offs = [...existing].sort((a, b) => a - b);
  if (offs.length < 2) return [];
  const gaps: number[] = [];
  for (let i = 0; i < offs.length - 1; i += 1) {
    for (let o = offs[i] + 60; o < offs[i + 1]; o += 60) gaps.push(o);
  }
  return gaps;
}

async function main() {
  const { pages, delayMs, offsetStart, printUrlsOnly, outDir, fillGaps } = parseArgs();
  const existing = listExistingOffsets(outDir);
  const gaps = detectOffsetGaps(existing);
  if (gaps.length) {
    console.log(`Detected missing offsets in ${outDir}: ${gaps.join(", ")}`);
  }

  const urls: Array<{ offset: number; url: string }> = [];
  if (fillGaps && gaps.length) {
    for (const offset of gaps) urls.push({ offset, url: buildPlayersListUrl(offset) });
  } else {
    for (let i = 0; i < pages; i += 1) {
      const offset = offsetStart + i * 60;
      urls.push({ offset, url: buildPlayersListUrl(offset) });
    }
  }

  console.log(`SoFIFA NL players URLs (${urls.length}):`);
  for (const row of urls) {
    console.log(`  offset ${row.offset} → ${row.url}`);
  }

  if (printUrlsOnly) return;

  fs.mkdirSync(outDir, { recursive: true });
  let saved = 0;
  for (const row of urls) {
    const stamp = new Date().toISOString().slice(0, 10);
    const fileName =
      row.offset === 0
        ? `FC27 - ${stamp} - Players _ SoFIFA.html`
        : `FC27 - ${stamp} - Players _ SoFIFA_offset${row.offset}.html`;
    const outPath = path.join(outDir, fileName);
    try {
      console.log(`Fetching offset ${row.offset}…`);
      const html = await fetchPage(row.url);
      if (!html.includes("<tbody>") || !/sofifa\.com\/player\//.test(html)) {
        console.warn(
          `  Response does not look like a players table (blocked?). Skipping save.`
        );
        console.warn(`  Open manually: ${row.url}`);
      } else {
        fs.writeFileSync(outPath, html, "utf8");
        console.log(`  Saved ${outPath} (${html.length} bytes)`);
        saved += 1;
      }
    } catch (err) {
      console.warn(`  Fetch failed: ${err instanceof Error ? err.message : err}`);
      console.warn(`  Open manually and save as Web Page, Complete: ${row.url}`);
    }
    if (delayMs > 0) await sleep(delayMs);
  }

  console.log(`\nSaved ${saved}/${urls.length} page(s) into ${outDir}`);
  console.log("Next: npm run nl:import-sofifa");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
