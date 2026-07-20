/**
 * Wyscout API payload types (v2/v3 subset used by GLPM Layer 1).
 */

export type WyscoutTag = { id: number; tag?: { label?: string } };

export type WyscoutPosition = { x: number; y: number };

export type WyscoutArea = {
  id?: number;
  name?: string;
  alpha3code?: string;
};

export type WyscoutRole = {
  code?: string;
  name?: string;
};

export type WyscoutTeamPayload = {
  wyId: number;
  name: string;
  officialName?: string;
  city?: string;
  area?: WyscoutArea;
  stadiumName?: string;
  stadiumCapacity?: number;
  coach?: { wyId?: number; shortName?: string };
  [key: string]: unknown;
};

export type WyscoutPlayerPayload = {
  wyId: number;
  shortName?: string;
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  height?: number;
  foot?: string;
  role?: WyscoutRole;
  currentTeamId?: number;
  status?: string;
  [key: string]: unknown;
};

export type WyscoutCompetitionPayload = {
  wyId: number;
  name: string;
  area?: WyscoutArea;
  format?: string;
  [key: string]: unknown;
};

export type WyscoutSeasonPayload = {
  wyId: number;
  name?: string;
  startDate?: string;
  endDate?: string;
  active?: boolean;
  competitionId?: number;
  [key: string]: unknown;
};

export type WyscoutMatchTeamSide = {
  teamId: number;
  score?: number;
  side?: string;
};

export type WyscoutMatchPayload = {
  wyId: number;
  competitionId?: number;
  seasonId?: number;
  gameweek?: number;
  label?: string;
  date?: string;
  dateutc?: string;
  venue?: string;
  status?: string;
  duration?: string | number;
  referee?: { wyId?: number };
  teamsData?: Record<string, WyscoutMatchTeamSide & { teamId: number }>;
  home?: { teamId?: number; score?: number };
  away?: { teamId?: number; score?: number };
  [key: string]: unknown;
};

export type WyscoutAdvancedStatsTotal = {
  goals?: number;
  shots?: number;
  shotsOnTarget?: number;
  xgShot?: number;
  xgShotAgainst?: number;
  ppda?: number;
  touchInBox?: number;
  progressiveRun?: number;
  passesToFinalThird?: number;
  crosses?: number;
  throughPasses?: number;
  passes?: number;
  successfulPasses?: number;
  interceptions?: number;
  clearances?: number;
  recoveries?: number;
  pressingDuels?: number;
  defensiveActions?: number;
  dangerousOpponentHalfRecoveries?: number;
  gkSaves?: number;
  postShotXg?: number;
  postShotXgAgainst?: number;
  xCG?: number;
  xgConceded?: number;
  [key: string]: unknown;
};

export type WyscoutAdvancedStatsAverage = {
  possessionPercent?: number;
  [key: string]: unknown;
};

export type WyscoutTeamAdvancedStatsSide = {
  teamId: number;
  total?: WyscoutAdvancedStatsTotal;
  average?: WyscoutAdvancedStatsAverage;
  percent?: Record<string, number>;
};

export type WyscoutMatchAdvancedStatsPayload = {
  matchId?: number;
  teams?: Record<string, WyscoutTeamAdvancedStatsSide>;
  /** Some packs return a flat array of team sides */
  general?: WyscoutTeamAdvancedStatsSide[];
  [key: string]: unknown;
};

export type WyscoutEventPayload = {
  id: number;
  playerId?: number;
  teamId?: number;
  matchId?: number;
  matchPeriod?: string;
  eventSec?: number;
  eventId?: number;
  eventName?: string;
  subEventId?: number;
  subEventName?: string;
  positions?: WyscoutPosition[];
  tags?: WyscoutTag[];
  /** Pre-shot xG when present on shot events / enriched feeds */
  xg?: number;
  /** Post-shot xG / PSxG / xCG when present */
  postShotXg?: number;
  psxg?: number;
  xCG?: number;
  [key: string]: unknown;
};

export type WyscoutMatchEventsPayload = {
  events: WyscoutEventPayload[];
  match?: WyscoutMatchPayload;
  teams?: Record<string, WyscoutTeamPayload>;
  players?: Record<string, WyscoutPlayerPayload[]>;
  [key: string]: unknown;
};

/** Wyscout shot / free-kick tags used by GLPM extractors */
export const WYSCOUT_TAG = {
  GOAL: 101,
  OWN_GOAL: 102,
  OPPORTUNITY: 201,
  LEFT_FOOT: 401,
  RIGHT_FOOT: 402,
  HEAD_BODY: 403,
  BLOCKED: 2101,
  COUNTER_ATTACK: 1901,
  ACCURATE: 1801,
  NOT_ACCURATE: 1802,
} as const;

export const WYSCOUT_EVENT = {
  DUEL: 1,
  FOUL: 2,
  FREE_KICK: 3,
  GOALKEEPER_LEAVING_LINE: 6,
  OTHERS_ON_BALL: 7,
  PASS: 8,
  SAVE_ATTEMPT: 9,
  SHOT: 10,
} as const;

export const WYSCOUT_SUB_EVENT = {
  PENALTY: 35,
  FREE_KICK_SHOT: 33,
  SHOT: 100,
  HAND_PASS: 11,
  HIGH_PASS: 80,
  LAUNCH: 84,
  SMART_PASS: 86,
  CROSS: 80,
  CLEARANCE: 71,
  INTERCEPTION: 70,
  AIR_DUEL: 10,
  GROUND_DUEL: 11,
} as const;

/** Goal-mouth / placement zone tags 1201–1223 */
export function isGoalZoneTag(tagId: number): boolean {
  return tagId >= 1201 && tagId <= 1223;
}

/** On-target goal zones: 1201–1209 */
export function isOnTargetZoneTag(tagId: number): boolean {
  return tagId >= 1201 && tagId <= 1209;
}
