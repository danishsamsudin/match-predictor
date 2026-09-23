import { normalizeTeamName, normalizeText } from "@/lib/soccerdata/normalize";

export type BulinewsPredictedPlayer = {
  id: string;
  name: string;
  x: number;
  y: number;
  /** Broad role inferred from pitch row (y). */
  position: "G" | "D" | "M" | "F";
};

export type BulinewsPredictedLineups = {
  fixtureId: string | null;
  homeTeam: string;
  awayTeam: string;
  homeFormation: string | null;
  awayFormation: string | null;
  homePlayers: BulinewsPredictedPlayer[];
  awayPlayers: BulinewsPredictedPlayer[];
  published: boolean;
  sourcePath?: string;
};

const TEAM_ALIASES: Record<string, string> = {
  turkey: "turkiye",
  turkiye: "turkiye",
  "n ireland": "northern ireland",
  "northern ireland": "northern ireland",
  macedonia: "north macedonia",
  "north macedonia": "north macedonia",
  bosnia: "bosnia and herzegovina",
  "bosnia and herzegovina": "bosnia and herzegovina",
  "bosnia herzegovina": "bosnia and herzegovina",
  ireland: "republic of ireland",
  "republic of ireland": "republic of ireland",
  "czech republic": "czechia",
  czechia: "czechia",
};

export function normalizeBulinewsTeamName(name: string): string {
  const base = normalizeTeamName(name);
  return TEAM_ALIASES[base] ?? base;
}

export function bulinewsTeamsMatch(a: string, b: string): boolean {
  return normalizeBulinewsTeamName(a) === normalizeBulinewsTeamName(b);
}

function positionFromPitchY(y: number): "G" | "D" | "M" | "F" {
  if (y <= 1) return "G";
  if (y <= 3) return "D";
  if (y <= 6) return "M";
  return "F";
}

function decodeJsonStringLiteral(raw: string): string {
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    return raw;
  }
}

function parsePlayersBlob(blob: string): BulinewsPredictedPlayer[] {
  // Prefer real JSON.parse so `\u00d8degaard` becomes `Ødegaard`.
  try {
    const parsed = JSON.parse(blob) as unknown;
    if (Array.isArray(parsed)) {
      const players: BulinewsPredictedPlayer[] = [];
      for (const row of parsed) {
        if (!row || typeof row !== "object") continue;
        const rec = row as Record<string, unknown>;
        const id = String(rec.id ?? "").trim();
        const name = String(rec.name ?? "").trim();
        const pitchX = Number(rec.x);
        const pitchY = Number(rec.y);
        if (!id || !name || !Number.isFinite(pitchX) || !Number.isFinite(pitchY)) {
          continue;
        }
        players.push({
          id,
          name,
          x: pitchX,
          y: pitchY,
          position: positionFromPitchY(pitchY),
        });
      }
      if (players.length) return sortPredictedPlayers(players);
    }
  } catch {
    // Fall through to regex for malformed blobs.
  }

  const players: BulinewsPredictedPlayer[] = [];
  const re =
    /\{\s*"id"\s*:\s*"([^"]+)"\s*,\s*"name"\s*:\s*"([^"]*)"\s*,\s*"x"\s*:\s*"(\d+)"\s*,\s*"y"\s*:\s*"(\d+)"\s*\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(blob)) != null) {
    const pitchX = Number(match[3]);
    const pitchY = Number(match[4]);
    players.push({
      id: match[1],
      name: decodeJsonStringLiteral(match[2]).trim(),
      x: pitchX,
      y: pitchY,
      position: positionFromPitchY(pitchY),
    });
  }
  return sortPredictedPlayers(players);
}

export function sortPredictedPlayers(
  players: BulinewsPredictedPlayer[]
): BulinewsPredictedPlayer[] {
  return [...players].sort((a, b) => a.y - b.y || a.x - b.x || a.name.localeCompare(b.name));
}

function extractTeamPairFromHtml(html: string): { home: string; away: string } | null {
  const title = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim();
  if (title) {
    const m = title.match(/^(.+?)\s*-\s*(.+?)\s*:\s*Predicted/i);
    if (m) return { home: m[1].trim(), away: m[2].trim() };
  }
  const desc = html.match(/name="description"\s+content="([^"]+)"/i)?.[1];
  if (desc) {
    const m = desc.match(/Predicted Lineups\s*:\s*(.+?)\s*-\s*(.+?)\s*,/i);
    if (m) return { home: m[1].trim(), away: m[2].trim() };
  }
  return null;
}

/**
 * Parse a BuliNews predicted-lineups HTML page (server save or Safari complete).
 * Lineups live in the embedded `idb_lineups={...};` assignment.
 */
export function parseBulinewsPredictedLineupsHtml(
  html: string,
  options?: { sourcePath?: string }
): BulinewsPredictedLineups | null {
  const teams = extractTeamPairFromHtml(html);
  if (!teams) return null;

  const assign = html.match(/idb_lineups\s*=\s*(\{[\s\S]*?\});/);
  if (!assign) {
    return {
      fixtureId: null,
      homeTeam: teams.home,
      awayTeam: teams.away,
      homeFormation: null,
      awayFormation: null,
      homePlayers: [],
      awayPlayers: [],
      published: false,
      sourcePath: options?.sourcePath,
    };
  }

  const blob = assign[1];
  const fixtureId = blob.match(/"idb_lineups_fixture_id"\s*:\s*"([^"]+)"/)?.[1] ?? null;
  const homeFormation =
    blob.match(/"formations"\s*:\s*\{[^}]*"hometeam"\s*:\s*"([^"]+)"/)?.[1] ?? null;
  const awayFormation =
    blob.match(/"formations"\s*:\s*\{[^}]*"awayteam"\s*:\s*"([^"]+)"/)?.[1] ?? null;
  const published = /"publish"\s*:\s*"1"/.test(blob);

  const homePlayersMatch = blob.match(/"players"\s*:\s*\{[\s\S]*?"hometeam"\s*:\s*(\[[\s\S]*?\])/);
  const awayPlayersMatch = blob.match(/"awayteam"\s*:\s*(\[[\s\S]*?\])\s*\}/);

  const homePlayers = homePlayersMatch ? parsePlayersBlob(homePlayersMatch[1]) : [];
  const awayPlayers = awayPlayersMatch ? parsePlayersBlob(awayPlayersMatch[1]) : [];

  return {
    fixtureId,
    homeTeam: teams.home,
    awayTeam: teams.away,
    homeFormation,
    awayFormation,
    homePlayers,
    awayPlayers,
    published,
    sourcePath: options?.sourcePath,
  };
}

/** Match query name fragments used when resolving BuliNews short names to roster rows. */
export function bulinewsPlayerLookupKeys(name: string): string[] {
  const norm = normalizeText(name);
  const parts = norm.split(" ").filter(Boolean);
  const keys = [norm];
  if (parts.length >= 2) {
    keys.push(parts[parts.length - 1]!);
    keys.push(`${parts[0]} ${parts[parts.length - 1]}`);
    // Drop single-letter initials: "d dumfries" → "dumfries"
    const withoutInitials = parts.filter((p) => p.length > 1);
    if (withoutInitials.length && withoutInitials.join(" ") !== norm) {
      keys.push(withoutInitials.join(" "));
      keys.push(withoutInitials[withoutInitials.length - 1]!);
    }
  }
  return [...new Set(keys.filter(Boolean))];
}
