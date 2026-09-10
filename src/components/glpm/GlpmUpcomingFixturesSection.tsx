"use client";

import { useState } from "react";
import Link from "next/link";
import { WeatherForecastIcon } from "@/components/prediction-charts/WeatherForecastIcon";
import type { GlpmHubUpcomingMatch, GlpmHubWeather } from "@/lib/glpm/hub-types";
import { buildGlpmCompareHref, fairOddsFromProb } from "@/lib/glpm/hub-prediction-map";
import { SeasonCompareValue } from "@/components/glpm/SeasonCompareValue";
import { PromotedTeamWarningIcon } from "@/components/glpm/PromotedTeamWarningIcon";
import { formatKickoffCardLocal } from "@/lib/utils/kickoff-display";

function pctLabel(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function sourceChipLabel(
  source: GlpmHubUpcomingMatch["predictionSource"]
): string | null {
  if (source === "cx") return "GLPM-CX";
  if (source === "stored") return "Base";
  if (source === "prior") return "Provisional";
  if (source === "live") return "Live";
  return null;
}

function WeatherStrip({ weather }: { weather: GlpmHubWeather }) {
  const place =
    weather.cityName || weather.venueName
      ? ` · ${weather.cityName ?? weather.venueName}`
      : "";

  if (weather.status === "tbc") {
    return (
      <div
        className="glpm-card-weather glpm-card-weather-tbc"
        title={`Home venue kickoff weather${place} - forecast available closer to match day`}
      >
        <span className="glpm-card-weather-tbc-label" aria-hidden>
          Wx
        </span>
        <span className="glpm-card-weather-temp tabular-nums">TBC</span>
        <span className="glpm-card-weather-condition">(forecast TBC)</span>
      </div>
    );
  }

  return (
    <div
      className="glpm-card-weather"
      title={`Home venue forecast via ${weather.source}${place}`}
    >
      <WeatherForecastIcon
        weatherCode={weather.weatherCode}
        condition={weather.condition ?? undefined}
      />
      <span className="glpm-card-weather-temp tabular-nums">
        {weather.tempC != null ? `${weather.tempC}°C` : "TBC"}
      </span>
      <span className="glpm-card-weather-condition">
        ({weather.condition ?? "TBC"})
      </span>
    </div>
  );
}

function MatchWeather({ weather }: { weather: GlpmHubWeather | null }) {
  if (weather) return <WeatherStrip weather={weather} />;
  return (
    <WeatherStrip
      weather={{
        status: "tbc",
        condition: "TBC",
        tempC: null,
        source: "pending",
      }}
    />
  );
}

export function GlpmUpcomingFlipCard({
  match,
  seasonId,
  dayTone = 0,
}: {
  match: GlpmHubUpcomingMatch;
  seasonId?: number | null;
  /** 0 = first match day (primary), 1 = second (accent) - used for rail day accents. */
  dayTone?: 0 | 1;
}) {
  const [flipped, setFlipped] = useState(false);
  const p = match.prediction;
  const prior = match.predictionPriorSeason;
  const priorTitle =
    match.predictionPriorSeasonLabel && match.predictionSeasonLabel
      ? `${match.predictionPriorSeasonLabel} trained ratings`
      : match.predictionPriorSeasonLabel
        ? "Fixture-season trained ratings"
        : "26/27 trained ratings";
  const priorSeasonLabel = match.predictionPriorSeasonLabel;
  const kickoff = formatKickoffCardLocal(match.kickoffAt, match.date);
  const favorite =
    p == null
      ? null
      : p.homeWin >= p.draw && p.homeWin >= p.awayWin
        ? "home"
        : p.awayWin >= p.draw && p.awayWin >= p.homeWin
          ? "away"
          : "draw";
  const chip = sourceChipLabel(match.predictionSource);

  return (
    <div className={`glpm-flip-scene glpm-day-tone-${dayTone}`}>
      <div className={`glpm-flip-inner ${flipped ? "is-flipped" : ""}`}>
        <button
          type="button"
          onClick={() => setFlipped(true)}
          className="glpm-flip-face glpm-flip-front liquid-glass-panel text-left"
          aria-label={`Flip for markets: ${match.homeName} vs ${match.awayName}`}
        >
          <header className="glpm-card-header">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                {match.gameweek != null ? (
                  <span className="glpm-card-badge">GW {match.gameweek}</span>
                ) : (
                  <span className="glpm-card-badge">Upcoming</span>
                )}
                {chip ? <span className="glpm-card-badge">{chip}</span> : null}
                {prior && match.predictionSeasonLabel && match.predictionPriorSeasonLabel ? (
                  <span className="glpm-card-badge glpm-card-badge-compare">
                    {match.predictionSeasonLabel} vs {match.predictionPriorSeasonLabel}
                  </span>
                ) : null}
                <p className="glpm-card-kickoff truncate">{kickoff.fullLabel}</p>
              </div>
              {match.venue ? (
                <p className="glpm-card-venue" title={match.venue}>
                  {match.venue}
                </p>
              ) : null}
            </div>
          </header>

          <MatchWeather weather={match.weather} />

          <div className="glpm-card-matchup">
            <p className="glpm-team-name text-primary">
              <span className="inline-flex max-w-full items-center justify-center gap-1">
                <span className="min-w-0" title={match.homeName}>
                  {match.homeName}
                </span>
                {match.homePromotedWarning ? (
                  <PromotedTeamWarningIcon variant="title" />
                ) : null}
              </span>
            </p>
            <span className="glpm-card-vs">vs</span>
            <p className="glpm-team-name text-accent">
              <span className="inline-flex max-w-full items-center justify-center gap-1">
                <span className="min-w-0" title={match.awayName}>
                  {match.awayName}
                </span>
                {match.awayPromotedWarning ? (
                  <PromotedTeamWarningIcon variant="title" />
                ) : null}
              </span>
            </p>
          </div>

          {p ? (
            <>
              <div className="glpm-card-win-row">
                <div className={`glpm-win-pct-cell ${favorite === "home" ? "is-fav" : ""}`}>
                  <span className="glpm-win-pct-label">Home</span>
                  <span className="glpm-win-pct-value text-primary">
                    <SeasonCompareValue
                      current={pctLabel(p.homeWin)}
                      prior={prior ? pctLabel(prior.homeWin) : null}
                      priorTitle={priorTitle}
                      priorSeasonLabel={priorSeasonLabel}
                    />
                  </span>
                </div>
                <div
                  className={`glpm-win-pct-cell glpm-win-pct-cell-muted ${favorite === "draw" ? "is-fav" : ""}`}
                >
                  <span className="glpm-win-pct-label">Draw</span>
                  <span className="glpm-win-pct-value">
                    <SeasonCompareValue
                      current={pctLabel(p.draw)}
                      prior={prior ? pctLabel(prior.draw) : null}
                      priorTitle={priorTitle}
                      priorSeasonLabel={priorSeasonLabel}
                    />
                  </span>
                </div>
                <div className={`glpm-win-pct-cell ${favorite === "away" ? "is-fav" : ""}`}>
                  <span className="glpm-win-pct-label">Away</span>
                  <span className="glpm-win-pct-value text-accent">
                    <SeasonCompareValue
                      current={pctLabel(p.awayWin)}
                      prior={prior ? pctLabel(prior.awayWin) : null}
                      priorTitle={priorTitle}
                      priorSeasonLabel={priorSeasonLabel}
                    />
                  </span>
                </div>
              </div>

              <div className="glpm-card-prob-bar" aria-hidden>
                <div style={{ width: `${p.homeWin * 100}%` }} className="bg-primary" />
                <div style={{ width: `${p.draw * 100}%` }} className="bg-slate-400/80 dark:bg-slate-500" />
                <div style={{ width: `${p.awayWin * 100}%` }} className="bg-accent" />
              </div>

              <div className="glpm-card-stats-grid">
                <div className="glpm-stat-cell glpm-stat-cell-highlight">
                  <span className="glpm-stat-label">Pred xG</span>
                  <span className="glpm-stat-value">
                    <SeasonCompareValue
                      current={`${p.homeXg.toFixed(2)} - ${p.awayXg.toFixed(2)}`}
                      prior={
                        prior
                          ? `${prior.homeXg.toFixed(2)} - ${prior.awayXg.toFixed(2)}`
                          : null
                      }
                      priorTitle={priorTitle}
                      priorSeasonLabel={priorSeasonLabel}
                    />
                  </span>
                </div>
                <div className="glpm-stat-cell">
                  <span className="glpm-stat-label">Over 2.5</span>
                  <span className="glpm-stat-value">
                    <SeasonCompareValue
                      current={pctLabel(p.over25)}
                      prior={prior ? pctLabel(prior.over25) : null}
                      priorTitle={priorTitle}
                      priorSeasonLabel={priorSeasonLabel}
                    />
                  </span>
                </div>
                <div className="glpm-stat-cell">
                  <span className="glpm-stat-label">BTTS</span>
                  <span className="glpm-stat-value">
                    <SeasonCompareValue
                      current={pctLabel(p.bttsYes)}
                      prior={prior ? pctLabel(prior.bttsYes) : null}
                      priorTitle={priorTitle}
                      priorSeasonLabel={priorSeasonLabel}
                    />
                  </span>
                </div>
                <div className="glpm-stat-cell">
                  <span className="glpm-stat-label">Σ xG</span>
                  <span className="glpm-stat-value">
                    <SeasonCompareValue
                      current={(p.homeXg + p.awayXg).toFixed(2)}
                      prior={prior ? (prior.homeXg + prior.awayXg).toFixed(2) : null}
                      priorTitle={priorTitle}
                      priorSeasonLabel={priorSeasonLabel}
                    />
                  </span>
                </div>
              </div>
            </>
          ) : (
            <p className="glpm-card-empty">
              Ratings not trained for this pair yet. Open compare once vectors are available.
            </p>
          )}

          <span className="glpm-card-flip-btn">Markets →</span>
        </button>

        <div className="glpm-flip-face glpm-flip-back liquid-glass-panel">
          <header className="glpm-card-back-header">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
                GLPM markets
              </p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                <span className="inline-flex items-center gap-1 text-primary">
                  {match.homeName}
                  {match.homePromotedWarning ? (
                    <PromotedTeamWarningIcon variant="title" />
                  ) : null}
                </span>
                <span className="mx-1 text-muted">vs</span>
                <span className="inline-flex items-center gap-1 text-accent">
                  {match.awayName}
                  {match.awayPromotedWarning ? (
                    <PromotedTeamWarningIcon variant="title" />
                  ) : null}
                </span>
              </p>
            </div>
            {chip ? <span className="glpm-card-badge">{chip}</span> : null}
          </header>

          <MatchWeather weather={match.weather} />

          {p ? (
            <div className="glpm-card-back-metrics">
              <div className="glpm-stat-cell">
                <span className="glpm-stat-label">Home xG</span>
                <span className="glpm-stat-value text-primary">
                  <SeasonCompareValue
                    current={p.homeXg.toFixed(2)}
                    prior={prior ? prior.homeXg.toFixed(2) : null}
                    priorTitle={priorTitle}
                      priorSeasonLabel={priorSeasonLabel}
                  />
                </span>
              </div>
              <div className="glpm-stat-cell">
                <span className="glpm-stat-label">Away xG</span>
                <span className="glpm-stat-value text-accent">
                  <SeasonCompareValue
                    current={p.awayXg.toFixed(2)}
                    prior={prior ? prior.awayXg.toFixed(2) : null}
                    priorTitle={priorTitle}
                      priorSeasonLabel={priorSeasonLabel}
                  />
                </span>
              </div>
              <div className="glpm-stat-cell">
                <span className="glpm-stat-label">O/U 2.5 over</span>
                <span className="glpm-stat-value">
                  <SeasonCompareValue
                    current={pctLabel(p.over25)}
                    prior={prior ? pctLabel(prior.over25) : null}
                    priorTitle={priorTitle}
                      priorSeasonLabel={priorSeasonLabel}
                  />
                </span>
              </div>
              <div className="glpm-stat-cell">
                <span className="glpm-stat-label">BTTS yes</span>
                <span className="glpm-stat-value">
                  <SeasonCompareValue
                    current={pctLabel(p.bttsYes)}
                    prior={prior ? pctLabel(prior.bttsYes) : null}
                    priorTitle={priorTitle}
                      priorSeasonLabel={priorSeasonLabel}
                  />
                </span>
              </div>
              <div className="glpm-card-fair-row">
                <div className="glpm-stat-cell glpm-stat-cell-compact">
                  <span className="glpm-stat-label">Fair 1</span>
                  <span className="glpm-stat-value tabular-nums">
                    {fairOddsFromProb(p.homeWin)?.toFixed(2) ?? "-"}
                  </span>
                </div>
                <div className="glpm-stat-cell glpm-stat-cell-compact">
                  <span className="glpm-stat-label">Fair X</span>
                  <span className="glpm-stat-value tabular-nums">
                    {fairOddsFromProb(p.draw)?.toFixed(2) ?? "-"}
                  </span>
                </div>
                <div className="glpm-stat-cell glpm-stat-cell-compact">
                  <span className="glpm-stat-label">Fair 2</span>
                  <span className="glpm-stat-value tabular-nums">
                    {fairOddsFromProb(p.awayWin)?.toFixed(2) ?? "-"}
                  </span>
                </div>
              </div>
              <div className="glpm-stat-cell glpm-stat-cell-highlight glpm-stat-cell-span">
                <span className="glpm-stat-label">1X2</span>
                <span className="glpm-stat-value text-[0.72rem]">
                  {pctLabel(p.homeWin)} / {pctLabel(p.draw)} / {pctLabel(p.awayWin)}
                </span>
              </div>
            </div>
          ) : (
            <p className="glpm-card-empty">
              Prediction unavailable until both sides have rating vectors.
            </p>
          )}

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setFlipped(false)}
              className="text-xs font-semibold text-muted hover:underline"
            >
              Flip back
            </button>
            <Link
              href={buildGlpmCompareHref(match, seasonId)}
              className="rounded-full bg-slate-950 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 dark:bg-white dark:text-slate-950"
            >
              Open compare
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export function GlpmUpcomingFixturesSection({
  matches,
  seasonId,
}: {
  matches: GlpmHubUpcomingMatch[];
  seasonId?: number | null;
}) {
  if (!matches.length) {
    return (
      <p className="text-sm text-muted">
        No upcoming fixtures with open scores for this season.
      </p>
    );
  }

  return (
    <div>
      {matches.some((m) => m.predictionPriorSeason) ? (
        <p className="mb-3 text-sm text-muted">
          Main numbers use last season&apos;s trained ratings (25/26). Bracketed violet values are
          this season&apos;s model (26/27) on the same fixture.
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {matches.map((m) => (
          <GlpmUpcomingFlipCard key={m.matchSmId} match={m} seasonId={seasonId} />
        ))}
      </div>
    </div>
  );
}
