/**
 * Merge `/expected/fixtures` rows into fixture.xGFixture.
 *
 * SportMonks xG Basic often leaves `include=xGFixture` empty; the Expected
 * endpoints still return type 5304 (and related) after FT.
 */

import type { SportmonksClient } from "./client";
import type { SmFixture, SmXgFixtureRow } from "./types";

export function mergeExpectedRowsIntoFixture(
  fixture: SmFixture,
  rows: SmXgFixtureRow[]
): SmFixture {
  if (!rows.length) return fixture;
  const existing = fixture.xGFixture ?? [];
  const seen = new Set(
    existing.map(
      (r) =>
        `${r.type_id ?? ""}:${r.participant_id ?? ""}:${r.fixture_id ?? fixture.id}`
    )
  );
  const added: SmXgFixtureRow[] = [];
  for (const row of rows) {
    const key = `${row.type_id ?? ""}:${row.participant_id ?? ""}:${row.fixture_id ?? fixture.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    added.push({
      ...row,
      fixture_id: row.fixture_id ?? fixture.id,
    });
  }
  if (!added.length) return fixture;
  return {
    ...fixture,
    xGFixture: [...existing, ...added],
  };
}

/** Group expected API rows by fixture_id. */
export function groupExpectedRowsByFixtureId(
  rows: SmXgFixtureRow[]
): Map<number, SmXgFixtureRow[]> {
  const map = new Map<number, SmXgFixtureRow[]>();
  for (const row of rows) {
    const fid = Number(row.fixture_id);
    if (!Number.isFinite(fid)) continue;
    const list = map.get(fid);
    if (list) list.push(row);
    else map.set(fid, [row]);
  }
  return map;
}

/**
 * Fetch Expected stats for the given fixtures and attach as xGFixture.
 * No-op when the list is empty. Failures propagate (caller may catch).
 */
export async function attachExpectedXgToFixtures(
  client: SportmonksClient,
  fixtures: SmFixture[],
  options?: { maxScanPages?: number }
): Promise<SmFixture[]> {
  if (!fixtures.length) return fixtures;
  const ids = fixtures.map((f) => f.id).filter((id) => Number.isFinite(id) && id > 0);
  if (!ids.length) return fixtures;

  const rows = await client.getExpectedFixtureStatsByFixtureIds(ids, {
    maxScanPages: options?.maxScanPages,
  });
  if (!rows.length) return fixtures;

  const byFid = groupExpectedRowsByFixtureId(rows);
  return fixtures.map((fixture) => {
    const extra = byFid.get(fixture.id);
    if (!extra?.length) return fixture;
    return mergeExpectedRowsIntoFixture(fixture, extra);
  });
}
