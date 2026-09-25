import { isNationsLeague2026TeamName } from "@/lib/data/nations-league-2026-teams";
import { normalizeNationalTeamName } from "@/lib/data/world-cup-2026-teams";
import { normalizeText } from "@/lib/soccerdata/normalize";
import nlPenaltyTakers from "../../../data/nations-league-2026/penalty-takers.json";
import sofifaSquads from "../../../data/world-cup-2026/sofifa-squads.json";

type SofifaSquadsFile = {
  teams: Record<
    string,
    {
      setPieces?: { Penalties?: string };
    }
  >;
};

type NlPenaltyFile = {
  teams: Record<string, string>;
};

function teamLookupKeys(teamName: string): string[] {
  const raw = teamName.trim();
  if (!raw) return [];
  const keys = [
    raw.toLowerCase(),
    normalizeNationalTeamName(raw).toLowerCase(),
    normalizeText(raw),
  ];
  // Common aliases
  if (/türkiye|turkey/i.test(raw)) {
    keys.push("türkiye", "turkey", "turkiye");
  }
  if (/bosnia/i.test(raw)) {
    keys.push("bosnia & herzegovina", "bosnia and herzegovina");
  }
  if (/czech/i.test(raw)) {
    keys.push("czechia", "czech republic");
  }
  if (/^ireland$/i.test(raw) || /republic of ireland/i.test(raw)) {
    keys.push("republic of ireland", "ireland");
  }
  return [...new Set(keys.filter(Boolean))];
}

function buildSofifaPenaltyMap(): Map<string, string> {
  const map = new Map<string, string>();
  const teams = (sofifaSquads as SofifaSquadsFile).teams ?? {};
  for (const [teamName, team] of Object.entries(teams)) {
    const pen = team.setPieces?.Penalties?.trim();
    if (!pen) continue;
    for (const key of teamLookupKeys(teamName)) {
      if (!map.has(key)) map.set(key, pen);
    }
  }
  return map;
}

function buildNlPenaltyMap(): Map<string, string> {
  const map = new Map<string, string>();
  const teams = (nlPenaltyTakers as NlPenaltyFile).teams ?? {};
  for (const [teamName, taker] of Object.entries(teams)) {
    const pen = taker?.trim();
    if (!pen) continue;
    for (const key of teamLookupKeys(teamName)) {
      map.set(key, pen);
    }
  }
  return map;
}

const SOFIFA_PENALTY_BY_TEAM = buildSofifaPenaltyMap();
const NL_PENALTY_BY_TEAM = buildNlPenaltyMap();

/**
 * Resolve the designated national-team penalty taker.
 * Nations League uses the dedicated NL map (all 54 nations), falling back to
 * Sofifa WC setPieces for overlapping squads / aliases.
 */
export function resolveNationalPenaltyTaker(
  teamName: string,
  options?: { preferNlMap?: boolean }
): string | null {
  const preferNl = options?.preferNlMap ?? isNationsLeague2026TeamName(teamName);
  const keys = teamLookupKeys(teamName);
  if (preferNl) {
    for (const key of keys) {
      const nl = NL_PENALTY_BY_TEAM.get(key);
      if (nl) return nl;
    }
  }
  for (const key of keys) {
    const sofifa = SOFIFA_PENALTY_BY_TEAM.get(key);
    if (sofifa) return sofifa;
  }
  if (!preferNl) {
    for (const key of keys) {
      const nl = NL_PENALTY_BY_TEAM.get(key);
      if (nl) return nl;
    }
  }
  return null;
}

export function listNlPenaltyTakerCoverage(): {
  teamCount: number;
  teams: Array<{ team: string; taker: string }>;
} {
  const teams = (nlPenaltyTakers as NlPenaltyFile).teams ?? {};
  const rows = Object.entries(teams)
    .filter(([name]) => isNationsLeague2026TeamName(name))
    .map(([team, taker]) => ({ team, taker }));
  // Deduplicate aliases (Türkiye/Turkey) by canonical NL name set size.
  const byCanon = new Map<string, string>();
  for (const row of rows) {
    byCanon.set(normalizeNationalTeamName(row.team), row.taker);
  }
  return {
    teamCount: byCanon.size,
    teams: [...byCanon.entries()].map(([team, taker]) => ({ team, taker })),
  };
}
