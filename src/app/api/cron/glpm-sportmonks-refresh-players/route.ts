import { NextRequest } from "next/server";
import { refreshSportmonksPlayers } from "@/lib/glpm/sportmonks/refreshEntities";
import {
  parseBoolQuery,
  parseNumberQuery,
  parseSeasonIdsParam,
  runGlpmCron,
} from "@/lib/glpm/sportmonks/cronRoute";

export const runtime = "nodejs";
export const maxDuration = 240;

const HINT =
  "GET /api/cron/glpm-sportmonks-refresh-players?run=true&seasonIds=28083,27958,... (monthly)";

export async function GET(request: NextRequest) {
  return runGlpmCron(request, HINT, () =>
    refreshSportmonksPlayers({
      seasonIds: parseSeasonIdsParam(request),
      dryRun: parseBoolQuery(request, "dryRun"),
      maxPages: parseNumberQuery(request, "maxPages"),
      maxPlayers: parseNumberQuery(request, "maxPlayers"),
    })
  );
}

export async function POST(request: NextRequest) {
  return GET(request);
}
