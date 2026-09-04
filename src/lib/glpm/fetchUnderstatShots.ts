/**
 * Fetch Understat match shots into Layer 1, overlay set-piece xG / field-tilt
 * proxy, then rebuild Layer-2 features for the affected matches.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase";
import { buildAndUpsertMatchTeamFeatures } from "./layer2/buildMatchTeamFeatures";

type Client = SupabaseClient<Database>;

export type FetchUnderstatShotsOptions = {
  league?: string;
  seasonId?: number;
  sinceDate?: string;
  seasonYear?: number;
  dryRun?: boolean;
  skipFetch?: boolean;
  sleep?: number;
  maxMatches?: number;
  understatMatchId?: number;
  rebuildMatchIds?: number[];
  supabase?: Client;
  cwd?: string;
};

export type FetchUnderstatShotsSummary = {
  ok: boolean;
  dryRun: boolean;
  pythonStatus: number;
  pythonStdout: string;
  pythonStderr: string;
  featuresRebuilt: number;
  matchIds: number[];
  shotsUpserted: number;
  notes: string[];
};

function runPython(
  args: string[],
  cwd: string
): Promise<{ status: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("python3", args, {
      cwd,
      env: process.env,
      shell: process.platform === "win32",
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += String(d);
    });
    child.stderr.on("data", (d) => {
      stderr += String(d);
    });
    child.on("close", (status) => {
      resolve({ status: status ?? 1, stdout, stderr });
    });
  });
}

function parseSummary(stdout: string): {
  matchIds: number[];
  shotsUpserted: number;
  ok?: boolean;
} {
  const trimmed = stdout.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return { matchIds: [], shotsUpserted: 0 };
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1)) as {
      match_ids?: number[];
      shots_upserted?: number;
      ok?: boolean;
    };
    return {
      matchIds: [...new Set((parsed.match_ids ?? []).map((id) => Number(id)).filter(Number.isFinite))],
      shotsUpserted: Number(parsed.shots_upserted ?? 0) || 0,
      ok: parsed.ok,
    };
  } catch {
    return { matchIds: [], shotsUpserted: 0 };
  }
}

export async function runGlpmFetchUnderstatShots(
  options: FetchUnderstatShotsOptions = {}
): Promise<FetchUnderstatShotsSummary> {
  const notes: string[] = [];
  const dryRun = Boolean(options.dryRun);
  const cwd = options.cwd ?? process.cwd();
  const skipFetch = Boolean(options.skipFetch);

  let py = { status: 0, stdout: "", stderr: "" };
  let parsed = { matchIds: [] as number[], shotsUpserted: 0, ok: true as boolean | undefined };

  if (!skipFetch) {
    const script = path.join(cwd, "scripts", "glpm_fetch_understat_shots.py");
    const pyArgs = [script, "--league", options.league ?? "all"];
    if (options.seasonId != null) pyArgs.push("--season-id", String(options.seasonId));
    if (options.sinceDate) pyArgs.push("--since-date", options.sinceDate);
    if (options.seasonYear != null) pyArgs.push("--season-year", String(options.seasonYear));
    if (options.sleep != null) pyArgs.push("--sleep", String(options.sleep));
    if (options.maxMatches != null) pyArgs.push("--max-matches", String(options.maxMatches));
    if (options.understatMatchId != null) {
      pyArgs.push("--understat-match-id", String(options.understatMatchId));
    }
    if (dryRun) pyArgs.push("--dry-run");

    py = await runPython(pyArgs, cwd);
    parsed = parseSummary(py.stdout);
    notes.push(
      py.status === 0
        ? "Understat shots script completed"
        : `Understat shots script exited ${py.status}`
    );
  } else {
    notes.push("Skipped Understat fetch (--rebuild-only)");
    if (options.supabase && options.seasonId != null) {
      const { data, error } = await options.supabase
        .from("glpm_matches")
        .select("sm_id")
        .eq("season_id", options.seasonId)
        .not("home_score", "is", null);
      if (error) {
        notes.push(`load matches for rebuild failed: ${error.message}`);
      } else {
        parsed = {
          matchIds: (data ?? []).map((row) => row.sm_id).filter(Number.isFinite),
          shotsUpserted: 0,
          ok: true,
        };
      }
    }
  }

  const fromPython = parsed.matchIds;
  const explicit = options.rebuildMatchIds ?? [];
  const matchIds = [...new Set([...fromPython, ...explicit])];

  let featuresRebuilt = 0;
  if (!dryRun && options.supabase) {
    for (const matchSmId of matchIds) {
      try {
        await buildAndUpsertMatchTeamFeatures(options.supabase, {
          matchSmId,
          force: true,
        });
        featuresRebuilt += 1;
      } catch (err) {
        notes.push(
          `L2 rebuild failed match ${matchSmId}: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    }
  } else if (dryRun) {
    notes.push("Skipped L2 writes (dry-run)");
  }

  return {
    ok: py.status === 0 && parsed.ok !== false,
    dryRun,
    pythonStatus: py.status,
    pythonStdout: py.stdout,
    pythonStderr: py.stderr,
    featuresRebuilt,
    matchIds,
    shotsUpserted: parsed.shotsUpserted,
    notes,
  };
}
