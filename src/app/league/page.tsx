import { PageHero } from "@/components/match-predictor/PageHero";
import { WorldCupSectionHelp } from "@/components/world-cup/WorldCupSectionHelp";
import { GlpmHubSeasonPicker } from "@/components/glpm/GlpmHubSeasonPicker";
import { GlpmRatingLeadersGrid } from "@/components/glpm/GlpmRatingLeadersGrid";
import { GlpmRecentResultsSection } from "@/components/glpm/GlpmRecentResultsSection";
import { GlpmUpcomingFixturesSection } from "@/components/glpm/GlpmUpcomingFixturesSection";
import { loadGlpmHubPayloadCached } from "@/lib/glpm/hub-load-cached";

export const metadata = {
  title: "League Hub · GLPM",
  description:
    "Club rating leaders, recent results, and GLPM model lines for league fixtures",
};

export default async function LeagueHubPage({
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
    payload = await loadGlpmHubPayloadCached({
      seasonId,
      competitionId,
      includeWeather: false,
    });
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Failed to load league hub";
  }

  if (!payload) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <PageHero
          eyebrow="GLPM · Clubs"
          title="League hub"
          description={
            loadError ??
            "Hub data unavailable. Configure Supabase and ingest a competition season."
          }
        />
      </div>
    );
  }

  const activeSeasonId =
    payload.season != null ? String(payload.season.smId) : null;
  const activeCompetitionId =
    payload.competition != null ? String(payload.competition.smId) : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <PageHero
        eyebrow="Graham League Prediction Model"
        title="League bettor hub"
        description="Rating leaders, recent match stats, and GLPM 1X2 / xG lines for club competitions. Same engine as Clubs compare on Predict."
      />

      <GlpmHubSeasonPicker
        payload={payload}
        seasonId={activeSeasonId}
        competitionId={activeCompetitionId}
      />

      {!payload.competitions.length ? (
        <p className="mb-8 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          No GLPM competitions ingested yet. Run SportMonks season backfill, train ratings, then
          assemble vectors.
        </p>
      ) : null}

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-bold text-slate-900 dark:text-white">
          Rating leaders
        </h2>
        <WorldCupSectionHelp title="How to read the table">
          <p>
            Overall is the mean of the seven GLPM primaries (Attack, Defence, Goalkeeper, Build-up,
            Possession, Pressing, Finishing). Values are 0–100 from the latest rating vector for the
            selected season.
          </p>
        </WorldCupSectionHelp>
        <GlpmRatingLeadersGrid leaders={payload.ratingLeaders} seasonId={payload.season?.smId ?? null} />
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-bold text-slate-900 dark:text-white">
          Recent results
        </h2>
        <WorldCupSectionHelp title="Post-match stats">
          <p>
            Expand a result for Layer-1 stats (xG, shots, possession, PPDA) and the pre-match GLPM
            1X2 / xG line when available.
          </p>
        </WorldCupSectionHelp>
        <GlpmRecentResultsSection matches={payload.recent} seasonId={payload.season?.smId ?? null} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold text-slate-900 dark:text-white">
          Upcoming · Model lines
        </h2>
        <WorldCupSectionHelp title="Model lines">
          <p>
            Flip a card for O/U 2.5 and BTTS. Open compare deep-links into Clubs Predict with the
            same GLPM engine.
          </p>
        </WorldCupSectionHelp>
        <GlpmUpcomingFixturesSection matches={payload.upcoming} seasonId={payload.season?.smId ?? null} />
      </section>

      <p className="mt-8 text-center text-xs text-muted">
        Updated {new Date(payload.updatedAt).toLocaleString()}
      </p>
    </div>
  );
}
