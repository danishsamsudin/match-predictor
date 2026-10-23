/**
 * Audit SportMonks provider vs proxy xG fill rates for Championship (9) and Eredivisie (72).
 *
 * Pass bar (plan): >=70% finished current-season fixtures with non-proxy team xG.
 *
 * Usage: npx tsx scripts/glpm-audit-sm-xg.ts
 */
import fs from "fs";
import path from "path";
import {
  SM_LEAGUE,
  SM_SEASON_2025_26,
  SM_SEASON_2026_27,
} from "../src/lib/sportmonks/constants";
import { tryCreateServiceClient } from "../src/lib/supabase";

function loadEnvLocal() {
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

const TARGET_LEAGUES = [
  {
    leagueSmId: SM_LEAGUE.CHAMPIONSHIP,
    name: "Championship",
    seasonIds: [SM_SEASON_2025_26.CHAMPIONSHIP, SM_SEASON_2026_27.CHAMPIONSHIP],
  },
  {
    leagueSmId: SM_LEAGUE.EREDIVISIE,
    name: "Eredivisie",
    seasonIds: [SM_SEASON_2025_26.EREDIVISIE, SM_SEASON_2026_27.EREDIVISIE],
  },
] as const;

const PASS_RATE = 0.7;

type TeamStatRow = {
  match_sm_id: number;
  xg: number | null;
  payload: Record<string, unknown> | null;
};

function isProxyXg(payload: Record<string, unknown> | null): boolean | null {
  if (!payload || typeof payload !== "object") return null;
  if (typeof payload.xg_proxy === "boolean") return payload.xg_proxy;
  if (typeof payload.xg_from_proxy === "boolean") return payload.xg_from_proxy;
  return null;
}

async function main() {
  loadEnvLocal();
  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const results: Array<{
    leagueSmId: number;
    name: string;
    seasonId: number;
    finishedMatches: number;
    matchesWithAnyXg: number;
    matchesWithProviderXg: number;
    matchesWithProxyXg: number;
    providerFillRate: number;
    pass: boolean;
  }> = [];

  for (const league of TARGET_LEAGUES) {
    for (const seasonId of league.seasonIds) {
      const { data: matches, error } = await supabase
        .from("glpm_matches")
        .select("sm_id")
        .eq("league_sm_id", league.leagueSmId)
        .eq("season_id", seasonId)
        .not("home_score", "is", null)
        .not("away_score", "is", null);
      if (error) throw new Error(error.message);
      const matchIds = (matches ?? []).map((m) => Number(m.sm_id)).filter(Number.isFinite);
      if (!matchIds.length) {
        results.push({
          leagueSmId: league.leagueSmId,
          name: league.name,
          seasonId,
          finishedMatches: 0,
          matchesWithAnyXg: 0,
          matchesWithProviderXg: 0,
          matchesWithProxyXg: 0,
          providerFillRate: 0,
          pass: false,
        });
        continue;
      }

      let matchesWithAnyXg = 0;
      let matchesWithProviderXg = 0;
      let matchesWithProxyXg = 0;

      // Batch to avoid URL limits
      const chunk = 80;
      for (let i = 0; i < matchIds.length; i += chunk) {
        const slice = matchIds.slice(i, i + chunk);
        const { data: stats, error: stErr } = await supabase
          .from("glpm_match_team_stats")
          .select("match_sm_id, xg, payload")
          .in("match_sm_id", slice);
        if (stErr) throw new Error(stErr.message);

        const byMatch = new Map<number, TeamStatRow[]>();
        for (const row of (stats ?? []) as TeamStatRow[]) {
          const id = Number(row.match_sm_id);
          if (!byMatch.has(id)) byMatch.set(id, []);
          byMatch.get(id)!.push(row);
        }

        for (const id of slice) {
          const rows = byMatch.get(id) ?? [];
          const withXg = rows.filter((r) => r.xg != null && Number.isFinite(Number(r.xg)));
          if (!withXg.length) continue;
          matchesWithAnyXg += 1;
          const proxies = withXg.map((r) => isProxyXg(r.payload));
          const anyProvider = proxies.some((p) => p === false);
          const allProxy =
            proxies.length > 0 && proxies.every((p) => p === true);
          // If proxy flag unknown but xg present, treat as provider (SM write path sets flag)
          if (anyProvider || proxies.every((p) => p == null)) {
            matchesWithProviderXg += 1;
          } else if (allProxy) {
            matchesWithProxyXg += 1;
          } else {
            matchesWithProviderXg += 1;
          }
        }
      }

      const finishedMatches = matchIds.length;
      const providerFillRate =
        finishedMatches > 0 ? matchesWithProviderXg / finishedMatches : 0;
      results.push({
        leagueSmId: league.leagueSmId,
        name: league.name,
        seasonId,
        finishedMatches,
        matchesWithAnyXg,
        matchesWithProviderXg,
        matchesWithProxyXg,
        providerFillRate,
        pass: finishedMatches >= 10 && providerFillRate >= PASS_RATE,
      });
    }
  }

  const outDir = path.join(process.cwd(), "data/glpm/calibration/baselines");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "sm-xg-audit.json");
  const overallPass = TARGET_LEAGUES.every((league) => {
    const seasons = results.filter((r) => r.leagueSmId === league.leagueSmId);
    const withData = seasons.filter((r) => r.finishedMatches >= 10);
    return withData.length > 0 && withData.some((r) => r.pass);
  });

  const payload = {
    computedAt: new Date().toISOString(),
    passBar: PASS_RATE,
    overallPass,
    note: overallPass
      ? "PASS: SportMonks provider xG sufficient for Champ/Eredivisie overlays."
      : "FAIL: provider xG fill below bar — check xG add-on or use FBref free fallback.",
    freeFallbacksIfFail: [
      "FBref via soccerdata (Champ FBref 40 / Eredivisie 88)",
      "SM shot-volume proxy (continuity only)",
      "ClubElo/SPI strength priors only",
    ],
    results,
  };
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify(payload, null, 2));
  if (!overallPass) process.exitCode = 2;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
