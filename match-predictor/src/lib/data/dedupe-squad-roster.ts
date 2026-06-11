import { formatPlayerDisplayNameIfNeeded } from "@/lib/data/format-player-display-name";
import { playerNameLookupKeys } from "@/lib/data/resolve-squad-player-metrics";
import { normalizeText } from "@/lib/soccerdata/normalize";
import type { SquadPlayer } from "@/lib/types/team-comparison";

function rosterIdentityKeys(player: SquadPlayer): string[] {
  return playerNameLookupKeys(formatPlayerDisplayNameIfNeeded(player.name));
}

function pickPreferredPlayer(current: SquadPlayer, candidate: SquadPlayer): SquadPlayer {
  const currentScore = current.performanceScore ?? 0;
  const candidateScore = candidate.performanceScore ?? 0;
  if (candidateScore > currentScore) return candidate;
  if (candidateScore < currentScore) return current;
  if (current.position === "SUB" && candidate.position !== "SUB") return candidate;
  if (candidate.position === "SUB" && current.position !== "SUB") return current;
  return current.name.length <= candidate.name.length ? current : candidate;
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
    buckets.set(bucketKey, prev ? pickPreferredPlayer(prev, player) : player);
  }

  return [...buckets.values()];
}
