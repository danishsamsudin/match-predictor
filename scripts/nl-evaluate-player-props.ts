/**
 * Evaluate NL hub player props against ingested Opta player match stats.
 * Prefer locked snapshot.player_props; bootstrap when missing:
 *   - prediction exists without props → attach props
 *   - no prediction → hub Graham predict (form as-of before kickoff) + attach
 *
 * Usage: npx tsx scripts/nl-evaluate-player-props.ts
 */
import { attachNlPlayerPropsToHubPrediction } from "../src/lib/nations-league/attach-nl-player-props";
import { runNlHubMainPredict } from "../src/lib/nations-league/hub-main-predict";
import { tryCreateServiceClient } from "../src/lib/supabase";
import {
  playerNamesMatch,
  type PlayerPropLine,
  type PlayerPropsPayload,
} from "../src/lib/prediction/player-props";
import type { HubPredictionRow } from "../src/lib/world-cup/hub-main-predict";
import type { WcMatchRow } from "../src/lib/world-cup/standings";

function loadEnvLocal() {
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const [key, ...rest] = t.split("=");
    const val = rest.join("=").trim().replace(/^["']|["']$/g, "");
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type PropSide = {
  teamExpectedGoals?: number;
  teamExpectedSot?: number;
  anytimeScorer?: PlayerPropLine[];
  anytimeCandidates?: PlayerPropLine[];
  anytimeAssist?: PlayerPropLine[];
  anytimeAssistCandidates?: PlayerPropLine[];
  goalOrAssist?: PlayerPropLine[];
  goalOrAssistCandidates?: PlayerPropLine[];
  shotsOnTarget?: Array<{
    playerName: string;
    line: number;
    probabilityPct: number;
    expectedSot: number;
  }>;
};

function resolveLines(
  side: PropSide | undefined,
  candidates: PlayerPropLine[] | undefined,
  fallback: PlayerPropLine[] | undefined
): PlayerPropLine[] {
  if (candidates?.length) return candidates;
  return fallback ?? [];
}

/** Form history for bootstrap: exclude this fixture and same-day / later results. */
function finishedBeforeKickoff(
  allFinished: WcMatchRow[],
  match: WcMatchRow
): WcMatchRow[] {
  const matchId = String(match.id);
  const matchDate = match.date?.slice(0, 10) ?? "";
  return allFinished.filter((m) => {
    if (String(m.id) === matchId) return false;
    const d = m.date?.slice(0, 10) ?? "";
    if (!matchDate || !d) return String(m.id) !== matchId;
    return d < matchDate;
  });
}

type ServiceClient = NonNullable<ReturnType<typeof tryCreateServiceClient>>;

async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  attempts = 4
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const transient =
        /fetch failed|ECONNRESET|ETIMEDOUT|socket|network|429|503|502/i.test(msg);
      if (!transient || i === attempts - 1) throw err;
      const waitMs = 500 * 2 ** i;
      console.warn(`  retry ${i + 1}/${attempts - 1} after ${label}: ${msg}`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}

async function persistNlPrediction(
  supabase: ServiceClient,
  matchId: string,
  row: HubPredictionRow
): Promise<void> {
  await withRetry(`persist prediction ${matchId}`, async () => {
    const { error } = await supabase.from("nations_league_predictions").upsert({
      match_id: matchId,
      home_win_pct: row.home_win_pct,
      draw_pct: row.draw_pct,
      away_win_pct: row.away_win_pct,
      predicted_score_home: row.predicted_score_home,
      predicted_score_away: row.predicted_score_away,
      under_2_5_pct: row.under_2_5_pct,
      over_2_5_pct: row.over_2_5_pct,
      model_version: row.model_version,
      snapshot: row.snapshot,
    });
    if (error) throw new Error(error.message);
  });
}

async function main() {
  loadEnvLocal();
  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  console.log("Loading finished Nations League matches...");
  // `matches` has no denormalized team name columns - join via `teams`.
  const { data: finishedRows, error: matchErr } = await supabase
    .from("matches")
    .select(
      "id, date, status, home_team_id, away_team_id, home_goals, away_goals, competition, round, venue, venue_city, group_code, time"
    )
    .eq("status", "finished")
    .ilike("competition", "%Nations League%");

  if (matchErr) throw new Error(matchErr.message);
  if (!finishedRows?.length) {
    console.log("No finished Nations League matches to score.");
    return;
  }

  const { data: teams, error: teamsErr } = await supabase
    .from("teams")
    .select("id, name");
  if (teamsErr) throw new Error(teamsErr.message);
  const teamNames = new Map(
    (teams ?? []).map((t) => [String(t.id), t.name as string])
  );

  const finishedMatches: WcMatchRow[] = finishedRows.map((row) => ({
    id: String(row.id),
    date: row.date,
    time: row.time,
    competition: row.competition,
    round: row.round,
    venue: row.venue,
    venue_city: row.venue_city ?? row.venue,
    group_code: row.group_code,
    status: row.status,
    home_team_id: row.home_team_id,
    away_team_id: row.away_team_id,
    home_goals: row.home_goals,
    away_goals: row.away_goals,
    home_team_name: row.home_team_id
      ? teamNames.get(String(row.home_team_id))
      : undefined,
    away_team_name: row.away_team_id
      ? teamNames.get(String(row.away_team_id))
      : undefined,
  }));

  console.log(`Finished Nations League matches: ${finishedMatches.length}`);

  // Fail fast with a clear migration hint if the eval table is missing.
  {
    const probe = await supabase
      .from("nations_league_player_prop_evaluations")
      .select("match_id")
      .limit(1);
    if (probe.error?.message?.includes("nations_league_player_prop_evaluations")) {
      console.error(
        "Missing table nations_league_player_prop_evaluations.\n" +
          "Apply migration: supabase/migrations/061_nations_league_player_prop_evaluations.sql"
      );
      process.exit(1);
    }
  }

  const matchIds = finishedMatches.map((m) => String(m.id));
  const predByMatch = new Map<string, Record<string, unknown>>();
  // Chunk .in() queries - large finished sets blow URL limits and return empty.
  for (let i = 0; i < matchIds.length; i += 80) {
    const chunk = matchIds.slice(i, i + 80);
    const preds = await withRetry(`load predictions chunk ${i}`, async () => {
      const { data, error } = await supabase
        .from("nations_league_predictions")
        .select(
          "match_id, model_version, snapshot, home_win_pct, draw_pct, away_win_pct, predicted_score_home, predicted_score_away, under_2_5_pct, over_2_5_pct"
        )
        .in("match_id", chunk);
      if (error) throw new Error(error.message);
      return data ?? [];
    });
    for (const p of preds) {
      predByMatch.set(String(p.match_id), p as Record<string, unknown>);
    }
  }
  console.log(`Locked match odds loaded for ${predByMatch.size} finished match(es).`);

  // Only evaluate fixtures that already have Opta player stats (skip ~600 empty lookups).
  const statsMatchRows = await withRetry("list matches with Opta stats", async () => {
    const { data, error } = await supabase
      .from("nations_league_player_match_stats")
      .select("match_id");
    if (error) throw new Error(error.message);
    return data ?? [];
  });
  const statsMatchIds = new Set(
    statsMatchRows.map((row) => String(row.match_id))
  );
  const matchesWithStats = finishedMatches.filter((m) =>
    statsMatchIds.has(String(m.id))
  );
  const skippedNoStats = finishedMatches.length - matchesWithStats.length;
  console.log(
    `Matches with player statistics: ${matchesWithStats.length} (skipping ${skippedNoStats} without player statistics)`
  );

  let evaluated = 0;
  let matchesUsed = 0;
  let skippedNoProps = 0;

  for (const match of matchesWithStats) {
    const matchId = String(match.id);
    const label = `${match.home_team_name ?? "Home"} vs ${match.away_team_name ?? "Away"} (${match.date ?? "?"})`;

    const stats = await withRetry(`load Opta stats ${matchId}`, async () => {
      const { data, error } = await supabase
        .from("nations_league_player_match_stats")
        .select("opta_player_id, player_name, team_api_id, stats")
        .eq("match_id", matchId);
      if (error) throw new Error(error.message);
      return data ?? [];
    });

    if (!stats.length) {
      // Race: listed in stats index but empty on fetch - treat as no-stats.
      continue;
    }

    let props: PlayerPropsPayload | null = null;
    const pred = predByMatch.get(matchId);
    const snap = (pred?.snapshot as Record<string, unknown> | undefined) ?? {};
    const locked = snap.player_props as PlayerPropsPayload | undefined;
    if (locked?.home && locked?.away) {
      props = locked;
      console.log(
        `  ${label}: using the pre-kickoff player odds that were already saved (${stats.length} players)`
      );
    } else if (pred) {
      const hubRow: HubPredictionRow = {
        home_win_pct: Number(pred.home_win_pct),
        draw_pct: Number(pred.draw_pct),
        away_win_pct: Number(pred.away_win_pct),
        predicted_score_home: Number(pred.predicted_score_home),
        predicted_score_away: Number(pred.predicted_score_away),
        under_2_5_pct: Number(pred.under_2_5_pct),
        over_2_5_pct: Number(pred.over_2_5_pct),
        model_version: String(pred.model_version ?? "nl"),
        snapshot: { ...snap, bootstrap: true },
      };
      const enriched = await attachNlPlayerPropsToHubPrediction(match, hubRow);
      props = (enriched.snapshot.player_props as PlayerPropsPayload | undefined) ?? null;
      if (props) {
        await persistNlPrediction(supabase, matchId, {
          ...enriched,
          snapshot: { ...enriched.snapshot, bootstrap: true },
        });
        predByMatch.set(matchId, {
          match_id: matchId,
          ...enriched,
        });
        console.log(
          `  ${label}: built player odds after the match for scoring only (${stats.length} players)`
        );
      }
    } else {
      // No stored hub prediction (common when fixtures finished before lock).
      // Bootstrap Graham + props using form strictly before kickoff.
      const priorFinished = finishedBeforeKickoff(finishedMatches, match);
      const computedBase = await runNlHubMainPredict(match, {
        finishedMatches: priorFinished,
      });
      if (computedBase) {
        const enriched = await attachNlPlayerPropsToHubPrediction(match, computedBase);
        props = (enriched.snapshot.player_props as PlayerPropsPayload | undefined) ?? null;
        if (props) {
          await persistNlPrediction(supabase, matchId, {
            ...enriched,
            snapshot: { ...enriched.snapshot, bootstrap: true },
          });
          predByMatch.set(matchId, {
            match_id: matchId,
            ...enriched,
          });
          console.log(
            `  ${label}: built match and player odds after the match for scoring only (${stats.length} players)`
          );
        }
      }
    }

    if (!props) {
      skippedNoProps += 1;
      console.log(
        `  ${label}: skip - could not build player odds`
      );
      continue;
    }
    matchesUsed += 1;

    type OptaActual = {
      optaPlayerId: string;
      teamApiId: number;
      goals: number;
      assists: number;
      sot: number;
      playerName: string;
    };

    const optaPlayers: OptaActual[] = stats.map((s) => {
      const raw = (s.stats as Record<string, unknown>) ?? {};
      return {
        optaPlayerId: String(s.opta_player_id),
        teamApiId: Number(s.team_api_id),
        goals: Number(raw.goals ?? 0),
        assists: Number(raw.assists ?? raw.Assists ?? 0),
        sot: Number(raw.shots_on_target ?? raw.SOnT ?? 0),
        playerName: String(s.player_name),
      };
    });

    const byNorm = new Map(optaPlayers.map((s) => [normalizeName(s.playerName), s]));

    function resolveOptaActual(playerName: string): OptaActual | undefined {
      const exact = byNorm.get(normalizeName(playerName));
      if (exact) return exact;
      return optaPlayers.find((s) => playerNamesMatch(playerName, s.playerName));
    }

    const sides = [
      { side: props.home as PropSide, teamApiId: props.home.teamId },
      { side: props.away as PropSide, teamApiId: props.away.teamId },
    ];

    const nowIso = new Date().toISOString();
    const snapSource = snap.bootstrap === true ? "bootstrap" : "locked";
    const evalByKey = new Map<string, Record<string, unknown>>();

    function pushLine(input: {
      market: string;
      line: PlayerPropLine;
      teamApiId: number;
      teamXg: number;
      actualCount: number;
      hit: boolean;
      predictedLambda: number;
      sotLine?: number;
      teamSot?: number;
    }) {
      const actual = resolveOptaActual(input.line.playerName);
      if (!actual) return;
      const key = `${matchId}|${actual.optaPlayerId}|${input.market}`;
      if (evalByKey.has(key)) return;
      evalByKey.set(key, {
        match_id: matchId,
        opta_player_id: actual.optaPlayerId,
        player_name: input.line.playerName,
        team_api_id: input.teamApiId,
        market: input.market,
        predicted_lambda: input.predictedLambda,
        predicted_prob: input.line.probabilityPct / 100,
        actual_count: input.actualCount,
        hit: input.hit,
        computed_at: nowIso,
        line: input.sotLine ?? null,
        chance_index_per90: input.line.chanceIndexPer90 ?? null,
        is_penalty_taker: input.line.isPenaltyTaker,
        is_starter: input.line.isStarter ?? true,
        role: input.line.role ?? null,
        team_expected_goals: input.teamXg,
        team_expected_sot: input.teamSot ?? null,
        prop_source: snapSource,
        match_date: match.date ?? null,
      });
    }

    for (const { side, teamApiId } of sides) {
      const teamXg = Number(side.teamExpectedGoals ?? 1.25);
      const teamSot = Number(side.teamExpectedSot ?? 0);
      for (const line of resolveLines(side, side.anytimeCandidates, side.anytimeScorer)) {
        const actual = resolveOptaActual(line.playerName);
        if (!actual) continue;
        pushLine({
          market: "anytime_scorer",
          line,
          teamApiId,
          teamXg,
          actualCount: actual.goals,
          hit: actual.goals >= 1,
          predictedLambda: line.expectedGoals,
        });
      }
      for (const line of resolveLines(side, side.anytimeAssistCandidates, side.anytimeAssist)) {
        const actual = resolveOptaActual(line.playerName);
        if (!actual) continue;
        pushLine({
          market: "anytime_assist",
          line,
          teamApiId,
          teamXg,
          actualCount: actual.assists,
          hit: actual.assists >= 1,
          predictedLambda: line.expectedAssists,
        });
      }
      for (const line of resolveLines(side, side.goalOrAssistCandidates, side.goalOrAssist)) {
        const actual = resolveOptaActual(line.playerName);
        if (!actual) continue;
        const combined = actual.goals + actual.assists;
        pushLine({
          market: "goal_or_assist",
          line,
          teamApiId,
          teamXg,
          actualCount: combined,
          hit: combined >= 1,
          predictedLambda: line.expectedGoals + line.expectedAssists * 0.45,
        });
      }

      for (const line of side.shotsOnTarget ?? []) {
        const actual = resolveOptaActual(line.playerName);
        if (!actual) continue;
        const market = `sot_${line.line}`;
        const key = `${matchId}|${actual.optaPlayerId}|${market}`;
        if (evalByKey.has(key)) continue;
        evalByKey.set(key, {
          match_id: matchId,
          opta_player_id: actual.optaPlayerId,
          player_name: line.playerName,
          team_api_id: teamApiId,
          market,
          predicted_lambda: line.expectedSot,
          predicted_prob: line.probabilityPct / 100,
          actual_count: actual.sot,
          hit: actual.sot > line.line,
          computed_at: nowIso,
          line: line.line,
          is_starter: true,
          team_expected_goals: teamXg,
          team_expected_sot: teamSot || null,
          sot_rate_per90: line.expectedSot,
          prop_source: snapSource,
          match_date: match.date ?? null,
        });
      }
    }

    const evalRows = [...evalByKey.values()];
    if (evalRows.length) {
      await withRetry(`upsert evals ${matchId}`, async () => {
        const { error } = await supabase
          .from("nations_league_player_prop_evaluations")
          .upsert(evalRows);
        if (error) throw new Error(error.message);
      });
    }
    evaluated += evalRows.length;
    console.log(`    scored ${evalRows.length} player-market line(s)`);
  }

  console.log(
    `\nScored ${evaluated} player-market line(s) across ${matchesUsed} match(es).`
  );
  console.log(
    `Skipped: ${skippedNoStats} without player statistics, ${skippedNoProps} without player odds.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
