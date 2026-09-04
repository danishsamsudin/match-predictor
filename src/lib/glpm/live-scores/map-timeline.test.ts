import { describe, expect, it } from "vitest";
import type { SmEvent } from "@/lib/sportmonks/types";
import {
  formatScorerLabel,
  goalScorersFromTimeline,
  mapFixtureTimeline,
  mapSideMetrics,
} from "./map-timeline";

describe("live score timeline mapping", () => {
  it("maps goals with assists and sorts by minute", () => {
    const events: SmEvent[] = [
      {
        id: 2,
        type_id: 14,
        participant_id: 19,
        player_name: "Saka",
        related_player_name: "Ødegaard",
        minute: 63,
      },
      {
        id: 1,
        type_id: 19,
        participant_id: 18,
        player_name: "Caicedo",
        minute: 28,
      },
      {
        id: 3,
        type_id: 18,
        participant_id: 19,
        player_name: "Trossard",
        related_player_name: "Martinelli",
        minute: 58,
      },
    ];

    const timeline = mapFixtureTimeline(events, 19, 18);
    expect(timeline.map((e) => e.kind)).toEqual(["yellow_card", "substitution", "goal"]);
    expect(timeline[2]).toMatchObject({
      kind: "goal",
      side: "home",
      playerName: "Saka",
      relatedPlayerName: "Ødegaard",
      clockLabel: "63'",
    });
  });

  it("maps possession and xG metrics", () => {
    const metrics = mapSideMetrics(
      [
        { type_id: 45, participant_id: 19, data: { value: 58 } },
        { type_id: 42, participant_id: 19, data: { value: 11 } },
        { type_id: 86, participant_id: 19, data: { value: 4 } },
        { type_id: 34, participant_id: 19, data: { value: 5 } },
      ],
      [{ type_id: 5304, participant_id: 19, data: { value: 1.42 } }],
      19
    );
    expect(metrics).toEqual({
      possessionPct: 58,
      shots: 11,
      shotsOnTarget: 4,
      corners: 5,
      xg: 1.42,
    });
  });

  it("formats goal scorers with clock and penalty/own-goal tags", () => {
    const timeline = mapFixtureTimeline(
      [
        {
          id: 1,
          type_id: 14,
          participant_id: 19,
          player_name: "Saka",
          minute: 12,
        },
        {
          id: 2,
          type_id: 15,
          participant_id: 18,
          player_name: "Colwill",
          minute: 40,
        },
        {
          id: 3,
          type_id: 16,
          participant_id: 19,
          player_name: "Havertz",
          minute: 70,
        },
      ],
      19,
      18
    );
    const lines = goalScorersFromTimeline(timeline);
    expect(lines.map(formatScorerLabel)).toEqual([
      "Saka 12'",
      "Colwill (OG) 40'",
      "Havertz (Pen) 70'",
    ]);
  });
});
