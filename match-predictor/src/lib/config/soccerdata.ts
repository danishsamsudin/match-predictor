import path from "path";
import { serverEnv } from "@/lib/env/server-env";

function trimEnv(value: string | undefined): string | undefined {
  if (!value || value.trim() === "") return undefined;
  return value.trim();
}

export function isSoccerdataEnabled(): boolean {
  return trimEnv(process.env.SOCCERDATA_ENABLED) !== "false";
}

export function getSoccerdataPythonBin(): string {
  return trimEnv(process.env.SOCCERDATA_PYTHON) ?? "python3";
}

export function getSoccerdataRunnerPath(): string {
  const fromEnv = trimEnv(process.env.SOCCERDATA_RUNNER);
  if (fromEnv) return fromEnv;
  return path.join(process.cwd(), "services", "soccerdata", "runner.py");
}

export function getSoccerdataCacheDir(): string | undefined {
  return trimEnv(process.env.SOCCERDATA_DIR) ?? serverEnv.soccerdataDir;
}

export function getSoccerdataFetchTimeoutMs(): number {
  const raw = trimEnv(process.env.SOCCERDATA_TIMEOUT_MS);
  if (!raw) return 120_000;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 120_000;
}
