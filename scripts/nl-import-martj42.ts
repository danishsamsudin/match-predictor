/**
 * Import MartJ42 international results (NL + UEFA-relevant) into matches.
 * Skips shootouts. Usage: npx tsx scripts/nl-import-martj42.ts [--url ...]
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { NATIONS_LEAGUE_2026_TEAMS } from "../src/lib/data/nations-league-2026-teams";
import { normalizeNationalTeamName } from "../src/lib/data/world-cup-2026-teams";
import { tryCreateServiceClient } from "../src/lib/supabase";

const DEFAULT_URL =
  "https://raw.githubusercontent.com/martj42/international_results/master/results.csv";
const CACHE_DIR = path.join(process.cwd(), "data/imports/martj42");

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const [key, ...rest] = t.split("=");
    const val = rest.join("=").trim().replace(/^["']|["']$/g, "");
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0]!.split(",");
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      row[h] = cols[j] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

function matchId(date: string, home: string, away: string): string {
  const raw = `${date}|${home}|${away}|martj42`;
  return `martj42-${createHash("sha1").update(raw).digest("hex").slice(0, 16)}`;
}

async function main() {
  loadEnvLocal();
  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cachePath = path.join(CACHE_DIR, "results.csv");
  let text: string;
  if (fs.existsSync(cachePath) && !process.argv.includes("--refresh")) {
    text = fs.readFileSync(cachePath, "utf8");
    console.log("Using cached", cachePath);
  } else {
    const res = await fetch(DEFAULT_URL);
    if (!res.ok) throw new Error(`Failed to download MartJ42: ${res.status}`);
    text = await res.text();
    fs.writeFileSync(cachePath, text);
    console.log("Downloaded MartJ42 →", cachePath);
  }

  const byName = new Map(
    NATIONS_LEAGUE_2026_TEAMS.map((t) => [normalizeNationalTeamName(t.name), t])
  );

  const rows = parseCsv(text);
  const relevant = rows.filter((r) => {
    const tourney = (r.tournament ?? "").toLowerCase();
    if (!tourney) return false;
    const keep =
      tourney.includes("nations league") ||
      tourney.includes("fifa world cup qualification") ||
      tourney.includes("uefa euro qualification") ||
      tourney.includes("friendly");
    if (!keep) return false;
    const home = byName.get(normalizeNationalTeamName(r.home_team ?? ""));
    const away = byName.get(normalizeNationalTeamName(r.away_team ?? ""));
    return Boolean(home && away);
  });

  // Ensure teams exist
  const teamUpserts = NATIONS_LEAGUE_2026_TEAMS.map((t) => ({
    id: String(t.id),
    name: t.name,
  }));
  for (let i = 0; i < teamUpserts.length; i += 40) {
    const chunk = teamUpserts.slice(i, i + 40);
    const { error } = await supabase.from("teams").upsert(chunk);
    if (error) console.warn("teams upsert:", error.message);
  }

  let upserted = 0;
  const batch: Record<string, unknown>[] = [];
  for (const r of relevant) {
    const home = byName.get(normalizeNationalTeamName(r.home_team ?? ""))!;
    const away = byName.get(normalizeNationalTeamName(r.away_team ?? ""))!;
    const date = r.date?.slice(0, 10);
    if (!date) continue;
    const homeGoals = Number(r.home_score);
    const awayGoals = Number(r.away_score);
    if (!Number.isFinite(homeGoals) || !Number.isFinite(awayGoals)) continue;

    batch.push({
      id: matchId(date, home.name, away.name),
      date,
      competition: r.tournament || "International",
      home_team_id: String(home.id),
      away_team_id: String(away.id),
      home_goals: homeGoals,
      away_goals: awayGoals,
      status: "finished",
      venue_city: r.city || null,
      venue: r.city || null,
    });

    if (batch.length >= 100) {
      const { error } = await supabase.from("matches").upsert(batch);
      if (error) console.warn("matches upsert:", error.message);
      else upserted += batch.length;
      batch.length = 0;
    }
  }
  if (batch.length) {
    const { error } = await supabase.from("matches").upsert(batch);
    if (error) console.warn("matches upsert:", error.message);
    else upserted += batch.length;
  }

  console.log(`MartJ42 import done. Relevant rows=${relevant.length}, upserted≈${upserted}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
