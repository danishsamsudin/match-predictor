import { spawn } from "child_process";
import { createHash } from "crypto";
import {
  getSoccerdataCacheDir,
  getSoccerdataFetchTimeoutMs,
  getSoccerdataPythonBin,
  getSoccerdataRunnerPath,
  isSoccerdataEnabled,
} from "@/lib/config/soccerdata";
import type {
  SoccerdataFetchRequest,
  SoccerdataRunnerResponse,
} from "@/lib/api/soccerdata/types";
import { UpstreamApiError } from "@/lib/types/prediction";

export type SoccerdataRunnerInput = Pick<
  SoccerdataFetchRequest,
  "source" | "method" | "constructor" | "params"
>;

export function buildSoccerdataEntityKey(input: SoccerdataRunnerInput): string {
  const payload = JSON.stringify({
    source: input.source,
    method: input.method,
    constructor: input.constructor ?? {},
    params: input.params ?? {},
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

export async function runSoccerdataBridge(
  input: SoccerdataRunnerInput
): Promise<SoccerdataRunnerResponse> {
  if (!isSoccerdataEnabled()) {
    throw new UpstreamApiError(
      "SoccerData integration is disabled (SOCCERDATA_ENABLED=false)."
    );
  }

  const python = getSoccerdataPythonBin();
  const runnerPath = getSoccerdataRunnerPath();
  const timeoutMs = getSoccerdataFetchTimeoutMs();
  const cacheDir = getSoccerdataCacheDir();

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    SOCCERDATA_LOGLEVEL: process.env.SOCCERDATA_LOGLEVEL ?? "ERROR",
  };
  if (cacheDir) {
    env.SOCCERDATA_DIR = cacheDir;
  }

  const requestBody = JSON.stringify({
    source: input.source,
    method: input.method,
    constructor: mapConstructorForPython(input.constructor),
    params: input.params ?? {},
  });

  return new Promise((resolve, reject) => {
    const child = spawn(python, [runnerPath], {
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(
        new UpstreamApiError(
          `SoccerData runner timed out after ${timeoutMs}ms. For slow scrapers (FBref, WhoScored), increase SOCCERDATA_TIMEOUT_MS.`
        )
      );
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(
        new UpstreamApiError(
          `Failed to start SoccerData runner (${python}): ${error.message}. Install with: pip install -r services/soccerdata/requirements.txt`
        )
      );
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const trimmed = extractJsonPayload(stdout);
      if (!trimmed) {
        reject(
          new UpstreamApiError(
            `SoccerData runner produced no output (exit ${code ?? "?"}). ${stderr.slice(0, 500)}`
          )
        );
        return;
      }

      try {
        const parsed = JSON.parse(trimmed) as SoccerdataRunnerResponse;
        if (!parsed.ok) {
          const raw = "error" in parsed ? String(parsed.error) : "unknown";
          reject(new UpstreamApiError(formatSoccerdataRunnerError(raw)));
          return;
        }
        if (code !== 0) {
          reject(new UpstreamApiError(`SoccerData runner exited with code ${code}.`));
          return;
        }
        resolve(parsed);
      } catch {
        reject(
          new UpstreamApiError(
            `Invalid JSON from SoccerData runner: ${trimmed.slice(0, 300)}`
          )
        );
      }
    });

    child.stdin.write(requestBody);
    child.stdin.end();
  });
}

function formatSoccerdataRunnerError(raw: string): string {
  if (/fbref\.com|\/comps\/\.?/i.test(raw)) {
    return (
      `SoccerData error: ${raw} ` +
      "FBref often blocks automated scrapes (HTTP 403 / Cloudflare). " +
      "Fixture import will retry via Understat when mapped; otherwise run POST /api/cron/sync, try a VPN, or upgrade soccerdata."
    );
  }
  if (/football-data\.co\.uk|\.csv/i.test(raw)) {
    return (
      `SoccerData error: ${raw} ` +
      "Football-Data.co.uk (MatchHistory odds) may be unreachable from your network (503) or the season CSV is not published yet. " +
      "League backfill continues without odds; xG can still come from Understat."
    );
  }
  return `SoccerData error: ${raw}`;
}

/** Some soccerdata log lines can leak to stdout; take the last JSON object. */
function extractJsonPayload(stdout: string): string {
  const trimmed = stdout.trim();
  const start = trimmed.lastIndexOf('{"ok"');
  if (start >= 0) {
    return trimmed.slice(start);
  }
  return trimmed;
}

/** Python soccerdata expects snake_case constructor kwargs. */
function mapConstructorForPython(
  constructor: SoccerdataRunnerInput["constructor"]
): Record<string, unknown> {
  if (!constructor) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(constructor)) {
    if (value === undefined) continue;
    const snake = key.includes("_")
      ? key
      : key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`).replace(/^_/, "");
    out[snake] = value;
  }
  return out;
}
