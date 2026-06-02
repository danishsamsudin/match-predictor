import path from "path";
import { serverEnv } from "@/lib/env/server-env";

function read(name: string): string | undefined {
  const value = process.env[name];
  if (!value || value.trim() === "") return undefined;
  return value.trim();
}

export function isSoccerdataEnabled(): boolean {
  return read("SOCCERDATA_ENABLED") !== "false";
}

export function getSoccerdataPythonBin(): string {
  return read("SOCCERDATA_PYTHON") ?? "python3";
}

export function getSoccerdataRunnerPath(): string {
  const fromEnv = read("SOCCERDATA_RUNNER");
  if (fromEnv) return fromEnv;
  return path.join(process.cwd(), "services", "soccerdata", "runner.py");
}

export function getSoccerdataCacheDir(): string | undefined {
  return read("SOCCERDATA_DIR") ?? serverEnv.soccerdataDir;
}

export function getSoccerdataFetchTimeoutMs(): number {
  const raw = read("SOCCERDATA_TIMEOUT_MS");
  if (!raw) return 120_000;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 120_000;
}
