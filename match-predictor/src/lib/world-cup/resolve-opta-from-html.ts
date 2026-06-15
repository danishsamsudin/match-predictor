import { normalizeNationalTeamName } from "@/lib/data/world-cup-2026-teams";
import { candidateWcMatchDates } from "@/lib/world-cup/resolve-wc-match";
import scoresManifest from "../../../data/world-cup-2026/opta-result-scores.json";

export type OptaResultRecord = {
  date: string | null;
  optaHome: string;
  optaAway: string;
  homeGoals: number;
  awayGoals: number;
};

type ScoresManifest = {
  matches: OptaResultRecord[];
};

const manifest = scoresManifest as ScoresManifest;

function teamPairKey(home: string, away: string): string {
  const teams = [normalizeNationalTeamName(home), normalizeNationalTeamName(away)].sort();
  return `${teams[0]}|${teams[1]}`;
}

let indexByDateAndPair: Map<string, OptaResultRecord> | null = null;

function loadIndex(): Map<string, OptaResultRecord> {
  if (indexByDateAndPair) return indexByDateAndPair;

  const index = new Map<string, OptaResultRecord>();
  for (const row of manifest.matches ?? []) {
    const pair = teamPairKey(row.optaHome, row.optaAway);
    const date = row.date?.slice(0, 10) ?? "";
    if (date) index.set(`${date}|${pair}`, row);
    if (!index.has(`|${pair}`)) index.set(`|${pair}`, row);
  }

  indexByDateAndPair = index;
  return index;
}

/** Clear in-memory index (tests). */
export function clearOptaResultIndexCache(): void {
  indexByDateAndPair = null;
}

/** Resolve Opta result scores for a fixture by team pair (+ date when known). */
export function findOptaResultRecord(input: {
  date?: string | null;
  homeName: string;
  awayName: string;
}): OptaResultRecord | null {
  const index = loadIndex();
  const pair = teamPairKey(input.homeName, input.awayName);

  if (input.date) {
    for (const candidate of candidateWcMatchDates(input.date)) {
      const hit = index.get(`${candidate.slice(0, 10)}|${pair}`);
      if (hit) return hit;
    }
  }

  return index.get(`|${pair}`) ?? null;
}

/** @deprecated Use findOptaResultRecord — kept for tests/scripts that expect parsed shape. */
export function findOptaParsedMatch(input: {
  date?: string | null;
  homeName: string;
  awayName: string;
}): {
  homeTeamName: string;
  awayTeamName: string;
  homeGoals: number;
  awayGoals: number;
} | null {
  const row = findOptaResultRecord(input);
  if (!row) return null;
  return {
    homeTeamName: row.optaHome,
    awayTeamName: row.optaAway,
    homeGoals: row.homeGoals,
    awayGoals: row.awayGoals,
  };
}
