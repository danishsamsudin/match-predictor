/**
 * Re-apply season A/D/FR overlays after ML assemble when SportMonks xG is proxy-only.
 *
 * - Understat: EPL, Serie A, Bundesliga
 * - Standings GF/GA: Championship, Eredivisie (no Understat coverage)
 */

import { spawn } from "node:child_process";
import {
  SM_SEASON_2025_26,
  SM_SEASON_2026_27,
} from "@/lib/sportmonks/constants";

export const UNDERSTAT_SEASON_OVERLAY_IDS = new Set<number>([
  SM_SEASON_2025_26.PREMIER_LEAGUE,
  SM_SEASON_2025_26.SERIE_A,
  SM_SEASON_2025_26.BUNDESLIGA,
  SM_SEASON_2026_27.PREMIER_LEAGUE,
  SM_SEASON_2026_27.SERIE_A,
  SM_SEASON_2026_27.BUNDESLIGA,
]);

export const STANDINGS_SEASON_OVERLAY_IDS = new Set<number>([
  SM_SEASON_2025_26.EREDIVISIE,
  SM_SEASON_2025_26.CHAMPIONSHIP,
  SM_SEASON_2026_27.EREDIVISIE,
  SM_SEASON_2026_27.CHAMPIONSHIP,
]);

export function understatSeasonOverlayAvailable(seasonId: number): boolean {
  return UNDERSTAT_SEASON_OVERLAY_IDS.has(seasonId);
}

export function standingsSeasonOverlayAvailable(seasonId: number): boolean {
  return STANDINGS_SEASON_OVERLAY_IDS.has(seasonId);
}

export function seasonRatingOverlayAvailable(seasonId: number): boolean {
  return (
    understatSeasonOverlayAvailable(seasonId) ||
    standingsSeasonOverlayAvailable(seasonId)
  );
}

export type SeasonOverlayResult = {
  attempted: boolean;
  ok: boolean;
  detail?: string;
};

function runPython(
  cwd: string,
  scriptRel: string,
  args: string[]
): Promise<SeasonOverlayResult> {
  return new Promise((resolve) => {
    const script = `${cwd}/${scriptRel}`;
    const child = spawn("python3", [script, ...args], {
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
    child.on("close", (code) => {
      const ok = code === 0;
      resolve({
        attempted: true,
        ok,
        detail: ok
          ? stdout.trim().split("\n").slice(-4).join(" | ")
          : (stderr || stdout).slice(-500),
      });
    });
  });
}

export function reapplyUnderstatSeasonOverlay(
  seasonId: number,
  cwd: string,
  opts?: { fromCache?: boolean; minMatches?: number }
): Promise<SeasonOverlayResult> {
  if (!understatSeasonOverlayAvailable(seasonId)) {
    return Promise.resolve({ attempted: false, ok: true });
  }
  const args = ["--season-id", String(seasonId)];
  if (opts?.fromCache) args.push("--from-cache");
  if (opts?.minMatches != null) {
    args.push("--min-matches", String(opts.minMatches));
  }
  return runPython(cwd, "scripts/glpm_import_understat_season.py", args);
}

export function reapplyStandingsSeasonOverlay(
  seasonId: number,
  cwd: string
): Promise<SeasonOverlayResult> {
  if (!standingsSeasonOverlayAvailable(seasonId)) {
    return Promise.resolve({ attempted: false, ok: true });
  }
  return runPython(cwd, "scripts/glpm_import_standings_season_ratings.py", [
    "--season-id",
    String(seasonId),
  ]);
}

/** Apply whichever season rating overlay exists for this SportMonks season. */
export async function reapplySeasonRatingOverlay(
  seasonId: number,
  cwd: string,
  opts?: { fromCache?: boolean; minMatches?: number }
): Promise<SeasonOverlayResult> {
  if (understatSeasonOverlayAvailable(seasonId)) {
    return reapplyUnderstatSeasonOverlay(seasonId, cwd, opts);
  }
  if (standingsSeasonOverlayAvailable(seasonId)) {
    return reapplyStandingsSeasonOverlay(seasonId, cwd);
  }
  return { attempted: false, ok: true };
}

/** @deprecated Prefer seasonRatingOverlayAvailable / reapplySeasonRatingOverlay */
export type UnderstatOverlayResult = SeasonOverlayResult;
