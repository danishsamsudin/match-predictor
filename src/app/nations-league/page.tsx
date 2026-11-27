import { PageShell } from "@/components/layout/PageShell";
import { PageHero } from "@/components/match-predictor/PageHero";
import { NlGroupMatrixGrid } from "@/components/nations-league/NlGroupMatrixGrid";
import { NationsLeagueRefreshButton } from "@/components/nations-league/NationsLeagueRefreshButton";
import { RecentResultsSection } from "@/components/world-cup/RecentResultsSection";
import { UpcomingFixturesSection } from "@/components/world-cup/UpcomingFixturesSection";
import type { UpcomingMatchCardProps } from "@/components/world-cup/MatchValueFlipCard";
import { WorldCupSectionHelp } from "@/components/world-cup/WorldCupSectionHelp";
import { loadNationsLeagueHubPayload } from "@/lib/nations-league/hub-load";
import { parseHubPrediction } from "@/lib/world-cup/hub-prediction";
import { resolveNlMatchPhase } from "@/lib/nations-league/nl-match-phase";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Nations League 2026/27 Hub",
  description:
    "League A–D tables and NL Graham model predictions for UEFA Nations League 2026/27",
};

export default async function NationsLeagueHubPage() {
  const payload = await loadNationsLeagueHubPayload();

  if (!payload) {
    return (
      <PageShell narrow>
        <PageHero
          eyebrow="UEFA Nations League 2026/27"
          title="Nations League hub"
          description="Hub data has not been computed yet. Run npm run nl:seed-fixtures, import form data, then Refresh hub data."
        />
      </PageShell>
    );
  }

  const upcomingCards: UpcomingMatchCardProps[] = payload.upcoming.map((m) => {
    const phase = resolveNlMatchPhase({
      status: m.status,
      homeGoals: m.home_goals,
      awayGoals: m.away_goals,
      date: m.date,
      time: m.time,
    });
    const cardPrediction = parseHubPrediction(
      m.prediction as Record<string, unknown> | null,
      phase
    );
    return {
      matchId: m.id,
      homeName: m.home_team_name,
      awayName: m.away_team_name,
      groupCode: m.group_code,
      roundLabel: m.round,
      venueCity: m.venue_city ?? null,
      venueAltitude: null,
      matchDate: m.date,
      matchTime: m.time,
      matchPhase: phase,
      homeGoals: m.home_goals,
      awayGoals: m.away_goals,
      homeFifaRank: null,
      homeFifaPoints: null,
      awayFifaRank: null,
      awayFifaPoints: null,
      cardPrediction,
      nationalLeagueId: 5,
      predictorUrlOverride: m.predictorUrl,
    };
  });

  return (
    <PageShell>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHero
          className="mb-0 sm:mb-0"
          eyebrow="UEFA Nations League 2026/27"
          title="Nations League hub"
          description="League-phase tables and nl-graham-v1 lines. Prior NL cycles and WCQ form feed the model with lighter weights."
        />
        <NationsLeagueRefreshButton />
      </div>

      <section className="mb-10">
        <h2 className="type-section-title mb-3">Group tables</h2>
        <WorldCupSectionHelp title="Nations League groups">
          <p>
            Leagues A–D mini-groups. Emerald = promotion / finals path. Rose = relegation risk
            (Leagues A–C).
          </p>
        </WorldCupSectionHelp>
        <NlGroupMatrixGrid groupMatrix={payload.groupMatrix} />
      </section>

      <section className="mb-10">
        <h2 className="type-section-title mb-3">Upcoming</h2>
        <WorldCupSectionHelp title="Model lines">
          <p>
            Predictions from nl-graham-v1 (Graham foundation with NL tier and cycle form weights).
          </p>
        </WorldCupSectionHelp>
        <UpcomingFixturesSection matches={upcomingCards} />
      </section>

      {payload.recent.length > 0 ? (
        <section>
          <h2 className="type-section-title mb-3">Recent results</h2>
          <RecentResultsSection
            matches={payload.recent.map((m) => ({
              matchId: m.id,
              homeName: m.home_team_name,
              awayName: m.away_team_name,
              homeGoals: m.home_goals,
              awayGoals: m.away_goals,
              date: m.date,
              groupCode: m.group_code,
              summary: null,
            }))}
          />
        </section>
      ) : null}

      <p className="type-meta mt-8">
        Updated {new Date(payload.updatedAt).toLocaleString()} · {payload.competition}
      </p>
    </PageShell>
  );
}
