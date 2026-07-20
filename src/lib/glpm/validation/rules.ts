/**
 * Section 2.14 validation rules — flag invalid records, never silently drop.
 */

export type ValidationSeverity = "error" | "warn";

export type ValidationIssue = {
  ruleCode: string;
  severity: ValidationSeverity;
  message: string;
  observed?: Record<string, unknown>;
  entityType: string;
  entityKey: string;
};

export type TeamStatsLike = {
  match_sm_id: number;
  team_sm_id: number;
  is_home: boolean;
  goals: number | null;
  xg: number | null;
  npxg: number | null;
  shots: number | null;
  shots_on_target: number | null;
  big_chances: number | null;
  possession_pct: number | null;
  ppda: number | null;
  defensive_actions: number | null;
  psxg_faced: number | null;
  /** True when xG came from shot/SoT proxy (no SportMonks Expected Goals). */
  xg_proxy?: boolean | null;
  /** True when PSxG came from xG×0.85 proxy (no xGoT). */
  psxg_proxy?: boolean | null;
};

export type PlayerMinutesLike = {
  player_sm_id: number;
  minutes_played: number | null;
};

const EPS = 1e-6;

function pushIf(
  issues: ValidationIssue[],
  cond: boolean,
  issue: ValidationIssue
): void {
  if (cond) issues.push(issue);
}

function validateTeamSide(stats: TeamStatsLike, entityKey: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const base = { entityType: "match_team_stats", entityKey };

  pushIf(issues, stats.goals != null && (stats.goals < 0 || !Number.isInteger(stats.goals)), {
    ...base,
    ruleCode: "GOALS_NONNEG_INT",
    severity: "error",
    message: "Goals must be a non-negative integer",
    observed: { goals: stats.goals },
  });

  pushIf(issues, stats.xg != null && stats.xg < 0, {
    ...base,
    ruleCode: "XG_NONNEG",
    severity: "error",
    message: "xG must be >= 0",
    observed: { xg: stats.xg },
  });

  pushIf(
    issues,
    stats.npxg != null && stats.xg != null && stats.npxg > stats.xg + EPS,
    {
      ...base,
      ruleCode: "NPXG_LE_XG",
      severity: "error",
      message: "Non-penalty xG must be <= total xG",
      observed: { npxg: stats.npxg, xg: stats.xg },
    }
  );

  pushIf(
    issues,
    stats.big_chances != null &&
      stats.shots != null &&
      stats.big_chances > stats.shots,
    {
      ...base,
      ruleCode: "BIG_CHANCES_LE_SHOTS",
      severity: "error",
      message: "Big chances must be <= shots",
      observed: { big_chances: stats.big_chances, shots: stats.shots },
    }
  );

  pushIf(
    issues,
    stats.shots_on_target != null &&
      stats.shots != null &&
      stats.shots_on_target > stats.shots,
    {
      ...base,
      ruleCode: "SOT_LE_SHOTS",
      severity: "error",
      message: "Shots on target must be <= shots",
      observed: { shots_on_target: stats.shots_on_target, shots: stats.shots },
    }
  );

  pushIf(
    issues,
    stats.ppda != null &&
      stats.defensive_actions != null &&
      stats.defensive_actions > 0 &&
      stats.ppda <= 0,
    {
      ...base,
      ruleCode: "PPDA_POS",
      severity: "error",
      message: "PPDA must be > 0 when defensive actions > 0",
      observed: { ppda: stats.ppda, defensive_actions: stats.defensive_actions },
    }
  );

  pushIf(issues, stats.ppda == null, {
    ...base,
    ruleCode: "PPDA_MISSING",
    severity: "warn",
    message: "PPDA not present (SportMonks primary ingest; enrich from Wyscout)",
    observed: { team_sm_id: stats.team_sm_id },
  });

  pushIf(
    issues,
    stats.psxg_faced != null &&
      stats.shots_on_target != null &&
      stats.shots_on_target === 0 &&
      stats.psxg_faced > EPS,
    {
      ...base,
      ruleCode: "PSXG_LE_SOT_CONTEXT",
      severity: "warn",
      message: "PSxG faced present while shots on target is 0",
      observed: { psxg_faced: stats.psxg_faced, shots_on_target: stats.shots_on_target },
    }
  );

  pushIf(issues, stats.xg == null, {
    ...base,
    ruleCode: "XG_MISSING",
    severity: "warn",
    message:
      "xG not present (plan has no Expected Goals / xGFixture; shot proxy also unavailable)",
    observed: { team_sm_id: stats.team_sm_id, shots: stats.shots },
  });

  pushIf(issues, stats.xg != null && stats.xg_proxy === true, {
    ...base,
    ruleCode: "XG_PROXY",
    severity: "warn",
    message: "xG estimated from shots/SoT/big chances (provider Expected Goals unavailable)",
    observed: { team_sm_id: stats.team_sm_id, xg: stats.xg },
  });

  pushIf(issues, stats.psxg_faced == null, {
    ...base,
    ruleCode: "PSXG_MISSING",
    severity: "warn",
    message: "Post-shot xG / xGoT faced not provided",
    observed: { team_sm_id: stats.team_sm_id },
  });

  pushIf(issues, stats.psxg_faced != null && stats.psxg_proxy === true, {
    ...base,
    ruleCode: "PSXG_PROXY",
    severity: "warn",
    message: "PSxG faced estimated from opponent xG (provider xGoT unavailable)",
    observed: { team_sm_id: stats.team_sm_id, psxg_faced: stats.psxg_faced },
  });

  return issues;
}

export function validateMatchBundle(args: {
  home: TeamStatsLike;
  away: TeamStatsLike;
  knownTeamIds?: Set<number>;
  knownPlayerIds?: Set<number>;
  playerMinutes?: PlayerMinutesLike[];
}): ValidationIssue[] {
  const entityKey = String(args.home.match_sm_id);
  const issues: ValidationIssue[] = [
    ...validateTeamSide(args.home, `${entityKey}:${args.home.team_sm_id}`),
    ...validateTeamSide(args.away, `${entityKey}:${args.away.team_sm_id}`),
  ];

  const homePoss = args.home.possession_pct;
  const awayPoss = args.away.possession_pct;
  if (homePoss != null && awayPoss != null) {
    const sum = homePoss + awayPoss;
    if (Math.abs(sum - 100) > 1.0) {
      issues.push({
        entityType: "match_team_stats",
        entityKey,
        ruleCode: "POSSESSION_SUM",
        severity: "error",
        message: "Home possession + away possession must be approximately 100%",
        observed: { home: homePoss, away: awayPoss, sum },
      });
    }
  }

  if (args.knownTeamIds) {
    for (const teamId of [args.home.team_sm_id, args.away.team_sm_id]) {
      if (!args.knownTeamIds.has(teamId)) {
        issues.push({
          entityType: "team",
          entityKey: String(teamId),
          ruleCode: "FK_TEAM",
          severity: "error",
          message: `Team ID ${teamId} does not exist in glpm_teams`,
          observed: { team_sm_id: teamId },
        });
      }
    }
  }

  if (args.playerMinutes) {
    for (const p of args.playerMinutes) {
      if (p.minutes_played != null && p.minutes_played > 120) {
        issues.push({
          entityType: "match_player_stats",
          entityKey: `${entityKey}:${p.player_sm_id}`,
          ruleCode: "MINUTES_LE_120",
          severity: "error",
          message: "Minutes played must be <= 120",
          observed: { minutes_played: p.minutes_played },
        });
      }
      if (args.knownPlayerIds && !args.knownPlayerIds.has(p.player_sm_id)) {
        issues.push({
          entityType: "player",
          entityKey: String(p.player_sm_id),
          ruleCode: "FK_PLAYER",
          severity: "error",
          message: `Player ID ${p.player_sm_id} does not exist in glpm_players`,
          observed: { player_sm_id: p.player_sm_id },
        });
      }
    }
  }

  return issues;
}

export function summarizeValidation(issues: ValidationIssue[]): {
  status: "passed" | "flagged" | "warned";
  errors: number;
  warns: number;
} {
  const errors = issues.filter((i) => i.severity === "error").length;
  const warns = issues.filter((i) => i.severity === "warn").length;
  if (errors > 0) return { status: "flagged", errors, warns };
  if (warns > 0) return { status: "warned", errors, warns };
  return { status: "passed", errors, warns };
}
