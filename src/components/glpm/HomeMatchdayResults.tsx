import { countryFlagUrl } from "@/lib/glpm/live-scores/league-meta";
import {
  formatScorerLabel,
  goalScorersFromTimeline,
} from "@/lib/glpm/live-scores/map-timeline";
import type { LiveScoreMatch } from "@/lib/glpm/live-scores/types";
import { formatCalendarDateLongLocal } from "@/lib/utils/kickoff-display";

function MiniCrest({
  name,
  logoUrl,
  size = "md",
}: {
  name: string;
  logoUrl: string | null;
  size?: "sm" | "md";
}) {
  const box = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- local + SportMonks CDN logos
      <img
        src={logoUrl}
        alt=""
        width={size === "sm" ? 32 : 40}
        height={size === "sm" ? 32 : 40}
        className={`${box} shrink-0 object-contain`}
      />
    );
  }
  return (
    <div
      className={`flex ${box} shrink-0 items-center justify-center rounded-full border border-glass-border bg-surface/80 text-[10px] font-bold text-muted`}
      aria-hidden
    >
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function LeagueFlag({ iso }: { iso: string }) {
  if (!iso) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote flag CDN
    <img
      src={countryFlagUrl(iso)}
      alt=""
      width={20}
      height={14}
      className="h-3.5 w-5 rounded-sm object-cover shadow-sm"
    />
  );
}

function ScorerColumn({
  lines,
  align,
}: {
  lines: string[];
  align: "left" | "right";
}) {
  if (lines.length === 0) {
    return <div className={align === "right" ? "text-right" : undefined} />;
  }
  return (
    <ul className={`space-y-0.5 ${align === "right" ? "text-right" : ""}`}>
      {lines.map((line) => (
        <li key={line} className="text-[11px] leading-snug text-foreground">
          {line}
        </li>
      ))}
    </ul>
  );
}

function FinishedMatchSummary({ match }: { match: LiveScoreMatch }) {
  const scorers = goalScorersFromTimeline(match.timeline);
  const homeScorers = scorers
    .filter((line) => line.side === "home")
    .map(formatScorerLabel);
  const awayScorers = scorers
    .filter((line) => line.side === "away")
    .map(formatScorerLabel);
  const goalless = match.homeScore === 0 && match.awayScore === 0;

  return (
    <article
      className="rounded-2xl border border-glass-border bg-surface/50 px-3.5 py-3 sm:px-4"
      aria-label={`${match.homeTeamName} ${match.homeScore} - ${match.awayScore} ${match.awayTeamName}, ${match.statusLabel}`}
    >
      <header className="mb-2 flex items-center justify-center gap-1.5">
        <LeagueFlag iso={match.countryIso} />
        <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted">
          {match.leagueName}
        </p>
        <span className="rounded-full bg-slate-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
          {match.statusLabel}
        </span>
      </header>

      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <p className="truncate text-right text-sm font-semibold text-foreground">
            {match.homeTeamName}
          </p>
          <MiniCrest name={match.homeTeamName} logoUrl={match.homeLogoUrl} />
        </div>
        <p className="shrink-0 font-mono text-xl font-bold tabular-nums text-foreground sm:text-2xl">
          {match.homeScore}
          <span className="mx-1 text-muted">-</span>
          {match.awayScore}
        </p>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <MiniCrest name={match.awayTeamName} logoUrl={match.awayLogoUrl} />
          <p className="truncate text-sm font-semibold text-foreground">{match.awayTeamName}</p>
        </div>
      </div>

      <div className="mt-2 border-t border-glass-border/70 pt-2">
        {goalless && scorers.length === 0 ? (
          <p className="text-center text-[11px] text-muted">No goals</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <ScorerColumn lines={homeScorers} align="left" />
            <ScorerColumn lines={awayScorers} align="right" />
          </div>
        )}
      </div>
    </article>
  );
}

function YesterdayScoreChip({ match }: { match: LiveScoreMatch }) {
  return (
    <article
      className="h-full rounded-2xl border border-glass-border bg-surface/50 px-3 py-3"
      aria-label={`${match.leagueName}: ${match.homeTeamName} ${match.homeScore} - ${match.awayScore} ${match.awayTeamName}`}
    >
      <p className="flex items-center justify-center gap-1 truncate text-[10px] font-semibold uppercase tracking-wide text-muted">
        <LeagueFlag iso={match.countryIso} />
        <span className="truncate">{match.leagueName}</span>
      </p>
      <div className="mt-2 flex items-center justify-center gap-2">
        <MiniCrest name={match.homeTeamName} logoUrl={match.homeLogoUrl} size="sm" />
        <p className="font-mono text-lg font-bold tabular-nums text-foreground">
          {match.homeScore}
          <span className="mx-0.5 text-muted">-</span>
          {match.awayScore}
        </p>
        <MiniCrest name={match.awayTeamName} logoUrl={match.awayLogoUrl} size="sm" />
      </div>
      <p className="mt-1.5 truncate text-center text-[11px] font-semibold leading-snug text-foreground">
        {match.homeTeamName}
      </p>
      <p className="truncate text-center text-[11px] leading-snug text-muted">{match.awayTeamName}</p>
    </article>
  );
}

export function HomeMatchdayResults({
  finishedToday,
  yesterday,
  todayDate,
  yesterdayDate,
}: {
  finishedToday: LiveScoreMatch[];
  yesterday: LiveScoreMatch[];
  todayDate: string;
  yesterdayDate: string;
}) {
  if (finishedToday.length === 0 && yesterday.length === 0) return null;

  return (
    <div className="mt-6 space-y-6 border-t border-glass-border/80 pt-5">
      {finishedToday.length > 0 ? (
        <section aria-label="Today's finished matches">
          <div className="mb-3">
            <h3 className="text-base font-bold text-foreground">Today's results</h3>
            <p className="text-xs text-muted">{formatCalendarDateLongLocal(todayDate)}</p>
          </div>
          <div className="grid gap-2.5">
            {finishedToday.map((match) => (
              <FinishedMatchSummary key={match.matchSmId} match={match} />
            ))}
          </div>
        </section>
      ) : null}

      {yesterday.length > 0 ? (
        <section aria-label="Yesterday's scores">
          <div className="mb-3">
            <h3 className="text-base font-bold text-foreground">Yesterday</h3>
            <p className="text-xs text-muted">
              {formatCalendarDateLongLocal(yesterdayDate)} · scroll sideways
            </p>
          </div>
          <ul className="home-results-rail list-none">
            {yesterday.map((match) => (
              <li key={match.matchSmId} className="home-results-rail-card">
                <YesterdayScoreChip match={match} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
