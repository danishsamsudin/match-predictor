/**
 * Pure helpers for scoped hub queries (teams, weather dedupe).
 */

export function uniquePositiveIds(ids: Iterable<number | null | undefined>): number[] {
  const out = new Set<number>();
  for (const id of ids) {
    if (id != null && Number.isFinite(id) && id > 0) out.add(id);
  }
  return [...out];
}

/** Stable key so matches sharing a home city/venue on the same day share one weather lookup. */
export function weatherDedupeKey(input: {
  matchDate: string | null;
  cityName?: string | null;
  venueName?: string | null;
  venueSmId?: number | null;
}): string {
  const date = (input.matchDate ?? "").slice(0, 10);
  const place =
    (input.cityName ?? "").trim().toLowerCase() ||
    (input.venueName ?? "").trim().toLowerCase() ||
    (input.venueSmId != null ? `venue:${input.venueSmId}` : "unknown");
  return `${place}|${date}`;
}

export type WeatherGroupMember<T> = {
  key: string;
  items: T[];
};

/** Group items by weather dedupe key (preserves first-seen key order). */
export function groupByWeatherKey<T>(
  items: T[],
  keyOf: (item: T) => string
): WeatherGroupMember<T>[] {
  const map = new Map<string, T[]>();
  const order: string[] = [];
  for (const item of items) {
    const key = keyOf(item);
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(item);
  }
  return order.map((key) => ({ key, items: map.get(key)! }));
}
