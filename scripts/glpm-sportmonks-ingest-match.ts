/**
 * Primary: ingest a SportMonks fixture into GLPM Layer 1 → validate → Layer 2.
 *
 * Usage:
 *   npx tsx scripts/glpm-sportmonks-ingest-match.ts <fixtureId>
 *   npx tsx scripts/glpm-sportmonks-ingest-match.ts --mock
 *   npx tsx scripts/glpm-sportmonks-ingest-match.ts <fixtureId> --force-features
 */
import fs from "node:fs";
import path from "node:path";
import { ingestMatchFromSportmonks, ingestMatchFromSportmonksPayload } from "../src/lib/glpm/ingestMatch";
import { tryCreateServiceClient } from "../src/lib/supabase";
import { createSportmonksClient } from "../src/lib/sportmonks/client";
import type { SmApiResponse, SmFixture } from "../src/lib/sportmonks/types";

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

async function main() {
  loadEnvLocal();
  const args = process.argv.slice(2);
  const useMock = args.includes("--mock");
  const forceFeatures = args.includes("--force-features");
  const idArg = args.find((a) => !a.startsWith("-"));

  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  if (useMock) {
    const raw = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "src/lib/sportmonks/mock/fixture.json"), "utf8")
    ) as SmApiResponse<SmFixture>;
    const result = await ingestMatchFromSportmonksPayload(supabase, raw.data, { forceFeatures });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (!idArg) {
    console.error("Usage: npx tsx scripts/glpm-sportmonks-ingest-match.ts <fixtureId> | --mock");
    process.exit(1);
  }

  const fixtureId = Number(idArg);
  if (!Number.isFinite(fixtureId)) {
    console.error(`Invalid fixtureId: ${idArg}`);
    process.exit(1);
  }

  const client = createSportmonksClient();
  const result = await ingestMatchFromSportmonks(supabase, client, fixtureId, { forceFeatures });
  console.log(JSON.stringify(result, null, 2));
  if (result.validationStatus === "flagged") process.exitCode = 2;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
