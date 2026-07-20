/**
 * Shared env bootstrap for GLPM SportMonks CLI scripts.
 */
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_GLPM_SEASON_IDS_2026_27,
  parseIdList,
} from "../src/lib/sportmonks/constants";

export function loadEnvLocal() {
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

export function parseCliNumberFlag(name: string): number | undefined {
  const idx = process.argv.indexOf(name);
  if (idx < 0) return undefined;
  const raw = process.argv[idx + 1];
  if (raw == null) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export function parseSeasonIdsFromCli(): number[] | undefined {
  const args = process.argv.slice(2);
  const skipNext = new Set<number>();
  for (const flag of ["--max-pages", "--max-teams", "--max-players", "--max-coaches"]) {
    const idx = args.indexOf(flag);
    if (idx >= 0) skipNext.add(idx + 1);
  }

  const positional = args
    .filter((a, i) => !a.startsWith("-") && !skipNext.has(i))
    .map((s) => Number(s))
    .filter(Number.isFinite);

  if (positional.length) return positional;

  const envRaw = process.env.SPORTMONKS_REFRESH_SEASON_IDS;
  if (envRaw) return parseIdList(envRaw, DEFAULT_GLPM_SEASON_IDS_2026_27);

  return undefined;
}
