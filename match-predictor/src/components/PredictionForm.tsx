"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import type { PredictionResult } from "@/lib/types/prediction";
import type {
  CountryOption,
  FixtureOption,
  LeagueOption,
  TeamOption,
} from "@/lib/types/football-lookup";
import { PredictionResultCard } from "./PredictionResult";

const DEFAULT_COUNTRY = "England";
const DEFAULT_LEAGUE_ID = 39;

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

  const [matchCountry, setMatchCountry] = useState(DEFAULT_COUNTRY);
  const [matchLeagues, setMatchLeagues] = useState<LeagueOption[]>([]);
  const [matchLeagueId, setMatchLeagueId] = useState(String(DEFAULT_LEAGUE_ID));
  const [fixtures, setFixtures] = useState<FixtureOption[]>([]);
  const [selectedFixtureId, setSelectedFixtureId] = useState("");
  const [loadingFixtures, setLoadingFixtures] = useState(false);

  const [homeCountry, setHomeCountry] = useState(DEFAULT_COUNTRY);
  const [homeLeagues, setHomeLeagues] = useState<LeagueOption[]>([]);
  const [homeLeagueId, setHomeLeagueId] = useState(String(DEFAULT_LEAGUE_ID));
  const [homeTeams, setHomeTeams] = useState<TeamOption[]>([]);
  const [homeTeamId, setHomeTeamId] = useState("33");

  const [awayCountry, setAwayCountry] = useState(DEFAULT_COUNTRY);
  const [awayLeagues, setAwayLeagues] = useState<LeagueOption[]>([]);
  const [awayLeagueId, setAwayLeagueId] = useState(String(DEFAULT_LEAGUE_ID));
  const [awayTeams, setAwayTeams] = useState<TeamOption[]>([]);
  const [awayTeamId, setAwayTeamId] = useState("40");

  const [matchId, setMatchId] = useState("");
  const [city, setCity] = useState("Manchester");
  const [date, setDate] = useState("2026-05-29");
  const [time, setTime] = useState("15:00");
  const [dataMode, setDataMode] = useState<string | null>(null);
  const [fixtureSource, setFixtureSource] = useState<string | null>(null);

  const fetchLeagues = useCallback(async (country: string) => {
    const res = await fetch(`/api/football/leagues?country=${encodeURIComponent(country)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to load leagues");
    return data.leagues as LeagueOption[];
  }, []);

  const fetchTeams = useCallback(async (leagueId: number) => {
    const res = await fetch(`/api/football/teams?league=${leagueId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to load teams");
    return data.teams as TeamOption[];
  }, []);

  const fetchFixtures = useCallback(async (leagueId: number) => {
    const res = await fetch(`/api/football/fixtures?league=${leagueId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to load fixtures");
    setFixtureSource(data.source ?? null);
    return data.fixtures as FixtureOption[];
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

    fetch("/api/football/countries")
      .then((res) => res.json())
      .then((data) => setCountries(data.countries ?? []))
      .catch(() => setError("Could not load countries."))
      .finally(() => setLoadingCountries(false));
  }, []);

  useEffect(() => {
    if (!matchCountry) return;
    fetchLeagues(matchCountry)
      .then((leagues) => {
        setMatchLeagues(leagues);
        const hasCurrent = leagues.some((l) => String(l.id) === matchLeagueId);
        if (!hasCurrent && leagues.length) {
          setMatchLeagueId(String(leagues[0].id));
        }
      })
      .catch(() => setError("Could not load leagues."));
  }, [matchCountry, fetchLeagues, matchLeagueId]);

  useEffect(() => {
    if (!homeCountry) return;
    fetchLeagues(homeCountry)
      .then(setHomeLeagues)
      .catch(() => setError("Could not load home leagues."));
  }, [homeCountry, fetchLeagues]);

  useEffect(() => {
    if (!awayCountry) return;
    fetchLeagues(awayCountry)
      .then(setAwayLeagues)
      .catch(() => setError("Could not load away leagues."));
  }, [awayCountry, fetchLeagues]);

  useEffect(() => {
    const leagueId = Number(homeLeagueId);
    if (!Number.isFinite(leagueId)) return;
    fetchTeams(leagueId)
      .then((teams) => {
        setHomeTeams(teams);
        if (!teams.some((t) => String(t.id) === homeTeamId) && teams.length) {
          setHomeTeamId(String(teams[0].id));
        }
      })
      .catch(() => setError("Could not load home teams."));
  }, [homeLeagueId, fetchTeams, homeTeamId]);

  useEffect(() => {
    const leagueId = Number(awayLeagueId);
    if (!Number.isFinite(leagueId)) return;
    fetchTeams(leagueId)
      .then((teams) => {
        setAwayTeams(teams);
        if (!teams.some((t) => String(t.id) === awayTeamId) && teams.length) {
          setAwayTeamId(String(teams[0].id));
        }
      })
      .catch(() => setError("Could not load away teams."));
  }, [awayLeagueId, fetchTeams, awayTeamId]);

  useEffect(() => {
    const leagueId = Number(matchLeagueId);
    if (!Number.isFinite(leagueId)) return;
    setLoadingFixtures(true);
    fetchFixtures(leagueId)
      .then((list) => {
        setFixtures(list);
        if (list.length) {
          const defaultFixture = list[0];
          applyFixture(defaultFixture);
        } else {
          setSelectedFixtureId("");
        }
      })
      .catch(() => setError("Could not load upcoming matches."))
      .finally(() => setLoadingFixtures(false));
  }, [matchLeagueId, fetchFixtures, applyFixture]);

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
    syncFixtureFromTeams(teamId, awayTeamId);
  }

  function handleAwayTeamChange(teamId: string) {
    setAwayTeamId(teamId);
    syncFixtureFromTeams(homeTeamId, teamId);
  }

  const homeTeamName = homeTeams.find((t) => String(t.id) === homeTeamId)?.name;
  const awayTeamName = awayTeams.find((t) => String(t.id) === awayTeamId)?.name;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    const matchDate = `${date}T${time}:00.000Z`;
    const payload = {
      matchId: Number(matchId),
      homeTeamId: Number(homeTeamId),
      awayTeamId: Number(awayTeamId),
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
        className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="mb-6 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-emerald-600" />
          <h2 className="text-lg font-semibold">Match Details</h2>
        </div>

        {dataMode && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            {dataMode}. Restart the dev server after changing <code className="text-xs">.env.local</code>.
            Check <code className="text-xs">/api/football/status</code>.
          </div>
        )}

        {fixtureSource && fixtureSource !== "live" && !dataMode && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            Fixtures are from <strong>{fixtureSource}</strong> data, not SportAPI7 live. Subscribe on RapidAPI or fix your API key.
          </div>
        )}

        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Find a match
            </h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
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

        <div className="my-6 border-t border-zinc-200 dark:border-zinc-800" />

        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Or choose teams manually
            </h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Select country, competition, and team for each side. Changing teams clears the
              match selection above.
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
            <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
              <span className="font-medium">{homeTeamName ?? "Home team"}</span>
              <span className="mx-2 text-emerald-600 dark:text-emerald-400">vs</span>
              <span className="font-medium">{awayTeamName ?? "Away team"}</span>
            </div>
          )}
        </section>

        <div className="my-6 border-t border-zinc-200 dark:border-zinc-800" />

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
          disabled={loading || !matchId || !homeTeamId || !awayTeamId}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60 sm:w-auto sm:px-8"
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
      </form>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {loading && !result && (
        <div className="animate-pulse rounded-2xl border border-zinc-200 bg-zinc-50 p-8 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-4 h-6 w-48 rounded bg-zinc-200 dark:bg-zinc-700" />
          <div className="mb-2 h-4 w-full rounded bg-zinc-200 dark:bg-zinc-700" />
          <div className="h-4 w-3/4 rounded bg-zinc-200 dark:bg-zinc-700" />
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
    <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
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
      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800"
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
      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
      <input
        name={name}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-800"
      />
    </label>
  );
}
