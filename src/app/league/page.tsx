import { PageShell } from "@/components/layout/PageShell";
import { PageHero } from "@/components/match-predictor/PageHero";
import { WorldCupSectionHelp } from "@/components/world-cup/WorldCupSectionHelp";
import { GlpmXgLeaguePicker } from "@/components/glpm/GlpmXgLeaguePicker";
import { GlpmXgTable } from "@/components/glpm/GlpmXgTable";
import { loadGlpmXgHubPayloadCached } from "@/lib/glpm/xg-hub-load-cached";

export const metadata = {
  title: "League xG · GLPM",
  description:
    "Season expected goals table by league - xGF, xGA, xG Score, and live table position",
};

export default async function LeagueXgPage({
  searchParams,
}: {
  searchParams: Promise<{ seasonId?: string; competitionId?: string }>;
}) {
  const sp = await searchParams;
  const seasonId = sp.seasonId ? Number(sp.seasonId) : null;
  const competitionId = sp.competitionId ? Number(sp.competitionId) : null;

  let payload = null;
  let loadError: string | null = null;
  try {
    payload = await loadGlpmXgHubPayloadCached({
      seasonId,
      competitionId,
    });
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Failed to load league xG";
  }

  if (!payload) {
    return (
      <PageShell narrow>
        <PageHero
          eyebrow="GLPM · xG"
          title="League xG"
          description={
            loadError ??
            "xG data unavailable. Configure Supabase and ingest a competition season."
          }
        />
      </PageShell>
    );
  }

  const activeSeasonId =
    payload.season != null ? String(payload.season.smId) : null;
  const activeCompetitionId =
    payload.competition != null ? String(payload.competition.smId) : null;

  return (
    <PageShell>
      <PageHero
        eyebrow="GLPM · xG"
        title="League xG"
        description="Season expected goals for each club, ranked by xG Score (xGF - xGA). Compare against live table position and actual goal difference."
      />

      <div className="mb-8">
        <GlpmXgLeaguePicker
          payload={payload}
          seasonId={activeSeasonId}
          competitionId={activeCompetitionId}
        />
      </div>

      {!payload.competitions.length ? (
        <p className="mb-8 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 type-body text-amber-900 dark:text-amber-200">
          No GLPM competitions ingested yet. Run SportMonks season backfill, then
          refresh match stats.
        </p>
      ) : null}

      {payload.mostlyProxyXg ? (
        <p className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 type-body text-amber-900 dark:text-amber-200">
          Most xG values for this league are shot-based proxies, not provider
          expected goals. Treat rankings as directional.
        </p>
      ) : null}

      <section className="space-y-4">
        <div>
          <h2 className="type-section-title mb-2">xG table</h2>
          <WorldCupSectionHelp title="How to read the table">
            <p>
              Ranked by <strong>xG Score</strong> (xGF - xGA).{" "}
              <strong>Pos</strong> is the live league table position.{" "}
              <strong>Diff</strong> is actual goal difference minus xG Score -
              positive means outperforming expected GD, negative means
              underperforming.
            </p>
          </WorldCupSectionHelp>
        </div>
        <div className="liquid-glass-panel overflow-hidden rounded-2xl p-2 sm:p-3">
          <GlpmXgTable
            rows={payload.xgTable}
            seasonId={payload.season?.smId ?? null}
          />
        </div>
      </section>

      <p className="type-meta mt-8 text-center">
        Updated {new Date(payload.updatedAt).toLocaleString()}
      </p>
    </PageShell>
  );
}
