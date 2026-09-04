/**
 * Parse football-data.co.uk (or compatible) CSVs into per-team event stats
 * for glpm_match_team_stats: corners, yellow_cards, red_cards, fouls.
 */

import { normalizeTeamName } from "@/lib/soccerdata/normalize";

export type EventStatCsvRow = {
  dateIso: string;
  homeName: string;
  awayName: string;
  homeCorners: number | null;
  awayCorners: number | null;
  homeYellows: number | null;
  awayYellows: number | null;
  homeReds: number | null;
  awayReds: number | null;
  homeFouls: number | null;
  awayFouls: number | null;
};

export type GlpmFixtureRef = {
  matchSmId: number;
  matchDate: string;
  homeTeamSmId: number;
  awayTeamSmId: number;
  homeName: string;
  awayName: string;
};

export type EventStatPatch = {
  matchSmId: number;
  teamSmId: number;
  corners: number | null;
  yellowCards: number | null;
  redCards: number | null;
  fouls: number | null;
};

/** football-data.co.uk short names → forms that match GLPM / SportMonks names. */
export const FOOTBALL_DATA_TEAM_ALIASES: Record<string, string> = {
  "man city": "manchester city",
  "man united": "manchester united",
  "spurs": "tottenham hotspur",
  "tottenham": "tottenham hotspur",
  "nott m forest": "nottingham forest",
  "nottingham forest": "nottingham forest",
  "wolves": "wolverhampton wanderers",
  "wolverhampton": "wolverhampton wanderers",
  "west brom": "west bromwich albion",
  "qpr": "queens park rangers",
  "sheffield utd": "sheffield united",
  "sheffield weds": "sheffield wednesday",
  "newcastle": "newcastle united",
  "west ham": "west ham united",
  "brighton": "brighton and hove albion",
  "brighton hove albion": "brighton and hove albion",
  "notts forest": "nottingham forest",
  "leicester": "leicester city",
  "leeds": "leeds united",
  "norwich": "norwich city",
  "ipswich": "ipswich town",
  "sunderland": "sunderland",
};

export function canonicalTeamKey(name: string): string {
  const norm = normalizeTeamName(name);
  return FOOTBALL_DATA_TEAM_ALIASES[norm] ?? norm;
}

export function parseFdDate(raw: string): string | null {
  const t = raw.trim();
  const m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})$/);
  if (!m) {
    const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
  }
  const d = Number(m[1]);
  const mo = Number(m[2]);
  let y = Number(m[3]);
  if (m[3].length === 2) y += y >= 70 ? 1900 : 2000;
  if (!Number.isFinite(d) || !Number.isFinite(mo) || !Number.isFinite(y)) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function numAt(row: Record<string, string>, keys: string[]): number | null {
  for (const k of keys) {
    const raw = row[k];
    if (raw == null || raw === "") continue;
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function parseEventStatsCsv(text: string): EventStatCsvRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]!).map((h) => h.trim());
  const index = new Map(headers.map((h, i) => [h.toLowerCase(), i]));
  const col = (...names: string[]) => {
    for (const n of names) {
      const i = index.get(n.toLowerCase());
      if (i != null) return i;
    }
    return null;
  };

  const iDate = col("date");
  const iHome = col("hometeam", "home", "home_team");
  const iAway = col("awayteam", "away", "away_team");
  if (iDate == null || iHome == null || iAway == null) {
    throw new Error(
      "CSV must include Date, HomeTeam, AwayTeam (football-data.co.uk headers)."
    );
  }

  const rows: EventStatCsvRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    const rec: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      rec[headers[i]!.toLowerCase()] = cells[i] ?? "";
    }
    const dateIso = parseFdDate(cells[iDate] ?? "");
    const homeName = (cells[iHome] ?? "").trim();
    const awayName = (cells[iAway] ?? "").trim();
    if (!dateIso || !homeName || !awayName) continue;
    rows.push({
      dateIso,
      homeName,
      awayName,
      homeCorners: numAt(rec, ["hc", "home_corners"]),
      awayCorners: numAt(rec, ["ac", "away_corners"]),
      homeYellows: numAt(rec, ["hy", "home_yellows", "home_yellow"]),
      awayYellows: numAt(rec, ["ay", "away_yellows", "away_yellow"]),
      homeReds: numAt(rec, ["hr", "home_reds", "home_red"]),
      awayReds: numAt(rec, ["ar", "away_reds", "away_red"]),
      homeFouls: numAt(rec, ["hf", "home_fouls"]),
      awayFouls: numAt(rec, ["af", "away_fouls"]),
    });
  }
  return rows;
}

function namesMatch(a: string, b: string): boolean {
  const ka = canonicalTeamKey(a);
  const kb = canonicalTeamKey(b);
  if (ka === kb) return true;
  if (ka.length >= 5 && kb.includes(ka)) return true;
  if (kb.length >= 5 && ka.includes(kb)) return true;
  return false;
}

export function matchCsvRowsToFixtures(
  csvRows: EventStatCsvRow[],
  fixtures: GlpmFixtureRef[]
): { patches: EventStatPatch[]; unmatched: EventStatCsvRow[] } {
  const byDate = new Map<string, GlpmFixtureRef[]>();
  for (const f of fixtures) {
    const list = byDate.get(f.matchDate) ?? [];
    list.push(f);
    byDate.set(f.matchDate, list);
  }

  const patches: EventStatPatch[] = [];
  const unmatched: EventStatCsvRow[] = [];

  for (const row of csvRows) {
    const day = byDate.get(row.dateIso) ?? [];
    const hit = day.find(
      (f) => namesMatch(f.homeName, row.homeName) && namesMatch(f.awayName, row.awayName)
    );
    if (!hit) {
      unmatched.push(row);
      continue;
    }
    patches.push({
      matchSmId: hit.matchSmId,
      teamSmId: hit.homeTeamSmId,
      corners: row.homeCorners,
      yellowCards: row.homeYellows,
      redCards: row.homeReds,
      fouls: row.homeFouls,
    });
    patches.push({
      matchSmId: hit.matchSmId,
      teamSmId: hit.awayTeamSmId,
      corners: row.awayCorners,
      yellowCards: row.awayYellows,
      redCards: row.awayReds,
      fouls: row.awayFouls,
    });
  }

  return { patches, unmatched };
}
