import { stableSyntheticPlayerId } from "@/lib/data/build-squad-from-scoutlyst";
import { formatPlayerDisplayNameIfNeeded } from "@/lib/data/format-player-display-name";
import { positionDisplayLabel } from "@/lib/data/normalize-player-position";
import { playerNameLookupKeys } from "@/lib/data/resolve-squad-player-metrics";
import { listBulinewsPredictedHtmlFiles } from "@/lib/nations-league/bulinews-predicted-dir";
import { loadCommittedBulinewsPredictedFixtures } from "@/lib/nations-league/bulinews-predicted-xis-data";
import {
  bulinewsPlayerLookupKeys,
  bulinewsTeamsMatch,
  parseBulinewsPredictedLineupsHtml,
  type BulinewsPredictedLineups,
  type BulinewsPredictedPlayer,
} from "@/lib/nations-league/parse-bulinews-predicted-lineups";
import { normalizeText } from "@/lib/soccerdata/normalize";
import type { SquadPlayer } from "@/lib/types/team-comparison";
import fs from "node:fs";

export type BulinewsXiSide = "home" | "away";

export type ResolvedBulinewsPredictedXi = {
  formation: string | null;
  starters: SquadPlayer[];
  /** Roster with any synthetic BuliNews-only players merged in. */
  roster: SquadPlayer[];
  matchedCount: number;
  sourcePath: string | null;
  bulinewsTeam: string;
  bulinewsOpponent: string;
};

function fixtureMatchesPair(
  parsed: BulinewsPredictedLineups,
  teamName: string,
  opponentName: string
): boolean {
  if (!parsed.published) return false;
  if (parsed.homePlayers.length < 11 || parsed.awayPlayers.length < 11) return false;
  const teamIsHome = bulinewsTeamsMatch(parsed.homeTeam, teamName);
  const teamIsAway = bulinewsTeamsMatch(parsed.awayTeam, teamName);
  const oppIsHome = bulinewsTeamsMatch(parsed.homeTeam, opponentName);
  const oppIsAway = bulinewsTeamsMatch(parsed.awayTeam, opponentName);
  return (teamIsHome && oppIsAway) || (teamIsAway && oppIsHome);
}

function findBulinewsFixture(
  teamName: string,
  opponentName: string,
  htmlPaths?: string[]
): BulinewsPredictedLineups | null {
  const readHtmlFixture = (paths: string[]): BulinewsPredictedLineups | null => {
    for (const sourcePath of paths) {
      let html: string;
      try {
        html = fs.readFileSync(sourcePath, "utf8");
      } catch {
        continue;
      }
      const parsed = parseBulinewsPredictedLineupsHtml(html, { sourcePath });
      if (!parsed || !fixtureMatchesPair(parsed, teamName, opponentName)) continue;
      return parsed;
    }
    return null;
  };

  // Explicit htmlPaths (tests / local overrides) win when present.
  if (htmlPaths?.length) {
    const fromHtml = readHtmlFixture(htmlPaths);
    if (fromHtml) return fromHtml;
  }

  // Committed JSON ships to Vercel; HTML dumps are gitignored.
  for (const parsed of loadCommittedBulinewsPredictedFixtures()) {
    if (fixtureMatchesPair(parsed, teamName, opponentName)) return parsed;
  }

  if (htmlPaths) return null;
  return readHtmlFixture(listBulinewsPredictedHtmlFiles());
}

function buildRosterLookup(roster: SquadPlayer[]): Map<string, SquadPlayer[]> {
  const map = new Map<string, SquadPlayer[]>();
  const add = (key: string, player: SquadPlayer) => {
    if (!key) return;
    const list = map.get(key);
    if (list) list.push(player);
    else map.set(key, [player]);
  };

  for (const player of roster) {
    const display = formatPlayerDisplayNameIfNeeded(player.name);
    for (const key of [
      ...playerNameLookupKeys(display),
      ...bulinewsPlayerLookupKeys(display),
      normalizeText(display),
    ]) {
      add(key, player);
    }
  }
  return map;
}

function matchPredictedToRoster(
  predicted: BulinewsPredictedPlayer,
  lookup: Map<string, SquadPlayer[]>,
  usedIds: Set<number>
): SquadPlayer | null {
  const keys = bulinewsPlayerLookupKeys(predicted.name);
  for (const key of keys) {
    const candidates = (lookup.get(key) ?? []).filter(
      (p) => !usedIds.has(p.sofascorePlayerId)
    );
    if (candidates.length === 1) return candidates[0]!;
    if (candidates.length > 1) {
      // Prefer same broad position when ambiguous
      const want = positionDisplayLabel(predicted.position);
      const byPos = candidates.filter((p) => p.position === want);
      if (byPos.length === 1) return byPos[0]!;
      return candidates[0]!;
    }
  }
  return null;
}

function syntheticFromPredicted(
  predicted: BulinewsPredictedPlayer,
  teamName: string,
  usedNormNames: Set<string>
): SquadPlayer {
  // Keep BuliNews labels as-is; formatPlayerDisplayNameIfNeeded mangles
  // particle surnames like "ter Stegen" → "Stegen ter".
  let display = predicted.name.trim();
  const baseNorm = normalizeText(display);
  if (usedNormNames.has(baseNorm)) {
    // BuliNews occasionally repeats a surname for two pitch slots (Dimitrov, Schlager).
    // Avoid parentheses - formatPlayerDisplayNameIfNeeded strips them and collapses names.
    display = `${display} ${positionDisplayLabel(predicted.position)}`;
  }
  const norm = normalizeText(display);
  return {
    sofascorePlayerId: stableSyntheticPlayerId(
      `bulinews:${teamName}:${predicted.id}:${norm}`
    ),
    scoutlystPlayerKey: `bulinews:${teamName}:${predicted.id}:${norm}`,
    name: display,
    position: positionDisplayLabel(predicted.position),
    fieldPosition: predicted.position,
    performanceScore: null,
    startSharePct: null,
    detailStats: [],
    age: null,
  };
}

/**
 * Prefer BuliNews predicted XI for a Nations League fixture when a local HTML
 * save exists for the team pair. Unmatched names are added as synthetic roster rows
 * so the picker can still show the predicted starter (e.g. ter Stegen vs Neuer).
 */
export function resolveBulinewsPredictedXi(input: {
  teamName: string;
  opponentName: string;
  /** Hint only; actual side is inferred from which team is home/away in the HTML. */
  sideHint?: BulinewsXiSide;
  roster: SquadPlayer[];
  htmlPaths?: string[];
}): ResolvedBulinewsPredictedXi | null {
  const teamName = input.teamName.trim();
  const opponentName = input.opponentName.trim();
  if (!teamName || !opponentName) return null;

  const parsed = findBulinewsFixture(teamName, opponentName, input.htmlPaths);
  if (!parsed) return null;

  const teamIsHome = bulinewsTeamsMatch(parsed.homeTeam, teamName);
  const predictedPlayers = teamIsHome ? parsed.homePlayers : parsed.awayPlayers;
  const formation = teamIsHome ? parsed.homeFormation : parsed.awayFormation;
  const bulinewsTeam = teamIsHome ? parsed.homeTeam : parsed.awayTeam;
  const bulinewsOpponent = teamIsHome ? parsed.awayTeam : parsed.homeTeam;

  const roster = [...input.roster];
  const lookup = buildRosterLookup(roster);
  const usedIds = new Set<number>();
  const usedNormNames = new Set<string>();
  const starters: SquadPlayer[] = [];
  let matchedCount = 0;

  for (const predicted of predictedPlayers.slice(0, 11)) {
    let matched = matchPredictedToRoster(predicted, lookup, usedIds);
    if (!matched) {
      matched = syntheticFromPredicted(predicted, teamName, usedNormNames);
      roster.push(matched);
      for (const key of [
        ...playerNameLookupKeys(matched.name),
        ...bulinewsPlayerLookupKeys(matched.name),
      ]) {
        const list = lookup.get(key);
        if (list) list.push(matched);
        else lookup.set(key, [matched]);
      }
    } else {
      matchedCount += 1;
      // Prefer BuliNews pitch role when roster position is wrong/missing
      if (matched.position !== positionDisplayLabel(predicted.position)) {
        matched = {
          ...matched,
          position: positionDisplayLabel(predicted.position),
          fieldPosition: predicted.position,
        };
      }
    }
    usedIds.add(matched.sofascorePlayerId);
    usedNormNames.add(normalizeText(matched.name));
    starters.push(matched);
  }

  if (starters.length < 11) return null;

  return {
    formation,
    starters,
    roster,
    matchedCount,
    sourcePath: parsed.sourcePath ?? null,
    bulinewsTeam,
    bulinewsOpponent,
  };
}
