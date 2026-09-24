import { formatPlayerDisplayNameIfNeeded } from "@/lib/data/format-player-display-name";
import { normalizeText } from "@/lib/soccerdata/normalize";
import type { PlayerDisplayStat, SquadPlayer } from "@/lib/types/team-comparison";

function normalizedNameParts(displayName: string): string[] {
  return normalizeText(formatPlayerDisplayNameIfNeeded(displayName))
    .split(" ")
    .filter(Boolean);
}

/** Single-token or initial+surname labels (also after "J. Kimmich" → "Kimmich J."). */
function isShortPlayerLabel(parts: string[]): boolean {
  if (parts.length <= 1) return true;
  if (parts.length === 2 && parts.some((p) => p.length <= 2)) return true;
  return false;
}

/** Prefer a real surname token over a flipped initial ("kimmich j" → kimmich). */
function primarySurname(parts: string[]): string | null {
  const substantive = parts.filter((p) => p.length > 2);
  if (substantive.length) return substantive[substantive.length - 1]!;
  return parts[parts.length - 1] ?? null;
}

/**
 * Identity keys for national-roster merge. Intentionally stricter than
 * playerNameLookupKeys: bare first-name / surname matching collapses distinct
 * players and leaves stale starter ids that the XI picker then renders as the
 * first roster option (often the GK).
 */
export function rosterIdentityKeys(displayName: string): string[] {
  const parts = normalizedNameParts(displayName);
  if (!parts.length) return [];
  const norm = parts.join(" ");
  if (parts.length === 1) return [norm];

  const first = parts[0]!;
  const last = parts[parts.length - 1]!;
  const surname = primarySurname(parts);
  const keys = [norm, `${first} ${last}`, `${last} ${first}`];
  if (surname && surname !== first && surname !== last) {
    keys.push(surname);
  }
  return [...new Set(keys.filter(Boolean))];
}

export function playersShareRosterIdentity(a: string, b: string): boolean {
  const aKeys = rosterIdentityKeys(a);
  const bKeySet = new Set(rosterIdentityKeys(b));
  if (aKeys.some((key) => bKeySet.has(key))) return true;

  const aParts = normalizedNameParts(a);
  const bParts = normalizedNameParts(b);
  if (!aParts.length || !bParts.length) return false;

  const aLast = primarySurname(aParts);
  const bLast = primarySurname(bParts);
  if (!aLast || !bLast || aLast !== bLast) return false;

  const aShort = isShortPlayerLabel(aParts);
  const bShort = isShortPlayerLabel(bParts);

  // O. Thill vs V. Thill (or P. Sucic vs L. Sucic) are different people.
  if (aShort && bShort) {
    const aInitial = aParts.find((p) => p.length <= 2) ?? null;
    const bInitial = bParts.find((p) => p.length <= 2) ?? null;
    if (aInitial && bInitial) return aInitial === bInitial;
    return aParts.join(" ") === bParts.join(" ");
  }

  // Allow "L. Ostigard" / "Ostigard" ↔ full names, but never merge two full
  // names that only share a surname (Dimitrov / Ivanov pairs).
  return aShort || bShort;
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
    const keys = rosterIdentityKeys(player.name);
    let bucketKey = keys[0] ?? normalizeText(player.name);
    for (const [existingKey, existing] of buckets.entries()) {
      if (playersShareRosterIdentity(player.name, existing.name)) {
        bucketKey = existingKey;
        break;
      }
    }
    const prev = buckets.get(bucketKey);
    buckets.set(bucketKey, prev ? mergeSquadPlayerRows(prev, player) : player);
  }

  return [...buckets.values()];
}
