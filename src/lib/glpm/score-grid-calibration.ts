/**
 * Load per-competition score-grid calibration artifacts for club GLPM.
 */

import { readFileSync, existsSync } from "fs";
import path from "path";
import {
  DEFAULT_RHO,
  type PredictionConfig,
} from "@/lib/glpm/engine/predictions";
import { DEFAULT_MU_XG } from "@/lib/glpm/engine/config";

export type ScoreGridCalibrationParams = {
  mu: number;
  rho: number;
  goalOverdispersionK: number;
  lambdaGapScale: number;
  attenuateRhoForGap: boolean;
  gapPositiveRho: boolean;
};

export type ScoreGridCalibrationArtifact = {
  schemaVersion: number;
  competitionId: number;
  competitionName: string;
  seasonIds: number[];
  params: ScoreGridCalibrationParams;
  halfLifeDays: number;
  nMatches: number;
  fittedAt: string;
};

const cache = new Map<number, ScoreGridCalibrationArtifact | null>();

function calibrationDir(): string {
  return path.join(process.cwd(), "data", "glpm", "calibration");
}

export function scoreGridArtifactPath(competitionId: number): string {
  return path.join(
    calibrationDir(),
    `competition-${competitionId}-score-grid.json`
  );
}

function parseArtifact(raw: Record<string, unknown>): ScoreGridCalibrationArtifact {
  const p = (raw.params ?? {}) as Record<string, unknown>;
  return {
    schemaVersion: Number(raw.schema_version ?? 1),
    competitionId: Number(raw.competition_id),
    competitionName: String(raw.competition_name ?? ""),
    seasonIds: Array.isArray(raw.season_ids)
      ? raw.season_ids.map((x) => Number(x))
      : [],
    params: {
      mu: Number(p.mu ?? DEFAULT_MU_XG),
      rho: Number(p.rho ?? DEFAULT_RHO),
      goalOverdispersionK: Number(p.goal_overdispersion_k ?? 0),
      lambdaGapScale: Number(p.lambda_gap_scale ?? 1),
      attenuateRhoForGap: p.attenuate_rho_for_gap !== false,
      gapPositiveRho: p.gap_positive_rho !== false,
    },
    halfLifeDays: Number(raw.half_life_days ?? 220),
    nMatches: Number(raw.n_matches ?? 0),
    fittedAt: String(raw.fitted_at ?? ""),
  };
}

/** Load calibrated params for a competition; null if no artifact on disk. */
export function loadScoreGridCalibration(
  competitionId: number | null | undefined
): ScoreGridCalibrationArtifact | null {
  if (competitionId == null || !Number.isFinite(competitionId)) return null;
  const id = Number(competitionId);
  if (cache.has(id)) return cache.get(id) ?? null;

  const filePath = scoreGridArtifactPath(id);
  if (!existsSync(filePath)) {
    cache.set(id, null);
    return null;
  }
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf8")) as Record<
      string,
      unknown
    >;
    const artifact = parseArtifact(raw);
    cache.set(id, artifact);
    return artifact;
  } catch {
    cache.set(id, null);
    return null;
  }
}

/** Clear in-memory cache (tests / after recalibration in long-lived process). */
export function clearScoreGridCalibrationCache(): void {
  cache.clear();
}

export function predictionConfigFromCalibration(
  artifact: ScoreGridCalibrationArtifact | null
): Partial<PredictionConfig> {
  if (!artifact) return {};
  const p = artifact.params;
  return {
    rho: p.rho,
    goalOverdispersionK: p.goalOverdispersionK,
    attenuateRhoForGap: p.attenuateRhoForGap,
    gapPositiveRho: p.gapPositiveRho,
  };
}

export function competitionMuFromCalibration(
  artifact: ScoreGridCalibrationArtifact | null
): number | undefined {
  if (!artifact) return undefined;
  return artifact.params.mu;
}

/** Amplify |λH−λA| around the match mean (calibration gap_scale). */
export function applyLambdaGapScale(
  homeXg: number,
  awayXg: number,
  gapScale: number | null | undefined
): { homeXg: number; awayXg: number } {
  const gs = gapScale == null || !Number.isFinite(gapScale) ? 1 : Number(gapScale);
  if (Math.abs(gs - 1) < 1e-9) return { homeXg, awayXg };
  const mid = 0.5 * (homeXg + awayXg);
  return {
    homeXg: Math.max(0.05, mid + (homeXg - mid) * gs),
    awayXg: Math.max(0.05, mid + (awayXg - mid) * gs),
  };
}

export function lambdaGapScaleFromCalibration(
  artifact: ScoreGridCalibrationArtifact | null
): number {
  return artifact?.params.lambdaGapScale ?? 1;
}
