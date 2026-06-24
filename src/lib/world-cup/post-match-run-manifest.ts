import fs from "node:fs";
import path from "node:path";
import type { WcCalibrationConstants } from "@/lib/world-cup/wc-calibration-config";

export const POSTMATCH_MANIFEST_PATH = path.join(
  process.cwd(),
  "data/reports/.wc-postmatch-run.json"
);

export interface PostMatchRunManifest {
  startedAt: string;
  articleFiles: string[];
  playerStatsFixtureCount: number;
  calibrationBefore: {
    version: string;
    constants: WcCalibrationConstants;
  };
  finishedMatchCountBefore: number;
  /** True when written by wc-postmatch-snapshot at pipeline start. */
  pipelineRun?: boolean;
}

export function writePostMatchRunManifest(manifest: PostMatchRunManifest): void {
  const dir = path.dirname(POSTMATCH_MANIFEST_PATH);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(POSTMATCH_MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");
}

export function readPostMatchRunManifest(): PostMatchRunManifest | null {
  if (!fs.existsSync(POSTMATCH_MANIFEST_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(POSTMATCH_MANIFEST_PATH, "utf8")) as PostMatchRunManifest;
  } catch {
    return null;
  }
}
