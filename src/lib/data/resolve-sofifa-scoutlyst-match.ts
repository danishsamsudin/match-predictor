import { formatPlayerDisplayNameIfNeeded } from "@/lib/data/format-player-display-name";
import {
  playerNameLookupKeys,
  resolveScoutlystSnapshot,
  type ScoutlystSnapshotRow,
} from "@/lib/data/resolve-squad-player-metrics";
import { normalizeText } from "@/lib/soccerdata/normalize";
import type { OfficialWcPlayer } from "@/lib/data/world-cup-2026-official-squads";

export function buildScoutlystLookupIndex(
  snapshots: Map<string, ScoutlystSnapshotRow>
): Map<string, ScoutlystSnapshotRow> {
  const index = new Map<string, ScoutlystSnapshotRow>();
  for (const row of snapshots.values()) {
    for (const key of playerNameLookupKeys(row.player_name)) {
      if (!index.has(key)) index.set(key, row);
    }
  }
  return index;
}

export function resolveScoutlystForSofifaNames(
  names: string[],
  byKey: Map<string, ScoutlystSnapshotRow>
): ScoutlystSnapshotRow | null {
  for (const name of names) {
    const direct = resolveScoutlystSnapshot(name, byKey);
    if (direct) return direct;
    for (const key of playerNameLookupKeys(name)) {
      const row = byKey.get(key);
      if (row) return row;
    }
  }
  return null;
}

export function findOfficialPlayerByNameKeys(
  names: string[],
  officialPlayers: OfficialWcPlayer[]
): OfficialWcPlayer | null {
  const wanted = new Set<string>();
  for (const name of names) {
    for (const key of playerNameLookupKeys(formatPlayerDisplayNameIfNeeded(name))) {
      wanted.add(key);
    }
  }
  for (const player of officialPlayers) {
    const display = formatPlayerDisplayNameIfNeeded(player.name);
    for (const key of playerNameLookupKeys(display)) {
      if (wanted.has(key)) return player;
    }
    if (wanted.has(normalizeText(display))) return player;
  }
  return null;
}
