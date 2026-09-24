import { formatPlayerDisplayNameIfNeeded } from "@/lib/data/format-player-display-name";
import { playersShareRosterIdentity } from "@/lib/data/dedupe-squad-roster";
import { normalizeText } from "@/lib/soccerdata/normalize";
import type { SquadPlayer } from "@/lib/types/team-comparison";

export function playerNormKey(name: string): string {
  return normalizeText(formatPlayerDisplayNameIfNeeded(name));
}

/** Drop duplicate sofascore ids and normalized display names (first wins). */
export function dedupeSquadPlayersById(players: SquadPlayer[]): SquadPlayer[] {
  const seenIds = new Set<number>();
  const seenNames = new Set<string>();
  const out: SquadPlayer[] = [];

  for (const player of players) {
    const norm = playerNormKey(player.name);
    if (seenIds.has(player.sofascorePlayerId) || seenNames.has(norm)) continue;
    seenIds.add(player.sofascorePlayerId);
    seenNames.add(norm);
    out.push(player);
  }

  return out;
}

export type AlignStartersOptions = {
  /**
   * When false (default), only emit players that exist on `roster` so XI
   * `<select>` values always match an option. When true, keep unmatched
   * starter rows (used by pickUniqueStarters backfill).
   */
  allowUnlisted?: boolean;
};

/**
 * Remap starters onto the finalized roster so XI slot ids always exist in
 * `<select>` options. Stale ids after identity merge otherwise render as the
 * first option (usually the GK) in every broken slot.
 */
export function alignStartersToRoster(
  starters: SquadPlayer[],
  roster: SquadPlayer[],
  limit = 11,
  options?: AlignStartersOptions
): SquadPlayer[] {
  const allowUnlisted = options?.allowUnlisted === true;
  const rosterById = new Set(roster.map((p) => p.sofascorePlayerId));
  const usedIds = new Set<number>();
  const out: SquadPlayer[] = [];

  const take = (player: SquadPlayer | undefined | null): boolean => {
    if (!player || out.length >= limit) return false;
    if (!allowUnlisted && !rosterById.has(player.sofascorePlayerId)) return false;
    if (usedIds.has(player.sofascorePlayerId)) return false;
    usedIds.add(player.sofascorePlayerId);
    out.push(player);
    return true;
  };

  for (const starter of starters) {
    if (out.length >= limit) break;

    const byId = roster.find(
      (p) =>
        p.sofascorePlayerId === starter.sofascorePlayerId &&
        !usedIds.has(p.sofascorePlayerId)
    );
    if (take(byId)) continue;

    const byExact = roster.find(
      (p) =>
        !usedIds.has(p.sofascorePlayerId) &&
        playerNormKey(p.name) === playerNormKey(starter.name)
    );
    if (take(byExact)) continue;

    const byIdentity = roster.find(
      (p) =>
        !usedIds.has(p.sofascorePlayerId) &&
        playersShareRosterIdentity(p.name, starter.name)
    );
    if (take(byIdentity)) continue;

    if (allowUnlisted) take(starter);
  }

  for (const player of roster) {
    if (out.length >= limit) break;
    take(player);
  }

  return out;
}

/** Build up to `limit` unique starters, backfilling from `pool` when needed. */
export function pickUniqueStarters(
  starters: SquadPlayer[],
  pool: SquadPlayer[],
  limit = 11
): SquadPlayer[] {
  return alignStartersToRoster(dedupeSquadPlayersById(starters), pool, limit, {
    allowUnlisted: true,
  });
}
