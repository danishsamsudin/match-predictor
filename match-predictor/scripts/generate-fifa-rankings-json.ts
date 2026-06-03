#!/usr/bin/env npx tsx
/**
 * Regenerate data/imports/fifa/fifa-rankings-2026.json from the official FIFA HTML snapshot.
 * Run after updating:
 *   data/imports/fbref/world-cup/FIFA_Coca-Cola Men's World Ranking.html
 */
import { readFileSync, existsSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { parseFifaOfficialRankingHtml } from "../src/lib/data/parse-fifa-official-ranking-html";
import { parseSofascoreFifaRankingsHtml } from "../src/lib/data/parse-sofascore-fifa-html";
import {
  buildSofascoreTeamIdLookup,
  resolveSofascoreTeamId,
} from "../src/lib/data/resolve-fifa-sofascore-team-id";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIFA_HTML_PATH = join(
  ROOT,
  "data/imports/fbref/world-cup/FIFA_Coca-Cola Men's World Ranking.html"
);
const SOFA_HTML_PATH = join(
  ROOT,
  "data/imports/fbref/world-cup/FIFA Football Rankings 2026 - Sofascore.html"
);
const OUT_PATH = join(ROOT, "data/imports/fifa/fifa-rankings-2026.json");

if (!existsSync(FIFA_HTML_PATH)) {
  console.error(`FIFA HTML not found: ${FIFA_HTML_PATH}`);
  process.exit(1);
}

const fifaHtml = readFileSync(FIFA_HTML_PATH, "utf-8");
const rows = parseFifaOfficialRankingHtml(fifaHtml);

const idByNorm = new Map<string, number>();
if (existsSync(SOFA_HTML_PATH)) {
  const sofaRows = parseSofascoreFifaRankingsHtml(readFileSync(SOFA_HTML_PATH, "utf-8"));
  for (const row of sofaRows) {
    if (row.sofascoreTeamId != null) {
      idByNorm.set(row.normalizedTeamName, row.sofascoreTeamId);
    }
  }
}
const idLookup = buildSofascoreTeamIdLookup(idByNorm);

const payload = {
  rankingYear: rows[0].rankingYear,
  semester: rows[0].semester,
  dataSource: "fifa" as const,
  updatedAt: rows[0].snapshotIso ?? new Date().toISOString(),
  rows: rows.map((r) => ({
    rank: r.rank,
    teamName: r.teamName,
    normalizedTeamName: r.normalizedTeamName,
    totalPoints: r.totalPoints,
    previousPoints: r.previousPoints,
    pointsDiff: r.pointsDiff,
    acronym: r.acronym,
    sofascoreTeamId: resolveSofascoreTeamId(r.teamName, idLookup),
  })),
};

const missingIds = payload.rows.filter((r) => r.sofascoreTeamId == null);
if (missingIds.length) {
  console.warn(
    `Warning: ${missingIds.length} teams without Sofascore id:`,
    missingIds.map((r) => r.teamName).join(", ")
  );
}

writeFileSync(OUT_PATH, JSON.stringify(payload));
console.log(`Wrote ${payload.rows.length} teams to ${OUT_PATH}`);
