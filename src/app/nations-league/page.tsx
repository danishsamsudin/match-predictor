import { PageHero } from "@/components/match-predictor/PageHero";
import { NlGroupMatrixGrid } from "@/components/nations-league/NlGroupMatrixGrid";
import { NationsLeagueRefreshButton } from "@/components/nations-league/NationsLeagueRefreshButton";
import { RecentResultsSection } from "@/components/world-cup/RecentResultsSection";
import { UpcomingFixturesSection } from "@/components/world-cup/UpcomingFixturesSection";
import type { UpcomingMatchCardProps } from "@/components/world-cup/MatchValueFlipCard";
import { WorldCupSectionHelp } from "@/components/world-cup/WorldCupSectionHelp";
import { loadNationsLeagueHubPayload } from "@/lib/nations-league/hub-load";
import { parseHubPrediction } from "@/lib/world-cup/hub-prediction";
import { resolveMatchPhase } from "@/lib/world-cup/match-kickoff";

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
      <div className="mx-auto max-w-3xl px-4 py-12">
        <PageHero
          eyebrow="UEFA Nations League 2026/27"
          title="Nations League hub"
          description="Hub data has not been computed yet. Run npm run nl:seed-fixtures, import form data, then Refresh hub data."
        />
      </div>
    );
  }

  const upcomingCards: UpcomingMatchCardProps[] = payload.upcoming.map((m) => {
    const phase = resolveMatchPhase({
      status: m.status,
      homeGoals: m.home_goals,
      awayGoals: m.away_goals,
      date: m.date,
      time: m.time,
      venueCity: m.venue_city ?? null,
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
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHero
          eyebrow="UEFA Nations League 2026/27"
          title="Nations League hub"
          description="League-phase tables and nl-graham-v1 lines. Prior NL cycles and WCQ form feed the model with lighter weights."
        />
        <NationsLeagueRefreshButton />
      </div>

      <section className="mb-12">
        <h2 className="mb-3 text-lg font-bold text-slate-900 dark:text-white">Group tables</h2>
        <WorldCupSectionHelp title="Nations League groups">
          <p>
            Leagues A–D mini-groups. Emerald = promotion / finals path. Rose = relegation risk
            (Leagues A–C).
          </p>
        </WorldCupSectionHelp>
        <NlGroupMatrixGrid groupMatrix={payload.groupMatrix} />
      </section>

      <section className="mb-12">
        <h2 className="mb-3 text-lg font-bold text-slate-900 dark:text-white">Upcoming</h2>
        <WorldCupSectionHelp title="Model lines">
          <p>
            Predictions from nl-graham-v1 (Graham foundation with NL tier and cycle form weights).
          </p>
        </WorldCupSectionHelp>
        <UpcomingFixturesSection matches={upcomingCards} />
      </section>

      {payload.recent.length > 0 ? (
        <section>
          <h2 className="mb-3 text-lg font-bold text-slate-900 dark:text-white">
            Recent results
          </h2>
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

      <p className="mt-8 text-xs text-slate-400">
        Updated {new Date(payload.updatedAt).toLocaleString()} · {payload.competition}
      </p>
    </div>
  );
}
