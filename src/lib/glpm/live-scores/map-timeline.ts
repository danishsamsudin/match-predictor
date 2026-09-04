import { parseStatValue, SM_STAT_TYPE } from "@/lib/sportmonks/statTypes";
import type { SmEvent, SmFixture, SmStatistic, SmXgFixtureRow } from "@/lib/sportmonks/types";
import {
  isGoalLikeKind,
  LIVE_TIMELINE_EVENT_TYPES,
  timelineKindFromTypeId,
  type LiveTimelineKind,
} from "./event-types";
import type {
  LiveScoreSide,
  LiveScoreSideMetrics,
  LiveScoreTimelineEvent,
} from "./types";

function emptyMetrics(): LiveScoreSideMetrics {
  return {
    possessionPct: null,
    shots: null,
    shotsOnTarget: null,
    corners: null,
    xg: null,
  };
}

export function formatEventClock(minute: number, extraMinute: number | null): string {
  if (extraMinute != null && extraMinute > 0) return `${minute}+${extraMinute}'`;
  return `${minute}'`;
}

function eventMinuteSortKey(minute: number, extraMinute: number | null): number {
  return minute * 100 + (extraMinute ?? 0);
}

export function mapSmEventToTimeline(
  event: SmEvent,
  homeTeamSmId: number,
  awayTeamSmId: number
): LiveScoreTimelineEvent | null {
  const kind = timelineKindFromTypeId(event.type_id);
  if (!kind) return null;
  if (event.type_id != null && !LIVE_TIMELINE_EVENT_TYPES.has(event.type_id)) return null;

  const minute = event.minute;
  if (minute == null || !Number.isFinite(minute)) return null;

  const participantId = event.participant_id ?? null;
  let side: LiveScoreSide = "home";
  if (participantId === awayTeamSmId) side = "away";
  else if (participantId === homeTeamSmId) side = "home";
  else if (participantId != null) {
    // Unknown participant - still show, default home bias avoided by comparing ids loosely
    side = "home";
  }

  const extraMinute =
    event.extra_minute != null && Number.isFinite(event.extra_minute)
      ? event.extra_minute
      : null;

  const playerName = event.player_name?.trim() || null;
  const related =
    event.related_player_name?.trim() ||
    null;

  return {
    id: event.id,
    kind,
    side,
    minute,
    extraMinute,
    clockLabel: formatEventClock(minute, extraMinute),
    playerName,
    relatedPlayerName: related,
    info: event.info?.trim() || event.addition?.trim() || null,
  };
}

export function mapFixtureTimeline(
  events: SmEvent[] | undefined,
  homeTeamSmId: number,
  awayTeamSmId: number
): LiveScoreTimelineEvent[] {
  const mapped = (events ?? [])
    .map((e) => mapSmEventToTimeline(e, homeTeamSmId, awayTeamSmId))
    .filter((e): e is LiveScoreTimelineEvent => e != null);

  mapped.sort((a, b) => {
    const ka = eventMinuteSortKey(a.minute, a.extraMinute);
    const kb = eventMinuteSortKey(b.minute, b.extraMinute);
    if (ka !== kb) return ka - kb;
    return a.id - b.id;
  });
  return mapped;
}

function statsMapForParticipant(
  statistics: SmStatistic[] | undefined,
  participantId: number
): Map<number, number> {
  const map = new Map<number, number>();
  for (const row of statistics ?? []) {
    if (row.participant_id !== participantId) continue;
    const value = parseStatValue(row.data ?? row.value);
    if (value == null) continue;
    map.set(row.type_id, value);
  }
  return map;
}

function xgFromFixtureRows(
  rows: SmXgFixtureRow[] | undefined,
  participantId: number
): number | null {
  for (const row of rows ?? []) {
    if (row.participant_id !== participantId) continue;
    if (row.type_id !== SM_STAT_TYPE.EXPECTED_GOALS) continue;
    const value = parseStatValue(row.data ?? row.value);
    if (value != null) return value;
  }
  return null;
}

export function mapSideMetrics(
  statistics: SmStatistic[] | undefined,
  xgRows: SmXgFixtureRow[] | undefined,
  participantId: number
): LiveScoreSideMetrics {
  const map = statsMapForParticipant(statistics, participantId);
  const xgStat = map.get(SM_STAT_TYPE.EXPECTED_GOALS) ?? null;
  const xgFixture = xgFromFixtureRows(xgRows, participantId);
  return {
    possessionPct: map.get(SM_STAT_TYPE.BALL_POSSESSION) ?? null,
    shots: map.get(SM_STAT_TYPE.SHOTS_TOTAL) ?? null,
    shotsOnTarget: map.get(SM_STAT_TYPE.SHOTS_ON_TARGET) ?? null,
    corners: map.get(SM_STAT_TYPE.CORNERS) ?? null,
    xg: xgFixture ?? xgStat,
  };
}

export function mapFixtureLiveExtras(
  fixture: Pick<SmFixture, "events" | "statistics" | "xGFixture">,
  homeTeamSmId: number,
  awayTeamSmId: number
): {
  timeline: LiveScoreTimelineEvent[];
  homeMetrics: LiveScoreSideMetrics;
  awayMetrics: LiveScoreSideMetrics;
} {
  return {
    timeline: mapFixtureTimeline(fixture.events, homeTeamSmId, awayTeamSmId),
    homeMetrics: mapSideMetrics(fixture.statistics, fixture.xGFixture, homeTeamSmId),
    awayMetrics: mapSideMetrics(fixture.statistics, fixture.xGFixture, awayTeamSmId),
  };
}

export function emptySideMetrics(): LiveScoreSideMetrics {
  return emptyMetrics();
}

export type GoalScorerLine = {
  playerName: string;
  clockLabel: string;
  kind: LiveTimelineKind;
  side: LiveScoreSide;
};

export function goalScorersFromTimeline(
  events: LiveScoreTimelineEvent[]
): GoalScorerLine[] {
  return events
    .filter((event) => isGoalLikeKind(event.kind))
    .map((event) => ({
      playerName: event.playerName?.trim() || "Goal",
      clockLabel: event.clockLabel,
      kind: event.kind,
      side: event.side,
    }));
}

export function formatScorerLabel(line: GoalScorerLine): string {
  const suffix =
    line.kind === "own_goal"
      ? " (OG)"
      : line.kind === "penalty" || line.kind === "pen_shootout_goal"
        ? " (Pen)"
        : "";
  return `${line.playerName}${suffix} ${line.clockLabel}`;
}

export function timelineKindLabel(kind: LiveTimelineKind): string {
  switch (kind) {
    case "goal":
      return "Goal";
    case "own_goal":
      return "Own goal";
    case "penalty":
      return "Penalty";
    case "missed_penalty":
      return "Missed pen";
    case "substitution":
      return "Sub";
    case "yellow_card":
      return "Yellow";
    case "red_card":
      return "Red";
    case "yellow_red_card":
      return "Second yellow";
    case "var":
      return "VAR";
    case "pen_shootout_goal":
      return "Pen scored";
    case "pen_shootout_miss":
      return "Pen missed";
  }
}
