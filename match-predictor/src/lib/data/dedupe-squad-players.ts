import { formatPlayerDisplayNameIfNeeded } from "@/lib/data/format-player-display-name";
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

/** Build up to `limit` unique starters, backfilling from `pool` when needed. */
export function pickUniqueStarters(
  starters: SquadPlayer[],
  pool: SquadPlayer[],
  limit = 11
): SquadPlayer[] {
  const picked = dedupeSquadPlayersById(starters).slice(0, limit);
  if (picked.length >= limit) return picked;

  const usedIds = new Set(picked.map((p) => p.sofascorePlayerId));
  const usedNames = new Set(picked.map((p) => playerNormKey(p.name)));

  for (const player of pool) {
    if (picked.length >= limit) break;
    const norm = playerNormKey(player.name);
    if (usedIds.has(player.sofascorePlayerId) || usedNames.has(norm)) continue;
    picked.push(player);
    usedIds.add(player.sofascorePlayerId);
    usedNames.add(norm);
  }

  return picked;
}
