import { NextRequest } from "next/server";
import { refreshSportmonksTeams } from "@/lib/glpm/sportmonks/refreshEntities";
import {
  parseBoolQuery,
  parseNumberQuery,
  parseSeasonIdsParam,
  runGlpmCron,
} from "@/lib/glpm/sportmonks/cronRoute";

export const runtime = "nodejs";
export const maxDuration = 240;

const HINT =
  "GET /api/cron/glpm-sportmonks-refresh-teams?run=true&seasonIds=28083,27958,... (weekly)";

export async function GET(request: NextRequest) {
  return runGlpmCron(request, HINT, () =>
    refreshSportmonksTeams({
      seasonIds: parseSeasonIdsParam(request),
      dryRun: parseBoolQuery(request, "dryRun"),
      maxTeams: parseNumberQuery(request, "maxTeams"),
    })
  );
}

export async function POST(request: NextRequest) {
  return GET(request);
}
