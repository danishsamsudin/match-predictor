import Link from "next/link";
import { PageHero } from "@/components/match-predictor/PageHero";
import { GroupMatrixGrid } from "@/components/world-cup/GroupMatrixGrid";
import { KnockoutProjectionPanel } from "@/components/world-cup/KnockoutProjectionPanel";
import { RecentResultsSection, type RecentResultMatch } from "@/components/world-cup/RecentResultsSection";
import { TournamentForecastPanel } from "@/components/world-cup/TournamentForecastPanel";
import { UpcomingFixturesSection } from "@/components/world-cup/UpcomingFixturesSection";
import type { UpcomingMatchCardProps } from "@/components/world-cup/MatchValueFlipCard";
import { WorldCupSectionHelp } from "@/components/world-cup/WorldCupSectionHelp";
import { WorldCupRefreshButton } from "@/components/world-cup/WorldCupRefreshButton";
import { loadWorldCupHubPayload } from "@/lib/world-cup/hub-load";
import { isR32HubMatchId } from "@/lib/world-cup/r32-hub-fixtures";

/** Always render with fresh hub payload (knockout scores patch on each request). */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "World Cup 2026 Hub",
  description: "Group tables, third-place matrix, and model predictions for FIFA World Cup 2026",
};

export default async function WorldCupHubPage() {
  const payload = await loadWorldCupHubPayload();

  if (!payload) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <PageHero
          eyebrow="FIFA World Cup 2026"
          title="World Cup hub"
          description="Hub data has not been computed yet. Use Refresh hub data after importing match files, or wait for the daily sync at 18:00 Amsterdam time."
        />
        <WorldCupRefreshButton />
      </div>
    );
  }

  const thirdPlaceByTeamId = new Map(
    payload.thirdPlaceRanking.map((r) => [
      r.teamId,
      { teamId: r.teamId, wildcard_rank: r.wildcard_rank, will_advance: r.will_advance },
    ])
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <PageHero
        eyebrow="FIFA World Cup 2026 · 48 teams"
        title="World Cup bettor hub"
        description="Group standings, best-third matrix, knockout routing, and model lines from the main national predictor (FIFA World Cup compare mode). Refreshes daily. Decimal odds by default."
      />
      <WorldCupRefreshButton initialUpdatedAt={payload.updatedAt} />

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-bold text-slate-900 dark:text-white">Group stage</h2>
        <WorldCupSectionHelp title="How to read these tables">
          <p>
            Standings update from results in the database. Points (Pts) and goal difference (GD)
            follow normal group rules. The top two in each group qualify directly for the Round of
            32. This is a <strong>live table projection</strong>, not a model forecast of final
            group positions.
          </p>
          <p>
            Third-placed teams compete for eight wildcard spots. Badges on third-place rows show
            whether that team would advance today and their rank among all twelve third-placed
            teams (1st-12th).
          </p>
        </WorldCupSectionHelp>
        <GroupMatrixGrid
          groupMatrix={payload.groupMatrix}
          thirdPlaceByTeamId={thirdPlaceByTeamId}
        />
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-bold text-slate-900 dark:text-white">
          Best 8 third-placed teams
        </h2>
        <WorldCupSectionHelp title="Third-place ranking">
          <p>
            All twelve third-placed teams ranked together using FIFA tie-breakers: points, goal
            difference, goals scored, then fair-play points. The top eight rows (green) would
            advance to the Round of 32 today; the bottom four (amber) would be eliminated.
          </p>
          <p>
            This table drives the knockout projection below - when the set of advancing groups
            changes, FIFA&apos;s Annex C matrix picks a different Round of 32 draw.
          </p>
        </WorldCupSectionHelp>
        <div className="liquid-glass-pill overflow-x-auto rounded-2xl">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="px-4 py-2">Rank</th>
                <th>Team</th>
                <th>Grp</th>
                <th>Pts</th>
                <th>GD</th>
                <th>GF</th>
                <th>Fair play</th>
                <th>R32</th>
              </tr>
            </thead>
            <tbody>
              {payload.thirdPlaceRanking.map((row) => (
                <tr
                  key={row.teamId}
                  className={row.will_advance ? "bg-emerald-500/5" : "bg-amber-500/5"}
                >
                  <td className="px-4 py-2 font-medium">{row.wildcard_rank}</td>
                  <td className="py-2">{row.fbrefTeamName}</td>
                  <td className="py-2">{row.groupCode}</td>
                  <td className="py-2">{row.points}</td>
                  <td className="py-2">{row.goalDifference}</td>
                  <td className="py-2">{row.goalsFor}</td>
                  <td className="py-2">{row.fairPlayPoints}</td>
                  <td className="py-2 font-semibold">
                    {row.will_advance ? "Yes" : "No"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-bold text-slate-900 dark:text-white">
          Tournament forecast
        </h2>
        <WorldCupSectionHelp title="Model bracket vs live projection">
          <p>
            This is a <strong>full-tournament model forecast</strong>: predicted scores are applied
            to every remaining group match, then knockout rounds are simulated through the final
            using the same national predictor. It answers who the model expects to win, reach the
            final, and finish third.
          </p>
          <p>
            Each knockout tie runs a fresh <strong>Graham national predictor</strong> call for that
            pairing (venue, form, squad talent, altitude) — not a FIFA-rank shortcut. Later rounds
            use winners from earlier simulated ties.
          </p>
          <p>
            The Round of 32 projection below is different — it only reflects{" "}
            <strong>current group tables</strong> (no simulated future group results).
          </p>
        </WorldCupSectionHelp>
        <TournamentForecastPanel forecast={payload.tournamentForecast} />
      </section>

      <section className="mb-10">
        <KnockoutProjectionPanel
          knockoutProjection={payload.knockoutProjection}
          groupMatrix={payload.groupMatrix}
        />
      </section>

      {payload.recent.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-lg font-bold text-slate-900 dark:text-white">
            Recent results
          </h2>
          <WorldCupSectionHelp title="Post-match stats">
            <p>
              Tap a result to expand a full-time summary — score, possession, expected goals,
              shots, fouls, cards, and more from Opta Analyst match reports.
            </p>
          </WorldCupSectionHelp>
          <RecentResultsSection
            matches={payload.recent.map((m) => ({
              matchId: m.id,
              homeName: m.home_team_name,
              awayName: m.away_team_name,
              homeGoals: m.home_goals,
              awayGoals: m.away_goals,
              date: m.date,
              groupCode: m.group_code,
              summary: m.match_summary,
              modelSquadPrediction: m.model_squad_prediction as RecentResultMatch["modelSquadPrediction"],
            }))}
          />
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-bold text-slate-900 dark:text-white">
          Upcoming · Value matrix
        </h2>
        <WorldCupSectionHelp title="Model lines & value">
          <p>
            Fixtures are grouped by match day and sorted in official kickoff order (earliest first).
            Flip a card for odds and +EV. On phone, swipe sideways through fixtures for that day (one
            card at a time); on larger screens use the arrows when a day has more than three matches.
            Live and final scores appear in a slim strip under each card without changing the card
            layout.
          </p>
          <p>
            Pred. score and over/under tiles use the same engine as the main predict page (national
            compare, FIFA World Cup) and refresh on each daily sync until kickoff; after kickoff the
            line locks. Fair decimal odds are model predictions, not bookmaker prices.
          </p>
        </WorldCupSectionHelp>
        <UpcomingFixturesSection
          matches={payload.upcoming.map(
            (m): UpcomingMatchCardProps => ({
              matchId: m.id,
              homeName: m.home_team_name,
              awayName: m.away_team_name,
              groupCode: m.group_code,
              roundLabel: isR32HubMatchId(m.id) ? "Round of 32" : null,
              venueCity: m.venue_city ?? null,
              venueStadium: m.venue_label ?? m.venue ?? null,
              venueAltitude: m.venue_altitude_meters ?? null,
              matchDate: m.date,
              matchTime: m.time,
              matchPhase: m.match_phase,
              homeGoals: m.home_goals,
              awayGoals: m.away_goals,
              homeFifaRank: m.home_fifa_rank,
              homeFifaPoints: m.home_fifa_points,
              awayFifaRank: m.away_fifa_rank,
              awayFifaPoints: m.away_fifa_points,
              cardPrediction: m.card_prediction,
            })
          )}
        />
      </section>

      <p className="mt-8 text-center text-xs text-slate-500">
        <Link href="/sources" className="underline">
          Data sources & disclaimer
        </Link>
      </p>
    </div>
  );
}
