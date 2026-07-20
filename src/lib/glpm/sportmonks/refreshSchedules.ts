import { tryCreateServiceClient } from "../../supabase";
import { ingestMatchFromSportmonks } from "../ingestMatch";
import { createSportmonksClient } from "../../sportmonks/client";
import { DEFAULT_GLPM_SEASON_IDS_2026_27 } from "../../sportmonks/constants";

type ScheduledFixtureRef = {
  id: number;
  startingAt?: string | null;
};

export type RefreshSportmonksSchedulesOptions = {
  seasonIds: number[];
  /**
   * If true, ingest every fixture found in each season schedule payload.
   * Note: this can be large and may not fit serverless execution limits.
   */
  windowAll?: boolean;
  /** Only used when `windowAll` is false. */
  pastDays?: number;
  /** Only used when `windowAll` is false. */
  futureDays?: number;
  /** Build Layer 2 match features (expensive: pulls shots + recomputes features). */
  buildFeatures?: boolean;
  /** When building features, also build for matches marked as `flagged`. */
  forceFeatures?: boolean;
  /**
   * Safety cap across the whole run (applies before ingest begins).
   * Useful to validate the job wiring without ingesting the entire season.
   */
  maxFixtures?: number;
  /** Skip ingesting (still fetch schedules + report how many would be ingested). */
  dryRun?: boolean;
};

export type RefreshSportmonksSchedulesSummary = {
  seasonSummaries: Array<{
    seasonId: number;
    scheduledFixtures: number;
    fixturesInWindow: number;
    ingested: number;
    ok: number;
    flagged: number;
    failed: number;
  }>;
  totals: {
    scheduledFixtures: number;
    fixturesInWindow: number;
    ingested: number;
    ok: number;
    flagged: number;
    failed: number;
  };
};

export function getDefaultSportmonksSeasonIds2026_27(): number[] {
  return DEFAULT_GLPM_SEASON_IDS_2026_27;
}

function extractScheduledFixtures(payload: unknown): ScheduledFixtureRef[] {
  // Heuristic: collect numeric `id`s that look like fixtures, using the same
  // traversal approach as the existing backfill script.
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
        fixturesById.set(id, { id, startingAt });
      }
    }

    for (const [k, v] of Object.entries(obj)) walk(v, k);
  };

  walk(payload, null);
  return [...fixturesById.values()];
}

function filterFixturesByWindow(args: {
  fixtures: ScheduledFixtureRef[];
  windowAll?: boolean;
  pastDays: number;
  futureDays: number;
}): ScheduledFixtureRef[] {
  if (args.windowAll) return args.fixtures;

  const nowMs = Date.now();
  const minMs = nowMs - args.pastDays * 24 * 60 * 60 * 1000;
  const maxMs = nowMs + args.futureDays * 24 * 60 * 60 * 1000;

  return args.fixtures.filter((f) => {
    if (!f.startingAt) return true;
    const ms = Date.parse(f.startingAt);
    if (!Number.isFinite(ms)) return true;
    return ms >= minMs && ms <= maxMs;
  });
}

export async function refreshSportmonksSchedules(
  options: RefreshSportmonksSchedulesOptions
): Promise<RefreshSportmonksSchedulesSummary> {
  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const client = createSportmonksClient();

  const seasonSummaries: RefreshSportmonksSchedulesSummary["seasonSummaries"] = [];

  let scheduledFixturesTotal = 0;
  let fixturesInWindowTotal = 0;
  let ingestedTotal = 0;
  let okTotal = 0;
  let flaggedTotal = 0;
  let failedTotal = 0;

  let remainingCap = options.maxFixtures ?? Infinity;

  for (const seasonId of options.seasonIds) {
    const schedule = await client.getSeasonSchedule(seasonId);
    const scheduledFixtures = extractScheduledFixtures(schedule);

    const fixturesInWindow = filterFixturesByWindow({
      fixtures: scheduledFixtures,
      windowAll: options.windowAll,
      pastDays: options.pastDays ?? 7,
      futureDays: options.futureDays ?? 14,
    });

    scheduledFixturesTotal += scheduledFixtures.length;
    fixturesInWindowTotal += fixturesInWindow.length;

    const capApplied =
      remainingCap === Infinity ? fixturesInWindow : fixturesInWindow.slice(0, remainingCap);
    remainingCap -= capApplied.length;

    let ingested = 0;
    let ok = 0;
    let flagged = 0;
    let failed = 0;

    if (!options.dryRun) {
      for (const fixtureRef of capApplied) {
        try {
          const result = await ingestMatchFromSportmonks(supabase, client, fixtureRef.id, {
            forceFeatures: Boolean(options.buildFeatures && options.forceFeatures),
            skipFeatures: !options.buildFeatures,
          });
          ingested += 1;
          if (result.validationStatus === "flagged") flagged += 1;
          else ok += 1;
        } catch (err) {
          failed += 1;
          // Continue other fixtures.
          console.error(
            `Season ${seasonId} fixture ${fixtureRef.id} FAILED:`,
            err instanceof Error ? err.message : err
          );
        }
      }
    }

    ingestedTotal += ingested;
    okTotal += ok;
    flaggedTotal += flagged;
    failedTotal += failed;

    seasonSummaries.push({
      seasonId,
      scheduledFixtures: scheduledFixtures.length,
      fixturesInWindow: fixturesInWindow.length,
      ingested,
      ok,
      flagged,
      failed,
    });

    // If we've hit the global max fixtures cap, stop early.
    if (remainingCap <= 0) break;
  }

  return {
    seasonSummaries,
    totals: {
      scheduledFixtures: scheduledFixturesTotal,
      fixturesInWindow: fixturesInWindowTotal,
      ingested: ingestedTotal,
      ok: okTotal,
      flagged: flaggedTotal,
      failed: failedTotal,
    },
  };
}

export async function refreshSportmonksSchedulesWithDefaults(
  overrides: Partial<Omit<RefreshSportmonksSchedulesOptions, "seasonIds">> & {
    seasonIds?: number[];
  } = {}
): Promise<RefreshSportmonksSchedulesSummary> {
  return refreshSportmonksSchedules({
    seasonIds: overrides.seasonIds ?? getDefaultSportmonksSeasonIds2026_27(),
    windowAll: overrides.windowAll,
    pastDays: overrides.pastDays,
    futureDays: overrides.futureDays,
    buildFeatures: overrides.buildFeatures,
    forceFeatures: overrides.forceFeatures,
    maxFixtures: overrides.maxFixtures,
    dryRun: overrides.dryRun,
  });
}

