/**
 * Extract fixture refs from SportMonks schedules/seasons payloads.
 */

export type ScheduledFixtureRef = {
  id: number;
  startingAt?: string | null;
  stateId?: number | null;
  stateName?: string | null;
};

/** SportMonks state_id values for finished fixtures (FT, AET, pens, etc.). */
export const SM_FIXTURE_STATE_FINISHED = new Set([
  5, // Full Time
  7, // After Extra Time
  8, // After Penalties / Full Time after penalties
  11, // Awarded
  12, // Walkover
]);

const FINISHED_STATE_NAMES = new Set([
  "full time",
  "ft",
  "after extra time",
  "aet",
  "after penalties",
  "ap",
  "awarded",
  "walkover",
]);

export function isFinishedFixture(ref: ScheduledFixtureRef): boolean {
  if (ref.stateId != null && SM_FIXTURE_STATE_FINISHED.has(ref.stateId)) return true;
  const name = ref.stateName?.trim().toLowerCase();
  return name != null && FINISHED_STATE_NAMES.has(name);
}

export function extractScheduledFixtures(payload: unknown): ScheduledFixtureRef[] {
  const fixturesById = new Map<number, ScheduledFixtureRef>();

  const walk = (node: unknown, parentKey: string | null) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, parentKey);
      return;
    }

    const obj = node as Record<string, unknown>;
    const id = obj.id;

    if (typeof id === "number") {
      const name = typeof obj.name === "string" ? obj.name : "";
      const startingAt = typeof obj.starting_at === "string" ? obj.starting_at : null;
      const underFixturesArray = parentKey === "fixtures";
      const looksLikeFixture =
        underFixturesArray ||
        (typeof obj.starting_at === "string" &&
          obj.starting_at.includes(":") &&
          (/\bvs\b/i.test(name) || obj.state_id != null || obj.round_id != null));

      if (looksLikeFixture) {
        const stateObj = obj.state as { id?: number; name?: string; short_name?: string } | undefined;
        fixturesById.set(id, {
          id,
          startingAt,
          stateId:
            typeof obj.state_id === "number"
              ? obj.state_id
              : typeof stateObj?.id === "number"
                ? stateObj.id
                : null,
          stateName:
            typeof stateObj?.name === "string"
              ? stateObj.name
              : typeof stateObj?.short_name === "string"
                ? stateObj.short_name
                : null,
        });
      }
    }

    for (const [k, v] of Object.entries(obj)) walk(v, k);
  };

  walk(payload, null);
  return [...fixturesById.values()];
}

export function extractFixtureIds(
  payload: unknown,
  options?: { completedOnly?: boolean }
): number[] {
  let fixtures = extractScheduledFixtures(payload);
  if (options?.completedOnly) {
    fixtures = fixtures.filter(isFinishedFixture);
  }
  return fixtures.map((f) => f.id);
}
