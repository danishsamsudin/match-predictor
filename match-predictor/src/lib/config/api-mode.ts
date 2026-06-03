import { isSupabaseDataStore } from "@/lib/config/data-source";
import { getMockModeReason } from "@/lib/env/server-env";
import { UpstreamApiError } from "@/lib/types/prediction";

export function shouldUseMockApis(): boolean {
  return getMockModeReason() !== null;
}

/**
 * Block silent mock football data on Vercel production. Local dev can still run
 * without keys; production must use Supabase sync or a configured RapidAPI key.
 */
export function assertProductionFootballDataConfigured(): void {
  if (process.env.VERCEL_ENV !== "production") return;
  if (isSupabaseDataStore()) return;
  const mockReason = getMockModeReason();
  if (!mockReason) return;

  throw new UpstreamApiError(
    "Football data is not configured for this deployment. Set DATA_SOURCE=supabase with Supabase credentials and run sync, or add a valid RAPIDAPI_KEY in the hosting environment."
  );
}

export { getMockModeReason };
