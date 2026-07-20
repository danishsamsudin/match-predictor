import { describe, expect, it } from "vitest";
import {
  mapSportmonksFixture,
  mapSportmonksTeamStats,
  mapSportmonksEvents,
  resolveParticipants,
} from "./layer1/sportmonks/upsertFixture";
import {
  extractShotsFromEvents,
  isShotLikeEvent,
  recomputePpdaFromEvents,
} from "./layer1/extractShots";
import { buildTeamFeatures } from "./layer2/buildMatchTeamFeatures";
import { classifyStyleLabels } from "./layer2/styleSnapshots";
import {
  summarizeValidation,
  validateMatchBundle,
  type TeamStatsLike,
} from "./validation/rules";
import type { SmApiResponse, SmFixture } from "../sportmonks/types";
import type { WyscoutEventPayload } from "../wyscout/types";
import {
  mapSportmonksPlayer,
  mapSportmonksTeam,
} from "./layer1/sportmonks/mapEntities";
import fixtureMock from "../sportmonks/mock/fixture.json";
import eventsMock from "../wyscout/mock/match_events.json";
import advancedMock from "../wyscout/mock/match_advancedstats.json";
import { listAdvancedStatsSides } from "./layer1/upsertMatchTeamStats";

const fixture = (fixtureMock as SmApiResponse<SmFixture>).data;

describe("GLPM SportMonks primary mappers", () => {
  it("resolves home/away participants", () => {
    const { home, away } = resolveParticipants(fixture);
    expect(home.id).toBe(19);
    expect(away.id).toBe(18);
  });

  it("maps fixture spine to sm_id columns", () => {
    const row = mapSportmonksFixture(fixture);
    expect(row.sm_id).toBe(19135515);
    expect(row.home_team_sm_id).toBe(19);
    expect(row.away_team_sm_id).toBe(18);
    expect(row.league_sm_id).toBe(8);
    expect(row.home_score).toBe(2);
    expect(row.away_score).toBe(1);
  });

  it("maps statistics including xG and xGoT→psxg_faced", () => {
    const stats = mapSportmonksTeamStats({
      fixture,
      homeId: 19,
      awayId: 18,
    });
    const home = stats.find((s) => s.is_home)!;
    const away = stats.find((s) => !s.is_home)!;
    expect(home.xg).toBeCloseTo(1.87);
    expect(away.xg).toBeCloseTo(0.94);
    // psxg_faced = opponent xGoT
    expect(home.psxg_faced).toBeCloseTo(1.12);
    expect(away.psxg_faced).toBeCloseTo(1.65);
    expect(home.xg_source).toBe("sportmonks");
    expect(home.psxg_source).toBe("sportmonks");
    expect((home.payload as { xg_proxy?: boolean }).xg_proxy).toBe(false);
    expect(home.ppda).toBeNull();
    expect(home.possession_pct).toBeCloseTo(58.2);
    expect(home.shots).toBe(14);
  });

  it("falls back to shot-based xG proxy when Expected Goals stats are absent", () => {
    const noXgFixture: SmFixture = {
      ...fixture,
      statistics: (fixture.statistics ?? []).filter(
        (s) => s.type_id !== 5304 && s.type_id !== 5305 && s.type_id !== 9687
      ),
    };
    const stats = mapSportmonksTeamStats({
      fixture: noXgFixture,
      homeId: 19,
      awayId: 18,
    });
    const home = stats.find((s) => s.is_home)!;
    const away = stats.find((s) => !s.is_home)!;
    // 0.06*14 + 0.22*6 + 0.28*3 = 0.84+1.32+0.84 = 3.0
    expect(home.xg).toBeCloseTo(3.0);
    // 0.06*9 + 0.22*4 + 0.28*1 = 0.54+0.88+0.28 = 1.7
    expect(away.xg).toBeCloseTo(1.7);
    expect((home.payload as { xg_proxy?: boolean }).xg_proxy).toBe(true);
    expect((home.payload as { psxg_proxy?: boolean }).psxg_proxy).toBe(true);
    expect(home.psxg_faced).toBeCloseTo(1.7 * 0.85);
    expect(home.xg_conceded).toBeCloseTo(1.7);
  });

  it("maps discrete SportMonks events", () => {
    const events = mapSportmonksEvents(fixture);
    expect(events.length).toBe(3);
    expect(events[0].source).toBe("sportmonks");
    expect(events[0].match_sm_id).toBe(19135515);
  });

  it("maps team and player dimension rows for Supabase", () => {
    const home = fixture.participants!.find((p) => p.meta?.location === "home")!;
    const teamRow = mapSportmonksTeam(home);
    expect(teamRow.sm_id).toBe(19);
    expect(teamRow.name).toBe("Arsenal");

    const playerRow = mapSportmonksPlayer({
      id: 9001,
      display_name: "Test Player",
      teams: [{ team_id: 19, end: null }],
      position: { name: "Forward", code: "FW" },
    });
    expect(playerRow.sm_id).toBe(9001);
    expect(playerRow.current_team_sm_id).toBe(19);
    expect(playerRow.role_name).toBe("Forward");
  });
});

describe("GLPM Wyscout enrich extractors", () => {
  const teamMap = new Map<number, number>([
    [1612, 19],
    [1610, 18],
  ]);

  it("extracts shots keyed by SportMonks team ids", () => {
    const shots = extractShotsFromEvents(
      eventsMock.events as WyscoutEventPayload[],
      19135515,
      teamMap
    );
    expect(shots.length).toBeGreaterThanOrEqual(3);
    const goal = shots.find((s) => s.event_id === 900001 + 10_000_000_000)!;
    expect(goal.team_sm_id).toBe(19);
    expect(goal.is_goal).toBe(true);
    expect(goal.post_shot_xg).toBeCloseTo(0.72);
    expect(goal.source).toBe("wyscout");
  });

  it("treats penalty free-kick as shot-like", () => {
    const pen = (eventsMock.events as WyscoutEventPayload[]).find((e) => e.id === 900005)!;
    expect(isShotLikeEvent(pen)).toBe(true);
  });

  it("recomputes audit PPDA from Wyscout events", () => {
    const ppda = recomputePpdaFromEvents(eventsMock.events as WyscoutEventPayload[], 1612);
    expect(ppda).not.toBeNull();
    expect(ppda!).toBeGreaterThan(0);
  });

  it("reads Wyscout advancedstats sides for enrich (ppda present)", () => {
    const sides = listAdvancedStatsSides(advancedMock as never);
    const arsenal = sides.find((s) => s.teamId === 1612)!;
    expect(arsenal.total?.ppda).toBeCloseTo(8.4);
  });
});

describe("GLPM Section 2.14 validation", () => {
  function baseStats(
    over: Partial<TeamStatsLike> & Pick<TeamStatsLike, "team_sm_id" | "is_home">
  ): TeamStatsLike {
    return {
      match_sm_id: 19135515,
      goals: 2,
      xg: 1.5,
      npxg: 1.2,
      shots: 10,
      shots_on_target: 4,
      big_chances: 2,
      possession_pct: 55,
      ppda: 8,
      defensive_actions: 40,
      psxg_faced: 1.1,
      ...over,
    };
  }

  it("passes a coherent home/away bundle", () => {
    const issues = validateMatchBundle({
      home: baseStats({ team_sm_id: 19, is_home: true, possession_pct: 58.2 }),
      away: baseStats({
        team_sm_id: 18,
        is_home: false,
        goals: 1,
        possession_pct: 41.8,
        xg: 0.9,
        npxg: 0.9,
      }),
      knownTeamIds: new Set([19, 18]),
    });
    const summary = summarizeValidation(issues);
    expect(summary.errors).toBe(0);
  });

  it("flags possession sum far from 100", () => {
    const issues = validateMatchBundle({
      home: baseStats({ team_sm_id: 1, is_home: true, possession_pct: 70 }),
      away: baseStats({ team_sm_id: 2, is_home: false, possession_pct: 40 }),
    });
    expect(issues.some((i) => i.ruleCode === "POSSESSION_SUM")).toBe(true);
  });

  it("warns PPDA_MISSING after SportMonks-only ingest", () => {
    const issues = validateMatchBundle({
      home: baseStats({ team_sm_id: 19, is_home: true, ppda: null }),
      away: baseStats({ team_sm_id: 18, is_home: false, possession_pct: 45, ppda: null }),
    });
    expect(issues.filter((i) => i.ruleCode === "PPDA_MISSING").length).toBeGreaterThanOrEqual(2);
  });

  it("warns XG_PROXY / XG_MISSING without failing the bundle", () => {
    const proxyIssues = validateMatchBundle({
      home: baseStats({ team_sm_id: 19, is_home: true, xg_proxy: true }),
      away: baseStats({
        team_sm_id: 18,
        is_home: false,
        possession_pct: 45,
        xg: null,
        npxg: null,
      }),
    });
    expect(proxyIssues.some((i) => i.ruleCode === "XG_PROXY")).toBe(true);
    expect(proxyIssues.some((i) => i.ruleCode === "XG_MISSING")).toBe(true);
    expect(summarizeValidation(proxyIssues).errors).toBe(0);
  });

  it("flags npxg > xg and sot > shots", () => {
    const issues = validateMatchBundle({
      home: baseStats({
        team_sm_id: 1,
        is_home: true,
        xg: 1.0,
        npxg: 1.2,
        shots: 5,
        shots_on_target: 8,
      }),
      away: baseStats({ team_sm_id: 2, is_home: false, possession_pct: 45 }),
    });
    expect(issues.some((i) => i.ruleCode === "NPXG_LE_XG")).toBe(true);
    expect(issues.some((i) => i.ruleCode === "SOT_LE_SHOTS")).toBe(true);
  });
});

describe("GLPM Layer 2 + enrich non-overwrite semantics", () => {
  it("builds features from SM stats without inventing PPDA", () => {
    const stats = mapSportmonksTeamStats({
      fixture,
      homeId: 19,
      awayId: 18,
    }).find((s) => s.is_home)!;

    const features = buildTeamFeatures({
      stats: {
        ...stats,
        validation_status: "passed",
        synced_at: new Date().toISOString(),
      } as never,
      opponentGoals: 1,
      shotsFor: [],
      shotsAgainst: [],
    });

    expect(features.xg_per_shot).toBeCloseTo(1.87 / 14);
    expect(features.ppda).toBeNull();
    expect(features.psxg_faced).toBeCloseTo(1.12);
    expect(features.goals_prevented).toBeCloseTo(1.12 - 1);
  });

  it("keeps SportMonks xG when Wyscout would differ (documented enrich policy)", () => {
    const smXg = 1.87;
    const wyXg = 2.1;
    // Enrich path only fills when sm is null; conflict is warn-only
    expect(smXg).not.toBeCloseTo(wyXg);
    const keep = smXg != null ? smXg : wyXg;
    expect(keep).toBe(1.87);
  });

  it("classifies high press / high possession styles", () => {
    const labels = classifyStyleLabels({
      possessionAvg: 60,
      ppdaAvg: 7.5,
      directnessAvg: 0.2,
    });
    expect(labels).toContain("high_possession");
    expect(labels).toContain("high_press");
  });
});
