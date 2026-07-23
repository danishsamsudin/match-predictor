import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { HomeLeagueFixturesPanel } from "@/components/glpm/HomeLeagueFixturesPanel";
import { HomeLeagueStandingsPanel } from "@/components/glpm/HomeLeagueStandingsPanel";
import { HomeLiveScoresPanel } from "@/components/glpm/HomeLiveScoresPanel";
import { createServerClient, tryCreateServiceClient } from "@/lib/supabase";
import { BRAND_HERO_EYEBROW, BRAND_HERO_SUBTITLE, BRAND_NAME } from "@/lib/brand";
import { loadGlpmHubPayload, type GlpmHubPayload } from "@/lib/glpm/hub-load";
import { getGlpmLeagueStrength } from "@/lib/glpm/league-strength";
import { loadLiveScoresBoard } from "@/lib/glpm/live-scores/load";
import { placeholderLiveScoresBoard } from "@/lib/glpm/live-scores/placeholders";
import type { LiveScoresBoardPayload } from "@/lib/glpm/live-scores/types";
import {
  loadGlpmStandingsForCompetition,
  type GlpmLeagueStandings,
} from "@/lib/glpm/load-standings";
import { loadPredictionHistoryFeed } from "@/lib/prediction/load-history-feed";

export const metadata: Metadata = {
  title: `Home | ${BRAND_NAME}`,
};

const TARGET_LEAGUES = [
  "Premier League",
  "Eredivisie",
  "Serie A",
  "Bundesliga",
  "Championship",
] as const;

/** Enough open fixtures to cover a busy two-day Championship slate. */
const HOME_UPCOMING_LIMIT = 48;

type HomeLeagueBlock = {
  leagueName: string;
  payload: GlpmHubPayload | null;
};

function getClient() {
  return tryCreateServiceClient() ?? createServerClient();
}

async function loadLeagueBlocks(client: ReturnType<typeof getClient>): Promise<HomeLeagueBlock[]> {
  const basePayload = await loadGlpmHubPayload(client, { preferFixtures: true });
  return Promise.all(
    TARGET_LEAGUES.map(async (name) => {
      const competition = basePayload.competitions.find(
        (item) => item.name.toLowerCase() === name.toLowerCase()
      );
      if (!competition) {
        return { leagueName: name, payload: null };
      }
      const payload = await loadGlpmHubPayload(client, {
        competitionId: competition.smId,
        preferFixtures: true,
        upcomingLimit: HOME_UPCOMING_LIMIT,
      });
      return { leagueName: name, payload };
    })
  );
}

async function loadStandingsBlocks(
  client: ReturnType<typeof getClient>,
  leagueBlocks: HomeLeagueBlock[]
): Promise<GlpmLeagueStandings[]> {
  return Promise.all(
    leagueBlocks.map(async (block) => {
      const competitionId = block.payload?.competition?.smId ?? null;
      if (competitionId == null) {
        return {
          leagueName: block.leagueName,
          competitionId: null,
          seasonId: null,
          seasonName: null,
          rows: [],
        };
      }

      const seasons = (block.payload?.seasons ?? []).filter(
        (s) => s.competitionId === competitionId
      );
      // Prefer the upcoming schedule season (e.g. 2026/27) so standings match
      // home fixtures during the off-season transition; fall back to finished.
      const seasonId =
        seasons.find((s) => s.hasUpcomingMatches)?.smId ??
        seasons.find((s) => s.hasFinishedMatches)?.smId ??
        block.payload?.season?.smId ??
        null;

      return loadGlpmStandingsForCompetition(client, {
        competitionId,
        leagueName: block.leagueName,
        seasonId,
      });
    })
  );
}

export default async function HomePage() {
  let leagueBlocks: HomeLeagueBlock[] = [];
  let standingsBlocks: GlpmLeagueStandings[] = [];
  let history = [] as Awaited<ReturnType<typeof loadPredictionHistoryFeed>>;
  let liveScores: LiveScoresBoardPayload = placeholderLiveScoresBoard();
  let updatedAt: string | null = null;

  try {
    const client = getClient();
    leagueBlocks = await loadLeagueBlocks(client);
    const [standings, historyFeed, liveBoard] = await Promise.all([
      loadStandingsBlocks(client, leagueBlocks),
      loadPredictionHistoryFeed(client, 6),
      loadLiveScoresBoard(client),
    ]);
    standingsBlocks = standings;
    history = historyFeed;
    liveScores = liveBoard;
    updatedAt =
      leagueBlocks.find((block) => block.payload?.updatedAt)?.payload?.updatedAt ?? null;
  } catch {
    leagueBlocks = TARGET_LEAGUES.map((name) => ({ leagueName: name, payload: null }));
    standingsBlocks = TARGET_LEAGUES.map((name) => ({
      leagueName: name,
      competitionId: null,
      seasonId: null,
      seasonName: null,
      rows: [],
    }));
    history = [];
    liveScores = placeholderLiveScoresBoard();
  }

  const fixturesLeagues = leagueBlocks.map((block) => ({
    leagueName: block.leagueName,
    competitionId: block.payload?.competition?.smId ?? null,
    seasonId: block.payload?.season?.smId ?? null,
    matches: block.payload?.upcoming ?? [],
  }));

  const topTeamsSnapshot = leagueBlocks
    .flatMap((block) => {
      const competitionId = block.payload?.competition?.smId ?? null;
      const leagueOmega =
        competitionId != null ? getGlpmLeagueStrength(competitionId) : 0.75;
      return (block.payload?.ratingLeaders ?? []).map((leader) => ({
        league: block.leagueName,
        team: leader.teamName,
        overall: leader.overall,
        leagueOmega,
        adjustedOverall: leader.overall * leagueOmega,
        teamSmId: leader.teamSmId,
        seasonId: block.payload?.season?.smId ?? null,
      }));
    })
    .sort((a, b) => b.adjustedOverall - a.adjustedOverall)
    .slice(0, 8);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <section className="liquid-glass-panel rounded-2xl p-6 sm:rounded-[2rem] sm:p-10">
        <div className="space-y-4">
          <p className="page-hero-eyebrow text-xs font-bold uppercase text-indigo-600 dark:text-cyan-400">
            {BRAND_HERO_EYEBROW}
          </p>
          <h1>
            <BrandLogo size="hero" />
          </h1>
          <p className="max-w-3xl text-sm text-slate-600 dark:text-slate-300 sm:text-base">
            {BRAND_HERO_SUBTITLE}
          </p>
          <div className="flex flex-wrap gap-2.5 pt-2">
            <Link
              href="/predict"
              className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white dark:bg-white dark:text-slate-950"
            >
              Go to Predict
            </Link>
            <Link
              href="/league"
              className="rounded-full border border-glass-border bg-surface px-5 py-2.5 text-sm font-semibold text-foreground"
            >
              Explore League Hub
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <HomeLiveScoresPanel board={liveScores} />
      </section>

      <section className="mt-8">
        <HomeLeagueFixturesPanel leagues={fixturesLeagues} />
      </section>

      <section className="mt-8">
        <HomeLeagueStandingsPanel leagues={standingsBlocks} />
      </section>

      <section className="mt-10 grid gap-4 sm:grid-cols-2">
        <div className="liquid-glass-panel rounded-2xl p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-foreground">Top Teams Snapshot</h3>
              <p className="mt-0.5 text-xs text-muted">
                Ranked by overall × league strength vs Premier League (Ω). PL = 1.0×.
              </p>
            </div>
            <Link
              href="/league"
              className="shrink-0 text-xs font-semibold text-primary hover:underline"
            >
              Full rankings →
            </Link>
          </div>
          <div className="space-y-2">
            {topTeamsSnapshot.map((item) => (
              <div
                key={`${item.league}-${item.teamSmId}`}
                className="flex items-center justify-between rounded-xl border border-glass-border bg-surface/60 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{item.team}</p>
                  <p className="text-xs text-muted">
                    {item.league} · Ω {item.leagueOmega.toFixed(2)}×
                  </p>
                </div>
                <Link
                  href={`/predict?entity=club&mode=compare&home=${item.teamSmId}${item.seasonId != null ? `&seasonId=${item.seasonId}` : ""}`}
                  className="shrink-0 text-right"
                >
                  <p className="text-xs font-semibold text-primary hover:underline">
                    {item.adjustedOverall.toFixed(1)}
                  </p>
                  <p className="text-[10px] text-muted">
                    {item.overall.toFixed(1)} raw
                  </p>
                </Link>
              </div>
            ))}
          </div>
        </div>

        <div className="liquid-glass-panel rounded-2xl p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-bold text-foreground">Recent Community Predictions</h3>
            <Link href="/predictions" className="text-xs font-semibold text-primary hover:underline">
              Open history →
            </Link>
          </div>
          {history.length ? (
            <div className="space-y-2">
              {history.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  className="block rounded-xl border border-glass-border bg-surface/60 px-3 py-2.5"
                >
                  <p className="text-sm font-semibold text-foreground">
                    {item.homeTeamName} <span className="text-muted">vs</span> {item.awayTeamName}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {item.homeWinPct}% / {item.drawPct}% / {item.awayWinPct}% · {item.kind.label}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">No recent predictions yet. Be the first to generate one.</p>
          )}
        </div>
      </section>

      {updatedAt ? (
        <p className="mt-8 text-center text-xs text-muted">
          Model snapshot updated {new Date(updatedAt).toLocaleString()}
        </p>
      ) : null}
    </div>
  );
}
