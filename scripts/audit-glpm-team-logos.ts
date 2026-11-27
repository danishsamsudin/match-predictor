/**
 * Audit GLPM 26/27 clubs for unresolved / missing local logos.
 * Usage: npx tsx scripts/audit-glpm-team-logos.ts
 */

import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import {
  resolveLogoIdForTeam,
  resolveTeamLogo,
} from "../src/lib/data/team-logos";
import { TEAM_LOGO_ID_TO_NAME } from "../src/lib/data/team-logo-manifest";
import { DEFAULT_GLPM_SEASON_IDS_2026_27 } from "../src/lib/sportmonks/constants";

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const p of [".env.local", ".env"]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      env[m[1]] = v;
    }
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error("Missing Supabase URL / service key");
    process.exit(1);
  }
  const sb = createClient(url, key);
  const seasons = DEFAULT_GLPM_SEASON_IDS_2026_27;

  const { data: matches, error } = await sb
    .from("glpm_matches")
    .select("home_team_sm_id,away_team_sm_id,season_id")
    .in("season_id", seasons)
    .limit(8000);
  if (error) {
    console.error(error);
    process.exit(1);
  }

  const ids = new Set<number>();
  for (const m of matches ?? []) {
    ids.add(m.home_team_sm_id);
    ids.add(m.away_team_sm_id);
  }

  const { data: teams, error: tErr } = await sb
    .from("glpm_teams")
    .select("sm_id,name,official_name")
    .in("sm_id", [...ids]);
  if (tErr) {
    console.error(tErr);
    process.exit(1);
  }

  const missing: Array<Record<string, unknown>> = [];
  for (const t of teams ?? []) {
    const option = {
      id: t.sm_id,
      name: t.name,
      shortName: t.official_name ?? undefined,
    };
    const logo = resolveTeamLogo(option);
    const logoId = resolveLogoIdForTeam(option);
    if (!logo) {
      missing.push({ sm_id: t.sm_id, name: t.name, reason: "no_resolve" });
      continue;
    }
    if (logo.startsWith("/team-logos/")) {
      const file = path.join(process.cwd(), "public", logo.replace(/^\//, ""));
      if (!fs.existsSync(file)) {
        missing.push({
          sm_id: t.sm_id,
          name: t.name,
          logoId,
          reason: "missing_file",
          logo,
        });
      } else if (
        logoId != null &&
        TEAM_LOGO_ID_TO_NAME[logoId] &&
        !TEAM_LOGO_ID_TO_NAME[logoId]
          .toLowerCase()
          .includes(t.name.toLowerCase().slice(0, 4)) &&
        !t.name
          .toLowerCase()
          .includes(TEAM_LOGO_ID_TO_NAME[logoId].toLowerCase().slice(0, 4))
      ) {
        // soft warn only - name normalization may still be fine
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        seasons,
        teamsChecked: teams?.length ?? 0,
        missingCount: missing.length,
        missing,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
