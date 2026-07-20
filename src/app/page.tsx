import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { GlpmUpcomingFixturesSection } from "@/components/glpm/GlpmUpcomingFixturesSection";
import { createServerClient, tryCreateServiceClient } from "@/lib/supabase";
import { BRAND_HERO_EYEBROW, BRAND_HERO_SUBTITLE, BRAND_NAME } from "@/lib/brand";
import { loadGlpmHubPayload, type GlpmHubPayload } from "@/lib/glpm/hub-load";
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
      });
      return { leagueName: name, payload };
    })
  );
}

export default async function HomePage() {
  let leagueBlocks: HomeLeagueBlock[] = [];
  let history = [] as Awaited<ReturnType<typeof loadPredictionHistoryFeed>>;
  let updatedAt: string | null = null;

  try {
    const client = getClient();
    leagueBlocks = await loadLeagueBlocks(client);
    history = await loadPredictionHistoryFeed(client, 6);
    updatedAt =
      leagueBlocks.find((block) => block.payload?.updatedAt)?.payload?.updatedAt ?? null;
  } catch {
    leagueBlocks = TARGET_LEAGUES.map((name) => ({ leagueName: name, payload: null }));
    history = [];
  }

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
              href="/login"
              className="rounded-full border border-glass-border bg-surface px-5 py-2.5 text-sm font-semibold text-foreground"
            >
              Sign in
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
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-xl font-bold text-foreground">Upcoming Fixtures by League</h2>
          <Link href="/league" className="text-sm font-semibold text-primary hover:underline">
            View full hub →
          </Link>
        </div>
        <p className="mb-5 text-sm text-muted">
          Open compare from any card to jump into a prefilled prediction flow.
        </p>
        <div className="space-y-6">
          {leagueBlocks.map((block) => (
            <article key={block.leagueName} className="liquid-glass-panel rounded-2xl p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-foreground">{block.leagueName}</h3>
                {block.payload?.competition?.smId ? (
                  <Link
                    href={`/league?competitionId=${block.payload.competition.smId}${block.payload.season?.smId ? `&seasonId=${block.payload.season.smId}` : ""}`}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    More details →
                  </Link>
                ) : null}
              </div>
              {block.payload ? (
                <GlpmUpcomingFixturesSection
                  matches={block.payload.upcoming.slice(0, 3)}
                  seasonId={block.payload.season?.smId ?? null}
                />
              ) : (
                <p className="text-sm text-muted">
                  This league is not ready yet. Ingest season data to unlock fixtures.
                </p>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10 grid gap-4 sm:grid-cols-2">
        <div className="liquid-glass-panel rounded-2xl p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-bold text-foreground">Top Teams Snapshot</h3>
            <Link href="/league" className="text-xs font-semibold text-primary hover:underline">
              Full rankings →
            </Link>
          </div>
          <div className="space-y-2">
            {leagueBlocks
              .flatMap((block) =>
                (block.payload?.ratingLeaders ?? [])
                  .slice(0, 2)
                  .map((leader) => ({
                    league: block.leagueName,
                    team: leader.teamName,
                    overall: leader.overall,
                    teamSmId: leader.teamSmId,
                    seasonId: block.payload?.season?.smId ?? null,
                  }))
              )
              .slice(0, 8)
              .map((item) => (
                <div
                  key={`${item.league}-${item.teamSmId}`}
                  className="flex items-center justify-between rounded-xl border border-glass-border bg-surface/60 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{item.team}</p>
                    <p className="text-xs text-muted">{item.league}</p>
                  </div>
                  <Link
                    href={`/predict?entity=club&mode=compare&home=${item.teamSmId}${item.seasonId != null ? `&seasonId=${item.seasonId}` : ""}`}
                    className="shrink-0 text-xs font-semibold text-primary hover:underline"
                  >
                    {item.overall.toFixed(1)}
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
