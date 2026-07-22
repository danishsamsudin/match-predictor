/**
 * SportMonks in-play state_ids (subset used to gate live polling).
 * See https://docs.sportmonks.com/v3/entities/state
 */
export const SM_FIXTURE_STATE_INPLAY = new Set([
  2, // INPLAY_1ST_HALF
  3, // HALF TIME
  4, // INPLAY_2ND_HALF
  6, // EXTRA TIME
  9, // BREAK (ET)
  21, // INPLAY_ET
  22, // INPLAY_PENALTIES
  23, // PENDING (sometimes used mid-window)
]);

/** Pre-match / soft live window states we still want to poll for. */
export const SM_FIXTURE_STATE_LIVE_WINDOW = new Set([
  1, // Not Started (within 15m of kickoff via livescores window)
  ...SM_FIXTURE_STATE_INPLAY,
]);

/** How far before kickoff we start polling SportMonks livescores. */
export const LIVE_POLL_LEAD_MS = 15 * 60 * 1000;
/** How long after kickoff we keep polling if state is not yet finished. */
export const LIVE_POLL_AFTER_KICKOFF_MS = 130 * 60 * 1000;

export const PLAN_LIVESCORE_INCLUDE = [
  "scores",
  "participants",
  "venue",
  "state",
  "league",
  "round",
  "periods",
  "events",
  "events.type",
  "statistics",
  "xGFixture",
].join(";");

/** Filter livescores events to the main timeline types (goals, cards, subs, pens, VAR). */
export const LIVESCORE_EVENT_TYPE_FILTER =
  "eventTypes:10,14,15,16,17,18,19,20,21,22,23";
