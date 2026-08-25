/**
 * Post-results PPDA sync: Understat overwrite + SportMonks proxy backfill,
 * then rebuild Layer-2 features and style snapshots.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase";
import { buildAndUpsertMatchTeamFeatures } from "./layer2/buildMatchTeamFeatures";
import { upsertStyleSnapshotsForSeason } from "./layer2/styleSnapshots";

type Client = SupabaseClient<Database>;

export type FetchPpdaOptions = {
  league?: string;
  seasonId?: number;
  sinceDate?: string;
  seasonYear?: number;
  dryRun?: boolean;
  /** Rebuild L2 for these match IDs after PPDA upsert (skip when dry-run). */
  rebuildMatchIds?: number[];
  /** Upsert style snapshots for these season IDs. */
  styleSeasonIds?: number[];
  supabase?: Client;
  cwd?: string;
};

export type FetchPpdaSummary = {
  ok: boolean;
  dryRun: boolean;
  pythonStatus: number;
  pythonStdout: string;
  pythonStderr: string;
  featuresRebuilt: number;
  styleTeams: number;
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

export async function runGlpmFetchPpda(
  options: FetchPpdaOptions = {}
): Promise<FetchPpdaSummary> {
  const notes: string[] = [];
  const dryRun = Boolean(options.dryRun);
  const cwd = options.cwd ?? process.cwd();
  const script = path.join(cwd, "scripts", "glpm_fetch_ppda.py");

  const pyArgs = [script, "--league", options.league ?? "all"];
  if (options.seasonId != null) pyArgs.push("--season-id", String(options.seasonId));
  if (options.sinceDate) pyArgs.push("--since-date", options.sinceDate);
  if (options.seasonYear != null) pyArgs.push("--season-year", String(options.seasonYear));
  if (dryRun) pyArgs.push("--dry-run");

  const py = await runPython(pyArgs, cwd);
  notes.push(
    py.status === 0
      ? "PPDA fetch script completed"
      : `PPDA fetch script exited ${py.status}`
  );

  let featuresRebuilt = 0;
  let styleTeams = 0;

  if (!dryRun && options.supabase) {
    const matchIds = [...new Set(options.rebuildMatchIds ?? [])];
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

    const seasonIds = [...new Set(options.styleSeasonIds ?? [])];
    for (const seasonId of seasonIds) {
      try {
        const res = await upsertStyleSnapshotsForSeason(options.supabase, {
          seasonId,
          asOfDate: options.sinceDate,
        });
        styleTeams += res.teams;
      } catch (err) {
        notes.push(
          `style snapshot failed season ${seasonId}: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    }
  } else if (dryRun) {
    notes.push("Skipped L2 / style writes (dry-run)");
  }

  return {
    ok: py.status === 0,
    dryRun,
    pythonStatus: py.status,
    pythonStdout: py.stdout,
    pythonStderr: py.stderr,
    featuresRebuilt,
    styleTeams,
    notes,
  };
}
