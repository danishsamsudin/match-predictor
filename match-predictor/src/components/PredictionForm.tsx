"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import type { PredictionResult } from "@/lib/types/prediction";
import type {
  CountryOption,
  EntityType,
  FixtureOption,
  LeagueOption,
  TeamOption,
} from "@/lib/types/football-lookup";
import { PredictionResultCard } from "./PredictionResult";

const DEFAULT_CLUB_COUNTRY = "England";
const DEFAULT_CLUB_LEAGUE_ID = 39;
const DEFAULT_NATIONAL_COUNTRY = "International";
const DEFAULT_NATIONAL_LEAGUE_ID = 1;

function formatFixtureLabel(fixture: FixtureOption): string {
  const kickoff = new Date(fixture.date);
  const dateLabel = kickoff.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const timeLabel = kickoff.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
  return `${fixture.home.name} vs ${fixture.away.name} · ${dateLabel} ${timeLabel}`;
}

function parseFixtureDateTime(isoDate: string): { date: string; time: string } {
  const kickoff = new Date(isoDate);
  return {
    date: kickoff.toISOString().slice(0, 10),
    time: kickoff.toISOString().slice(11, 16),
  };
}

export function PredictionForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PredictionResult | null>(null);

  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [loadingCountries, setLoadingCountries] = useState(true);

  const [entityType, setEntityType] = useState<EntityType>("club");
  const [inputMode, setInputMode] = useState<"fixture" | "compare">("fixture");

  const [matchCountry, setMatchCountry] = useState(DEFAULT_CLUB_COUNTRY);
  const [matchLeagues, setMatchLeagues] = useState<LeagueOption[]>([]);
  const [matchLeagueId, setMatchLeagueId] = useState(String(DEFAULT_CLUB_LEAGUE_ID));
  const [fixtures, setFixtures] = useState<FixtureOption[]>([]);
  const [selectedFixtureId, setSelectedFixtureId] = useState("");
  const [loadingFixtures, setLoadingFixtures] = useState(false);

  const [homeCountry, setHomeCountry] = useState(DEFAULT_CLUB_COUNTRY);
  const [homeLeagues, setHomeLeagues] = useState<LeagueOption[]>([]);
  const [homeLeagueId, setHomeLeagueId] = useState(String(DEFAULT_CLUB_LEAGUE_ID));
  const [homeTeams, setHomeTeams] = useState<TeamOption[]>([]);
  const [homeTeamId, setHomeTeamId] = useState("33");

  const [awayCountry, setAwayCountry] = useState("Netherlands");
  const [awayLeagues, setAwayLeagues] = useState<LeagueOption[]>([]);
  const [awayLeagueId, setAwayLeagueId] = useState(String(DEFAULT_CLUB_LEAGUE_ID));
  const [awayTeams, setAwayTeams] = useState<TeamOption[]>([]);
  const [awayTeamId, setAwayTeamId] = useState("40");

  const [matchId, setMatchId] = useState("");
  const [city, setCity] = useState("Manchester");
  const [date, setDate] = useState("2026-05-29");
  const [time, setTime] = useState("15:00");
  const [dataMode, setDataMode] = useState<string | null>(null);
  const [fixtureSource, setFixtureSource] = useState<string | null>(null);
  const [fixtureNotice, setFixtureNotice] = useState<string | null>(null);

  const fetchLeagues = useCallback(async (country: string, type: EntityType) => {
    const res = await fetch(
      `/api/football/leagues?country=${encodeURIComponent(country)}&entityType=${type}`
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to load leagues");
    return data.leagues as LeagueOption[];
  }, []);

  const fetchTeams = useCallback(async (leagueId: number, type: EntityType) => {
    const res = await fetch(
      `/api/football/teams?league=${leagueId}&entityType=${type}`
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to load teams");
    return data.teams as TeamOption[];
  }, []);

  const fetchFixtures = useCallback(async (leagueId: number) => {
    const res = await fetch(`/api/football/fixtures?league=${leagueId}`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? "Failed to load fixtures");
    }
    setFixtureSource(data.source ?? null);
    setFixtureNotice(data.message ?? null);
    return (data.fixtures ?? []) as FixtureOption[];
  }, []);

  const applyFixture = useCallback((fixture: FixtureOption) => {
    setSelectedFixtureId(String(fixture.id));
    setMatchId(String(fixture.id));
    setHomeTeamId(String(fixture.home.id));
    setAwayTeamId(String(fixture.away.id));
    setHomeCountry(matchCountry);
    setAwayCountry(matchCountry);
    setHomeLeagueId(String(fixture.league.id));
    setAwayLeagueId(String(fixture.league.id));
    setCity(fixture.venueCity || city);
    const { date: d, time: t } = parseFixtureDateTime(fixture.date);
    setDate(d);
    setTime(t);
  }, [matchCountry, city]);

  useEffect(() => {
    fetch("/api/football/status")
      .then((res) => res.json())
      .then((data) => {
        if (data.mode === "mock") {
          setDataMode(data.mockReason ?? data.message ?? "Mock data mode");
        } else if (data.ok === false) {
          setDataMode(data.message ?? "SportAPI7 not connected");
        } else if (data.mode === "live") {
          setDataMode(null);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingCountries(true);
    fetch(`/api/football/countries?entityType=${entityType}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setCountries(data.countries ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load countries.");
      })
      .finally(() => {
        if (!cancelled) setLoadingCountries(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entityType]);

  useEffect(() => {
    setHomeTeams([]);
    setAwayTeams([]);
    if (entityType === "national") {
      setMatchCountry(DEFAULT_NATIONAL_COUNTRY);
      setHomeCountry(DEFAULT_NATIONAL_COUNTRY);
      setAwayCountry(DEFAULT_NATIONAL_COUNTRY);
      setMatchLeagueId(String(DEFAULT_NATIONAL_LEAGUE_ID));
      setHomeLeagueId(String(DEFAULT_NATIONAL_LEAGUE_ID));
      setAwayLeagueId(String(DEFAULT_NATIONAL_LEAGUE_ID));
      setHomeTeamId("4748");
      setAwayTeamId("4710");
      setInputMode("compare");
    } else {
      setMatchCountry(DEFAULT_CLUB_COUNTRY);
      setHomeCountry(DEFAULT_CLUB_COUNTRY);
      setAwayCountry("Netherlands");
      setMatchLeagueId(String(DEFAULT_CLUB_LEAGUE_ID));
      setHomeLeagueId(String(DEFAULT_CLUB_LEAGUE_ID));
      setAwayLeagueId(String(DEFAULT_CLUB_LEAGUE_ID));
      setHomeTeamId("33");
      setAwayTeamId("194");
    }
    setMatchId("");
    setSelectedFixtureId("");
  }, [entityType]);

  useEffect(() => {
    if (!matchCountry || inputMode !== "fixture") return;
    let cancelled = false;
    fetchLeagues(matchCountry, entityType)
      .then((leagues) => {
        if (cancelled) return;
        setMatchLeagues(leagues);
        const hasCurrent = leagues.some((l) => String(l.id) === matchLeagueId);
        if (!hasCurrent && leagues.length) {
          setMatchLeagueId(String(leagues[0].id));
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not load leagues.");
      });
    return () => {
      cancelled = true;
    };
  }, [matchCountry, fetchLeagues, matchLeagueId, entityType, inputMode]);

  useEffect(() => {
    if (!homeCountry) return;
    let cancelled = false;
    fetchLeagues(homeCountry, entityType)
      .then((leagues) => {
        if (!cancelled) setHomeLeagues(leagues);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load home leagues.");
      });
    return () => {
      cancelled = true;
    };
  }, [homeCountry, fetchLeagues, entityType]);

  useEffect(() => {
    if (!awayCountry) return;
    let cancelled = false;
    fetchLeagues(awayCountry, entityType)
      .then((leagues) => {
        if (!cancelled) setAwayLeagues(leagues);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load away leagues.");
      });
    return () => {
      cancelled = true;
    };
  }, [awayCountry, fetchLeagues, entityType]);

  useEffect(() => {
    const leagueId = Number(homeLeagueId);
    if (!Number.isFinite(leagueId)) return;
    let cancelled = false;
    fetchTeams(leagueId, entityType)
      .then((teams) => {
        if (cancelled) return;
        setHomeTeams(teams);
        if (!teams.some((t) => String(t.id) === homeTeamId) && teams.length) {
          setHomeTeamId(String(teams[0].id));
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not load home teams.");
      });
    return () => {
      cancelled = true;
    };
  }, [homeLeagueId, fetchTeams, homeTeamId, entityType]);

  useEffect(() => {
    const leagueId = Number(awayLeagueId);
    if (!Number.isFinite(leagueId)) return;
    let cancelled = false;
    fetchTeams(leagueId, entityType)
      .then((teams) => {
        if (cancelled) return;
        setAwayTeams(teams);
        if (!teams.some((t) => String(t.id) === awayTeamId) && teams.length) {
          setAwayTeamId(String(teams[0].id));
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not load away teams.");
      });
    return () => {
      cancelled = true;
    };
  }, [awayLeagueId, fetchTeams, awayTeamId, entityType]);

  useEffect(() => {
    if (inputMode !== "fixture") return;
    const leagueId = Number(matchLeagueId);
    if (!Number.isFinite(leagueId)) return;
    let cancelled = false;
    setLoadingFixtures(true);
    fetchFixtures(leagueId)
      .then((list) => {
        if (cancelled) return;
        setFixtures(list);
        if (list.length) {
          const defaultFixture = list[0];
          applyFixture(defaultFixture);
        } else {
          setSelectedFixtureId("");
        }
      })
      .catch(async (err) => {
        if (cancelled) return;
        setFixtures([]);
        setFixtureNotice(null);
        setError(
          err instanceof Error ? err.message : "Could not load upcoming matches."
        );
      })
      .finally(() => {
        if (!cancelled) setLoadingFixtures(false);
      });
    return () => {
      cancelled = true;
    };
  }, [matchLeagueId, fetchFixtures, applyFixture, inputMode]);

  function syncFixtureFromTeams(
    homeId: string,
    awayId: string,
    list: FixtureOption[] = fixtures
  ) {
    const match = list.find(
      (f) => f.home.id === Number(homeId) && f.away.id === Number(awayId)
    );
    if (match) {
      setSelectedFixtureId(String(match.id));
      setMatchId(String(match.id));
      const { date: d, time: t } = parseFixtureDateTime(match.date);
      setDate(d);
      setTime(t);
      setCity(match.venueCity || city);
    } else {
      setSelectedFixtureId("");
    }
  }

  function handleFixtureChange(fixtureId: string) {
    const fixture = fixtures.find((f) => String(f.id) === fixtureId);
    if (!fixture) return;
    applyFixture(fixture);
  }

  function handleHomeTeamChange(teamId: string) {
    setHomeTeamId(teamId);
    if (inputMode === "fixture") {
      syncFixtureFromTeams(teamId, awayTeamId);
    } else {
      setMatchId("");
      setSelectedFixtureId("");
    }
  }

  function handleAwayTeamChange(teamId: string) {
    setAwayTeamId(teamId);
    if (inputMode === "fixture") {
      syncFixtureFromTeams(homeTeamId, teamId);
    } else {
      setMatchId("");
      setSelectedFixtureId("");
    }
  }

  const homeLeagueName = homeLeagues.find((l) => String(l.id) === homeLeagueId)?.name;
  const awayLeagueName = awayLeagues.find((l) => String(l.id) === awayLeagueId)?.name;

  const homeTeamName = homeTeams.find((t) => String(t.id) === homeTeamId)?.name;
  const awayTeamName = awayTeams.find((t) => String(t.id) === awayTeamId)?.name;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    const matchDate = `${date}T${time}:00.000Z`;
    const payload =
      inputMode === "compare"
        ? {
            mode: "compare" as const,
            homeTeamId: Number(homeTeamId),
            awayTeamId: Number(awayTeamId),
            homeLeagueId: Number(homeLeagueId),
            awayLeagueId: Number(awayLeagueId),
            entityType,
            homeTeamName: homeTeamName ?? undefined,
            awayTeamName: awayTeamName ?? undefined,
            city,
            matchDate,
          }
        : {
            mode: "fixture" as const,
            matchId: Number(matchId),
            homeTeamId: Number(homeTeamId),
            awayTeamId: Number(awayTeamId),
            homeLeagueId: Number(homeLeagueId),
            awayLeagueId: Number(awayLeagueId),
            entityType,
            homeTeamName: homeTeamName ?? undefined,
            awayTeamName: awayTeamName ?? undefined,
            city,
            matchDate,
          };

    try {
      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Prediction failed");
        return;
      }
      setResult(data);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <form
        onSubmit={handleSubmit}
        className="overflow-hidden rounded-2xl glass glow-primary"
      >
        <div className="h-0.5 bg-gradient-to-r from-primary via-primary-light to-accent" />
        <div className="p-6">
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Match Details</h2>
          </div>
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <ToggleField
            label="Entity type"
            value={entityType}
            onChange={(v) => setEntityType(v as EntityType)}
            options={[
              { value: "club", label: "Clubs" },
              { value: "national", label: "National teams" },
            ]}
          />
          <ToggleField
            label="Input mode"
            value={inputMode}
            onChange={(v) => setInputMode(v as "fixture" | "compare")}
            options={[
              { value: "fixture", label: "Find a fixture", disabled: entityType === "national" },
              { value: "compare", label: "Compare any two teams" },
            ]}
          />
        </div>

        {dataMode && (
          <div className="alert-accent mb-4 rounded-xl px-4 py-3 text-sm">
            {dataMode}. Restart the dev server after changing{" "}
            <code className="text-xs text-foreground-secondary">.env.local</code>. Check{" "}
            <code className="text-xs text-foreground-secondary">/api/football/status</code>.
          </div>
        )}

        {fixtureNotice && (
          <div className="alert-primary mb-4 rounded-xl px-4 py-3 text-sm">{fixtureNotice}</div>
        )}

        {fixtureSource && fixtureSource !== "live" && !dataMode && !fixtureNotice && (
          <div className="alert-accent mb-4 rounded-xl px-4 py-3 text-sm">
            Fixtures are from <strong className="font-semibold">{fixtureSource}</strong> data, not
            SportAPI7 live. Subscribe on RapidAPI or fix your API key.
          </div>
        )}

        {inputMode === "fixture" && entityType === "club" && (
        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Find a match</h3>
            <p className="mt-1 text-xs text-muted">
              Pick an upcoming fixture from a top league — home and away teams fill in
              automatically.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Country"
              value={matchCountry}
              onChange={setMatchCountry}
              disabled={loadingCountries}
              options={countries.map((c) => ({ value: c.name, label: c.name }))}
              placeholder="Select country"
            />
            <SelectField
              label="Competition"
              value={matchLeagueId}
              onChange={setMatchLeagueId}
              disabled={!matchLeagues.length}
              options={matchLeagues.map((l) => ({ value: String(l.id), label: l.name }))}
              placeholder="Select competition"
            />
          </div>

          <SelectField
            label="Upcoming match"
            value={selectedFixtureId}
            onChange={handleFixtureChange}
            disabled={loadingFixtures || !fixtures.length}
            options={fixtures.map((f) => ({
              value: String(f.id),
              label: formatFixtureLabel(f),
            }))}
            placeholder={loadingFixtures ? "Loading matches…" : "Select a match"}
          />
        </section>
        )}

        {inputMode === "fixture" && entityType === "club" && (
        <div className="my-6 border-t border-glass-border" />
        )}

        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {inputMode === "compare" ? "Choose teams to compare" : "Or choose teams manually"}
            </h3>
            <p className="mt-1 text-xs text-muted">
              {inputMode === "compare"
                ? "Pick any two clubs or countries from different leagues — stats are loaded per team."
                : "Select country, competition, and team for each side."}
            </p>
          </div>

          <TeamPicker
            side="Home"
            country={homeCountry}
            leagueId={homeLeagueId}
            teamId={homeTeamId}
            countries={countries}
            leagues={homeLeagues}
            teams={homeTeams}
            onCountryChange={setHomeCountry}
            onLeagueChange={setHomeLeagueId}
            onTeamChange={handleHomeTeamChange}
            disabled={loadingCountries}
          />

          <TeamPicker
            side="Away"
            country={awayCountry}
            leagueId={awayLeagueId}
            teamId={awayTeamId}
            countries={countries}
            leagues={awayLeagues}
            teams={awayTeams}
            onCountryChange={setAwayCountry}
            onLeagueChange={setAwayLeagueId}
            onTeamChange={handleAwayTeamChange}
            disabled={loadingCountries}
          />

          {(homeTeamName || awayTeamName) && (
            <div className="glass-subtle rounded-xl px-4 py-3 text-center text-sm">
              {(homeLeagueName || awayLeagueName) && (
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                  {homeLeagueName === awayLeagueName
                    ? homeLeagueName
                    : [homeLeagueName, awayLeagueName].filter(Boolean).join(" · ")}
                </p>
              )}
              <div>
                <span className="font-semibold text-primary-emphasis">
                  {homeTeamName ?? "Home team"}
                </span>
                <span className="mx-3 text-xs font-medium uppercase tracking-wider text-muted">
                  vs
                </span>
                <span className="font-semibold text-accent-emphasis">
                  {awayTeamName ?? "Away team"}
                </span>
              </div>
            </div>
          )}
        </section>

        <div className="my-6 border-t border-glass-border" />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City" name="city" value={city} onChange={setCity} required />
          <Field label="Match Date" name="date" type="date" value={date} onChange={setDate} required />
          <Field
            label="Kickoff Time (UTC)"
            name="time"
            type="time"
            value={time}
            onChange={setTime}
            required
          />
        </div>

        <input type="hidden" name="matchId" value={matchId} />
        <input type="hidden" name="homeTeamId" value={homeTeamId} />
        <input type="hidden" name="awayTeamId" value={awayTeamId} />

        <button
          type="submit"
          disabled={
            loading ||
            !homeTeamId ||
            !awayTeamId ||
            (inputMode === "fixture" && !matchId)
          }
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-accent px-4 py-3 text-sm font-semibold text-on-gradient shadow-lg shadow-primary/25 transition hover:opacity-90 disabled:opacity-60 sm:w-auto sm:px-8"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Running prediction…
            </>
          ) : (
            "Generate Prediction"
          )}
        </button>
        </div>
      </form>

      {error && (
        <div className="alert-accent rounded-xl px-4 py-3 text-sm">{error}</div>
      )}

      {loading && !result && (
        <div className="animate-pulse rounded-2xl glass p-8">
          <div className="mb-4 h-6 w-48 rounded bg-foreground/10" />
          <div className="mb-2 h-4 w-full rounded bg-foreground/10" />
          <div className="h-4 w-3/4 rounded bg-foreground/10" />
        </div>
      )}

      {result && <PredictionResultCard result={result} />}
    </div>
  );
}

function TeamPicker({
  side,
  country,
  leagueId,
  teamId,
  countries,
  leagues,
  teams,
  onCountryChange,
  onLeagueChange,
  onTeamChange,
  disabled,
}: {
  side: "Home" | "Away";
  country: string;
  leagueId: string;
  teamId: string;
  countries: CountryOption[];
  leagues: LeagueOption[];
  teams: TeamOption[];
  onCountryChange: (value: string) => void;
  onLeagueChange: (value: string) => void;
  onTeamChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-xl glass-subtle p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
        {side} team
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          label="Country"
          value={country}
          onChange={onCountryChange}
          disabled={disabled}
          options={countries.map((c) => ({ value: c.name, label: c.name }))}
          placeholder="Country"
        />
        <SelectField
          label="Competition"
          value={leagueId}
          onChange={onLeagueChange}
          disabled={!leagues.length}
          options={leagues.map((l) => ({ value: String(l.id), label: l.name }))}
          placeholder="Competition"
        />
        <SelectField
          label="Team"
          value={teamId}
          onChange={onTeamChange}
          disabled={!teams.length}
          options={teams.map((t) => ({ value: String(t.id), label: t.name }))}
          placeholder="Team"
        />
      </div>
    </div>
  );
}

function ToggleField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
}) {
  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium text-muted">{label}</span>
      <div className="flex rounded-lg glass-subtle p-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition sm:text-sm ${
              value === option.value
                ? "bg-primary text-on-primary shadow-sm"
                : "text-muted hover:bg-[var(--surface-hover)] hover:text-foreground"
            } disabled:cursor-not-allowed disabled:opacity-40`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="field-control w-full rounded-lg px-3 py-2 text-sm outline-none ring-primary focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {!value && placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Field({
  label,
  name,
  type = "text",
  value,
  onChange,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-muted">{label}</span>
      <input
        name={name}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="field-control w-full rounded-lg px-3 py-2 text-sm outline-none ring-primary focus:ring-2"
      />
    </label>
  );
}
