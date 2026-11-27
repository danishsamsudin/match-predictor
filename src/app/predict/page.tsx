import type { Metadata } from "next";
import { PageShell } from "@/components/layout/PageShell";
import { PredictionForm } from "@/components/PredictionForm";
import { BRAND_NAME } from "@/lib/brand";
import { loadSameDayCxUiPayload } from "@/lib/glpm-cx/hydrate-cx-payload";
import { loadGlpmPickerBootstrap } from "@/lib/glpm/load-teams-for-season";
import { tryCreateServiceClient, createServerClient } from "@/lib/supabase";

export const metadata: Metadata = {
  title: `Predict | ${BRAND_NAME}`,
};

export default async function PredictPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const entity = typeof params.entity === "string" ? params.entity : null;
  const isClub = entity !== "national";

  const seasonId =
    typeof params.seasonId === "string" ? params.seasonId : null;
  const competitionId =
    typeof params.competitionId === "string" ? params.competitionId : null;
  const matchSmIdRaw =
    typeof params.matchSmId === "string" ? params.matchSmId : null;
  const matchSmId = matchSmIdRaw ? Number(matchSmIdRaw) : NaN;

  let initialBootstrap = null;
  let initialResult = null;

  if (isClub) {
    try {
      initialBootstrap = await loadGlpmPickerBootstrap({
        seasonId,
        competitionId,
      });
    } catch (err) {
      console.warn("[predict] bootstrap failed", err);
    }

    if (Number.isFinite(matchSmId) && matchSmId > 0) {
      try {
        const client = tryCreateServiceClient() ?? createServerClient();
        initialResult = await loadSameDayCxUiPayload(client, matchSmId);
      } catch (err) {
        console.warn("[predict] CX hydrate failed", err);
      }
    }
  }

  return (
    <PageShell className="min-h-[calc(100vh-4.5rem)]">
      <PredictionForm
        initialBootstrap={initialBootstrap}
        initialResult={initialResult}
      />
    </PageShell>
  );
}
