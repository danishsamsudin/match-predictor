/**
 * Import FootyStats WCQ Europe + friendlies CSVs into matches + national_match_process_metrics.
 *
 * Default dir: data/imports/footystats/ (copy from Downloads/nations_league_data)
 * Usage: npx tsx scripts/nl-import-footystats.ts [--dir path]
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { NATIONS_LEAGUE_2026_TEAMS } from "../src/lib/data/nations-league-2026-teams";
import { normalizeNationalTeamName } from "../src/lib/data/world-cup-2026-teams";
import { tryCreateServiceClient } from "../src/lib/supabase";

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
  const headers = splitCsvLine(lines[0]!);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]!);
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      row[h] = cols[j] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function parseGmtDate(raw: string): string | null {
  // e.g. "Mar 21 2025 - 5:00pm"
  const m = raw.match(/^([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})/);
  if (!m) return null;
  const months: Record<string, string> = {
    Jan: "01",
    Feb: "02",
    Mar: "03",
    Apr: "04",
    May: "05",
    Jun: "06",
    Jul: "07",
    Aug: "08",
    Sep: "09",
    Oct: "10",
    Nov: "11",
    Dec: "12",
  };
  const mo = months[m[1]!];
  if (!mo) return null;
  return `${m[3]}-${mo}-${m[2]!.padStart(2, "0")}`;
}

function matchId(date: string, homeId: number, awayId: number, source: string): string {
  const raw = `${date}|${homeId}|${awayId}|${source}`;
  return `fs-${createHash("sha1").update(raw).digest("hex").slice(0, 16)}`;
}

function resolveTeam(name: string) {
  const key = normalizeNationalTeamName(name.replace(/\s+National Team$/i, ""));
  return NATIONS_LEAGUE_2026_TEAMS.find((t) => normalizeNationalTeamName(t.name) === key);
}

async function importMatchFile(
  supabase: NonNullable<ReturnType<typeof tryCreateServiceClient>>,
  filePath: string,
  competitionDefault: string
) {
  if (!fs.existsSync(filePath)) {
    console.warn("Skip missing", filePath);
    return { matches: 0, metrics: 0 };
  }
  const rows = parseCsv(fs.readFileSync(filePath, "utf8"));
  let matches = 0;
  let metrics = 0;

  for (const r of rows) {
    if ((r.status ?? "").toLowerCase() !== "complete") continue;
    const home = resolveTeam(r.home_team_name ?? "");
    const away = resolveTeam(r.away_team_name ?? "");
    if (!home || !away) continue;
    const date = parseGmtDate(r.date_GMT ?? "");
    if (!date) continue;
    const homeGoals = Number(r.home_team_goal_count);
    const awayGoals = Number(r.away_team_goal_count);
    if (!Number.isFinite(homeGoals) || !Number.isFinite(awayGoals)) continue;

    const id = matchId(date, home.id, away.id, path.basename(filePath));
    const { error: mErr } = await supabase.from("matches").upsert({
      id,
      date,
      competition: competitionDefault,
      home_team_id: String(home.id),
      away_team_id: String(away.id),
      home_goals: homeGoals,
      away_goals: awayGoals,
      status: "finished",
      venue: r.stadium_name || null,
      venue_city: null,
      referee: r.referee && r.referee !== "N/A" ? r.referee : null,
    });
    if (mErr) {
      console.warn("match upsert", mErr.message);
      continue;
    }
    matches += 1;

    const homeXg = Number(r.team_a_xg);
    const awayXg = Number(r.team_b_xg);
    const eventId = Number.parseInt(id.replace(/\D/g, "").slice(0, 9) || "0", 10) || Date.now() % 1e9;

    const { error: pErr } = await supabase.from("national_match_process_metrics").upsert({
      event_id: eventId,
      source: "footystats",
      match_date: date,
      home_team_id: home.id,
      away_team_id: away.id,
      home_xg: Number.isFinite(homeXg) ? homeXg : null,
      away_xg: Number.isFinite(awayXg) ? awayXg : null,
      home_shots: Number(r.home_team_shots) || null,
      away_shots: Number(r.away_team_shots) || null,
      home_sot: Number(r.home_team_shots_on_target) || null,
      away_sot: Number(r.away_team_shots_on_target) || null,
      competition_tier: competitionDefault.toLowerCase().includes("friendly") ? 0.32 : 1.0,
      payload: {
        competition: competitionDefault,
        possession_home: Number(r.home_team_possession) || null,
        possession_away: Number(r.away_team_possession) || null,
        corners_home: Number(r.home_team_corner_count) || null,
        corners_away: Number(r.away_team_corner_count) || null,
        yellow_home: Number(r.home_team_yellow_cards) || null,
        yellow_away: Number(r.away_team_yellow_cards) || null,
        odds_home: Number(r.odds_ft_home_team_win) || null,
        odds_draw: Number(r.odds_ft_draw) || null,
        odds_away: Number(r.odds_ft_away_team_win) || null,
        footystats_match_id: id,
      },
    });
    if (!pErr) metrics += 1;
    else console.warn("metrics upsert", pErr.message);
  }

  return { matches, metrics };
}

async function main() {
  loadEnvLocal();
  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const dirArg = process.argv.find((a) => a.startsWith("--dir="))?.slice(6);
  const dir =
    dirArg ??
    (fs.existsSync(path.join(process.cwd(), "data/imports/footystats"))
      ? path.join(process.cwd(), "data/imports/footystats")
      : path.join(process.env.HOME ?? "", "Downloads/nations_league_data"));

  console.log("FootyStats dir:", dir);

  // Ensure teams
  await supabase.from("teams").upsert(
    NATIONS_LEAGUE_2026_TEAMS.map((t) => ({ id: String(t.id), name: t.name }))
  );

  const wcq = await importMatchFile(
    supabase,
    path.join(dir, "international-wc-qualification-europe-matches-2026-to-2026-stats.csv"),
    "FIFA World Cup Qualification Europe"
  );
  const fri = await importMatchFile(
    supabase,
    path.join(dir, "international-international-friendlies-matches-2026-to-2026-stats.csv"),
    "International Friendly"
  );

  console.log("WCQ:", wcq, "Friendlies:", fri);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
