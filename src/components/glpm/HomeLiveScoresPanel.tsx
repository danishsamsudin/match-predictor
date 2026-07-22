import { countryFlagUrl } from "@/lib/glpm/live-scores/league-meta";
import type { LiveScoreMatch, LiveScoresBoardPayload } from "@/lib/glpm/live-scores/types";

function TeamSide({
  name,
  logoUrl,
  align,
}: {
  name: string;
  logoUrl: string | null;
  align: "left" | "right";
}) {
  return (
    <div
      className={`flex min-w-0 flex-1 flex-col items-center gap-2 ${
        align === "left" ? "sm:items-end sm:pr-2" : "sm:items-start sm:pl-2"
      }`}
    >
      <div className="flex h-14 w-14 items-center justify-center sm:h-16 sm:w-16">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- local + SportMonks CDN logos
          <img
            src={logoUrl}
            alt=""
            width={64}
            height={64}
            className="h-full w-full object-contain"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center rounded-full border border-glass-border bg-surface/80 text-xs font-bold text-muted"
            aria-hidden
          >
            {name.slice(0, 2).toUpperCase()}
          </div>
        )}
      </div>
      <p
        className={`w-full text-center text-sm font-semibold text-foreground sm:text-base ${
          align === "left" ? "sm:text-right" : "sm:text-left"
        }`}
      >
        {name}
      </p>
    </div>
  );
}

function LiveScoreCard({ match }: { match: LiveScoreMatch }) {
  const flagSrc = match.countryIso ? countryFlagUrl(match.countryIso) : null;
  const clock =
    match.minute != null
      ? `${match.statusLabel} · ${match.minute}'`
      : match.statusLabel;

  return (
    <article
      className="rounded-2xl border border-glass-border bg-surface/50 px-4 py-4 sm:px-6 sm:py-5"
      aria-label={`${match.homeTeamName} ${match.homeScore} - ${match.awayScore} ${match.awayTeamName}`}
    >
      <header className="flex items-center justify-center gap-2">
        {flagSrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote flag CDN
          <img
            src={flagSrc}
            alt=""
            width={28}
            height={18}
            className="h-[18px] w-7 rounded-sm object-cover shadow-sm"
          />
        ) : null}
        <h3 className="text-sm font-bold uppercase tracking-wide text-foreground sm:text-base">
          {match.leagueName}
        </h3>
      </header>

      <div className="mt-2 text-center">
        <p className="text-sm font-medium text-foreground sm:text-base">{match.stadiumName}</p>
        <p className="mt-0.5 text-xs text-muted sm:text-sm">{match.roundLabel}</p>
      </div>

      <div className="mt-4 flex items-center gap-2 sm:gap-4">
        <TeamSide name={match.homeTeamName} logoUrl={match.homeLogoUrl} align="left" />

        <div className="flex shrink-0 flex-col items-center gap-1 px-1">
          <p className="font-mono text-3xl font-bold tabular-nums tracking-tight text-foreground sm:text-4xl">
            {match.homeScore}
            <span className="mx-1.5 text-muted sm:mx-2">-</span>
            {match.awayScore}
          </p>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/15 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-500" />
            </span>
            {clock}
          </span>
        </div>

        <TeamSide name={match.awayTeamName} logoUrl={match.awayLogoUrl} align="right" />
      </div>
    </article>
  );
}

export function HomeLiveScoresPanel({ board }: { board: LiveScoresBoardPayload }) {
  const isPreview = board.source === "placeholder";

  return (
    <div className="liquid-glass-panel rounded-2xl p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold text-foreground">Live Scores</h2>
        {isPreview ? (
          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
            Preview layout
          </span>
        ) : board.syncedAt ? (
          <span className="text-xs text-muted">
            Updated {new Date(board.syncedAt).toLocaleTimeString()}
          </span>
        ) : null}
      </div>
      <p className="mb-4 text-sm text-muted">
        {isPreview
          ? "No live matches in your leagues right now. These cards use the same fields SportMonks livescores will fill (league, flag, stadium, matchweek, logos, and score)."
          : "In-play fixtures across your SportMonks leagues, refreshed about every 60 seconds while matches are on."}
      </p>

      {board.matches.length === 0 ? (
        <p className="text-sm text-muted">No live matches at the moment.</p>
      ) : (
        <div className="grid gap-3 sm:gap-4">
          {board.matches.map((match) => (
            <LiveScoreCard key={match.matchSmId} match={match} />
          ))}
        </div>
      )}
    </div>
  );
}
