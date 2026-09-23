import { formatPlayerDisplayNameIfNeeded } from "@/lib/data/format-player-display-name";
import { playerNameLookupKeys } from "@/lib/data/resolve-squad-player-metrics";
import { normalizeText } from "@/lib/soccerdata/normalize";
import type { PlayerDisplayStat, SquadPlayer } from "@/lib/types/team-comparison";

function rosterIdentityKeys(player: SquadPlayer): string[] {
  return playerNameLookupKeys(formatPlayerDisplayNameIfNeeded(player.name));
}

function isSyntheticPlayer(player: SquadPlayer): boolean {
  if (player.sofascorePlayerId < 0) return true;
  const key = player.scoutlystPlayerKey ?? "";
  return key.startsWith("bulinews:") || key.startsWith("wc2026:");
}

function displayNameQuality(name: string): number {
  const formatted = formatPlayerDisplayNameIfNeeded(name);
  const parts = formatted.split(/\s+/).filter(Boolean);
  let score = formatted.length + parts.length * 8;
  if (parts.length === 1) score -= 40;
  const first = parts[0] ?? "";
  const last = parts[parts.length - 1] ?? "";
  if (/^[A-Za-z]\.?$/.test(first) || /^[A-Za-z]\.$/.test(last)) score -= 35;
  if (/[^\u0000-\u007f]/.test(formatted)) score += 4;
  return score;
}

function preferDisplayName(a: string, b: string): string {
  const aFmt = formatPlayerDisplayNameIfNeeded(a);
  const bFmt = formatPlayerDisplayNameIfNeeded(b);
  return displayNameQuality(bFmt) > displayNameQuality(aFmt) ? bFmt : aFmt;
}

function preferPosition(a: SquadPlayer, b: SquadPlayer): string {
  if (a.position === "SUB" && b.position !== "SUB") return b.position;
  if (b.position === "SUB" && a.position !== "SUB") return a.position;
  return a.position || b.position;
}

function maxNullable(a: number | null, b: number | null): number | null {
  if (a == null) return b;
  if (b == null) return a;
  return Math.max(a, b);
}

function mergeDetailStats(
  a: PlayerDisplayStat[],
  b: PlayerDisplayStat[]
): PlayerDisplayStat[] {
  if (!a.length) return b;
  if (!b.length) return a;
  const byLabel = new Map<string, PlayerDisplayStat>();
  for (const stat of [...a, ...b]) {
    const prev = byLabel.get(stat.label);
    if (!prev || (!prev.value && stat.value)) byLabel.set(stat.label, stat);
  }
  return [...byLabel.values()];
}

/** Merge two rows for the same person - keep ratings, ids, and the fuller name. */
export function mergeSquadPlayerRows(a: SquadPlayer, b: SquadPlayer): SquadPlayer {
  const aSynthetic = isSyntheticPlayer(a);
  const bSynthetic = isSyntheticPlayer(b);
  const preferBId = aSynthetic && !bSynthetic;
  const preferAId = !aSynthetic && bSynthetic;
  const idSource = preferBId ? b : preferAId ? a : a.performanceScore != null ? a : b;

  return {
    sofascorePlayerId: idSource.sofascorePlayerId,
    scoutlystPlayerKey:
      (!aSynthetic && a.scoutlystPlayerKey) ||
      (!bSynthetic && b.scoutlystPlayerKey) ||
      a.scoutlystPlayerKey ||
      b.scoutlystPlayerKey,
    name: preferDisplayName(a.name, b.name),
    position: preferPosition(a, b),
    fieldPosition: a.fieldPosition ?? b.fieldPosition,
    performanceScore: maxNullable(a.performanceScore, b.performanceScore),
    startSharePct: maxNullable(a.startSharePct, b.startSharePct),
    detailStats: mergeDetailStats(a.detailStats ?? [], b.detailStats ?? []),
    age: a.age ?? b.age,
  };
}

/** Collapse duplicate national-squad rows that share a name identity (SoFIFA vs FIFA vs Scoutlyst). */
export function dedupeSquadRosterByPlayerIdentity(players: SquadPlayer[]): SquadPlayer[] {
  const buckets = new Map<string, SquadPlayer>();

  for (const player of players) {
    const keys = rosterIdentityKeys(player);
    let bucketKey = keys[0] ?? normalizeText(player.name);
    for (const [existingKey, existing] of buckets.entries()) {
      const existingKeys = rosterIdentityKeys(existing);
      if (keys.some((key) => existingKeys.includes(key))) {
        bucketKey = existingKey;
        break;
      }
    }
    const prev = buckets.get(bucketKey);
    buckets.set(bucketKey, prev ? mergeSquadPlayerRows(prev, player) : player);
  }

  return [...buckets.values()];
}
