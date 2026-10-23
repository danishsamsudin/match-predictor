/**
 * Re-apply season A/D/FR overlays after ML assemble.
 *
 * - Understat: EPL, Serie A, Bundesliga
 * - SportMonks provider xG: Championship / Eredivisie current season (when fill ≥70%)
 * - Standings GF/GA: Champ/Ere fallback when SM xG unavailable
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

/** Current-season Champ/Ere where provider xG audit can unlock SM overlays. */
export const SM_XG_SEASON_OVERLAY_IDS = new Set<number>([
  SM_SEASON_2026_27.EREDIVISIE,
  SM_SEASON_2026_27.CHAMPIONSHIP,
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

export function smXgSeasonOverlayAvailable(seasonId: number): boolean {
  return SM_XG_SEASON_OVERLAY_IDS.has(seasonId);
}

export function standingsSeasonOverlayAvailable(seasonId: number): boolean {
  return STANDINGS_SEASON_OVERLAY_IDS.has(seasonId);
}

export function seasonRatingOverlayAvailable(seasonId: number): boolean {
  return (
    understatSeasonOverlayAvailable(seasonId) ||
    smXgSeasonOverlayAvailable(seasonId) ||
    standingsSeasonOverlayAvailable(seasonId)
  );
}

export type SeasonOverlayResult = {
  attempted: boolean;
  ok: boolean;
  detail?: string;
  source?: "understat" | "sm_xg" | "standings";
};

function runPython(
  cwd: string,
  scriptRel: string,
  args: string[]
): Promise<SeasonOverlayResult & { exitCode: number }> {
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
      const exitCode = code ?? 1;
      const ok = exitCode === 0;
      resolve({
        attempted: true,
        ok,
        exitCode,
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
  return runPython(cwd, "scripts/glpm_import_understat_season.py", args).then(
    (r) => ({ ...r, source: "understat" as const })
  );
}

export function reapplySmXgSeasonOverlay(
  seasonId: number,
  cwd: string
): Promise<SeasonOverlayResult> {
  if (!smXgSeasonOverlayAvailable(seasonId)) {
    return Promise.resolve({ attempted: false, ok: true });
  }
  return runPython(cwd, "scripts/glpm_import_sm_xg_season_ratings.py", [
    "--season-id",
    String(seasonId),
  ]).then((r) => ({ ...r, source: "sm_xg" as const }));
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
  ]).then((r) => ({ ...r, source: "standings" as const }));
}

/**
 * Apply whichever season rating overlay exists for this SportMonks season.
 * Champ/Ere 26/27: prefer SM provider xG; fall back to standings GF/GA if fill is low.
 */
export async function reapplySeasonRatingOverlay(
  seasonId: number,
  cwd: string,
  opts?: { fromCache?: boolean; minMatches?: number }
): Promise<SeasonOverlayResult> {
  if (understatSeasonOverlayAvailable(seasonId)) {
    return reapplyUnderstatSeasonOverlay(seasonId, cwd, opts);
  }
  if (smXgSeasonOverlayAvailable(seasonId)) {
    const sm = await reapplySmXgSeasonOverlay(seasonId, cwd);
    if (sm.ok) return sm;
    // Fill bar miss (exit 2) or hard failure - try standings fallback.
    if (standingsSeasonOverlayAvailable(seasonId)) {
      const standings = await reapplyStandingsSeasonOverlay(seasonId, cwd);
      if (standings.attempted) {
        return {
          ...standings,
          detail: `sm_xg failed (${sm.detail ?? "unknown"}); standings fallback: ${standings.detail ?? ""}`,
        };
      }
    }
    return sm;
  }
  if (standingsSeasonOverlayAvailable(seasonId)) {
    return reapplyStandingsSeasonOverlay(seasonId, cwd);
  }
  return { attempted: false, ok: true };
}

/** @deprecated Prefer seasonRatingOverlayAvailable / reapplySeasonRatingOverlay */
export type UnderstatOverlayResult = SeasonOverlayResult;
