/**
 * SportMonks football event type_ids used on the live match timeline.
 * @see https://docs.sportmonks.com/v3/definitions/types/events
 */
export const SM_EVENT_TYPE = {
  VAR: 10,
  GOAL: 14,
  OWN_GOAL: 15,
  PENALTY: 16,
  MISSED_PENALTY: 17,
  SUBSTITUTION: 18,
  YELLOW_CARD: 19,
  RED_CARD: 20,
  YELLOW_RED_CARD: 21,
  PEN_SHOOTOUT_MISS: 22,
  PEN_SHOOTOUT_GOAL: 23,
} as const;

/** Events shown on the home live timeline (main broadcast-style moments). */
export const LIVE_TIMELINE_EVENT_TYPES = new Set<number>([
  SM_EVENT_TYPE.GOAL,
  SM_EVENT_TYPE.OWN_GOAL,
  SM_EVENT_TYPE.PENALTY,
  SM_EVENT_TYPE.MISSED_PENALTY,
  SM_EVENT_TYPE.SUBSTITUTION,
  SM_EVENT_TYPE.YELLOW_CARD,
  SM_EVENT_TYPE.RED_CARD,
  SM_EVENT_TYPE.YELLOW_RED_CARD,
  SM_EVENT_TYPE.VAR,
  SM_EVENT_TYPE.PEN_SHOOTOUT_GOAL,
  SM_EVENT_TYPE.PEN_SHOOTOUT_MISS,
]);

export type LiveTimelineKind =
  | "goal"
  | "own_goal"
  | "penalty"
  | "missed_penalty"
  | "substitution"
  | "yellow_card"
  | "red_card"
  | "yellow_red_card"
  | "var"
  | "pen_shootout_goal"
  | "pen_shootout_miss";

export function timelineKindFromTypeId(typeId: number | null | undefined): LiveTimelineKind | null {
  switch (typeId) {
    case SM_EVENT_TYPE.GOAL:
      return "goal";
    case SM_EVENT_TYPE.OWN_GOAL:
      return "own_goal";
    case SM_EVENT_TYPE.PENALTY:
      return "penalty";
    case SM_EVENT_TYPE.MISSED_PENALTY:
      return "missed_penalty";
    case SM_EVENT_TYPE.SUBSTITUTION:
      return "substitution";
    case SM_EVENT_TYPE.YELLOW_CARD:
      return "yellow_card";
    case SM_EVENT_TYPE.RED_CARD:
      return "red_card";
    case SM_EVENT_TYPE.YELLOW_RED_CARD:
      return "yellow_red_card";
    case SM_EVENT_TYPE.VAR:
      return "var";
    case SM_EVENT_TYPE.PEN_SHOOTOUT_GOAL:
      return "pen_shootout_goal";
    case SM_EVENT_TYPE.PEN_SHOOTOUT_MISS:
      return "pen_shootout_miss";
    default:
      return null;
  }
}

export function isGoalLikeKind(kind: LiveTimelineKind): boolean {
  return (
    kind === "goal" ||
    kind === "own_goal" ||
    kind === "penalty" ||
    kind === "pen_shootout_goal"
  );
}
