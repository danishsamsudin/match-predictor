"use client";

/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useState } from "react";
import type { PredictionResult } from "@/lib/types/prediction";
import type {
  CountryOption,
  EntityType,
  FixtureOption,
  LeagueOption,
  TeamOption,
} from "@/lib/types/football-lookup";
import {
  sanitizeUserFacingMessage,
  shouldHideUserFacingWarning,
} from "@/lib/api/user-facing-messages";
import { getDefaultMatchDateTime, parseFixtureDateTime } from "./utils";

const DEFAULT_CLUB_COUNTRY = "England";
const DEFAULT_CLUB_LEAGUE_ID = 39;
const DEFAULT_AWAY_CLUB_COUNTRY = "Netherlands";
const DEFAULT_AWAY_CLUB_LEAGUE_ID = 88;
const DEFAULT_NATIONAL_COUNTRY = "International";
const DEFAULT_NATIONAL_LEAGUE_ID = 1;

function resolveLeagueIdForCountry(
  leagues: LeagueOption[],
  currentLeagueId: string
): string | undefined {
  if (leagues.some((l) => String(l.id) === currentLeagueId)) return currentLeagueId;
  return leagues.length ? String(leagues[0].id) : undefined;
}
const DEFAULT_NATIONAL_HOME_TEAM_ID = "4748";
const DEFAULT_NATIONAL_AWAY_TEAM_ID = "4705";

function teamsForNationalCountry(teams: TeamOption[], country: string): TeamOption[] {
  if (country === "International") return teams;
  const picked = teams.filter((t) => t.name.toLowerCase() === country.toLowerCase());
  return picked.length ? picked : teams;
}

export function usePredictionForm() {
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

  const [awayCountry, setAwayCountry] = useState(DEFAULT_AWAY_CLUB_COUNTRY);
  const [awayLeagues, setAwayLeagues] = useState<LeagueOption[]>([]);
  const [awayLeagueId, setAwayLeagueId] = useState(String(DEFAULT_AWAY_CLUB_LEAGUE_ID));
  const [awayTeams, setAwayTeams] = useState<TeamOption[]>([]);
  const [awayTeamId, setAwayTeamId] = useState("2953");

  const [matchId, setMatchId] = useState("");
  const [city, setCity] = useState("Manchester");
  const [{ date: defaultDate, time: defaultTime }] = useState(getDefaultMatchDateTime);
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState(defaultTime);
  const [fixtureNotice, setFixtureNotice] = useState<string | null>(null);
  const [systemNotice, setSystemNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSystemStatus() {
      try {
        const res = await fetch("/api/football/status");
        const data = (await res.json()) as {
          mode?: string;
          mockReason?: string | null;
          dataSource?: string;
          syncStatus?: { lastSuccessAt?: string | null };
          message?: string;
        };
        if (cancelled) return;

        if (data.mode === "mock") {
          setSystemNotice(
            "This deployment is using placeholder football data. Confirm RAPIDAPI_KEY and DATA_SOURCE=supabase are set for Production on Vercel, then redeploy. If they are already set, the latest app build may still be required to pick them up."
          );
          return;
        }

        if (data.dataSource === "supabase" && !data.syncStatus?.lastSuccessAt) {
          setSystemNotice(
            "Football data sync has not completed yet. Predictions may be incomplete until the daily sync runs or you trigger POST /api/cron/sync."
          );
          return;
        }

        setSystemNotice(null);
      } catch {
        if (!cancelled) setSystemNotice(null);
      }
    }

    void loadSystemStatus();
    return () => {
      cancelled = true;
    };
  }, []);

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
      if (shouldHideUserFacingWarning(data.error)) {
        setFixtureNotice(null);
        return [];
      }
      throw new Error(sanitizeUserFacingMessage(data.error) ?? "Failed to load fixtures");
    }
    setFixtureNotice(sanitizeUserFacingMessage(data.message));
    return (data.fixtures ?? []) as FixtureOption[];
  }, []);

  const applyFixture = useCallback(
    (fixture: FixtureOption) => {
      setSelectedFixtureId(String(fixture.id));
      setMatchId(String(fixture.id));
      setHomeTeamId(String(fixture.home.id));
      setAwayTeamId(String(fixture.away.id));
      setHomeCountry(matchCountry);
      setAwayCountry(matchCountry);
      setHomeLeagueId(String(fixture.league.id));
      setAwayLeagueId(String(fixture.league.id));
      if (fixture.venueCity) {
        setCity(fixture.venueCity);
      }
      const { date: d, time: t } = parseFixtureDateTime(fixture.date);
      setDate(d);
      setTime(t);
    },
    [matchCountry]
  );

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
      setHomeTeamId(DEFAULT_NATIONAL_HOME_TEAM_ID);
      setAwayTeamId(DEFAULT_NATIONAL_AWAY_TEAM_ID);
      setInputMode("compare");
    } else {
      setMatchCountry(DEFAULT_CLUB_COUNTRY);
      setHomeCountry(DEFAULT_CLUB_COUNTRY);
      setAwayCountry(DEFAULT_AWAY_CLUB_COUNTRY);
      setMatchLeagueId(String(DEFAULT_CLUB_LEAGUE_ID));
      setHomeLeagueId(String(DEFAULT_CLUB_LEAGUE_ID));
      setAwayLeagueId(String(DEFAULT_AWAY_CLUB_LEAGUE_ID));
      setHomeTeamId("33");
      setAwayTeamId("2953");
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
        const nextId = resolveLeagueIdForCountry(leagues, matchLeagueId);
        if (nextId && nextId !== matchLeagueId) {
          setMatchLeagueId(nextId);
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
        if (cancelled) return;
        setHomeLeagues(leagues);
        const nextId = resolveLeagueIdForCountry(leagues, homeLeagueId);
        if (nextId && nextId !== homeLeagueId) {
          setHomeLeagueId(nextId);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not load home leagues.");
      });
    return () => {
      cancelled = true;
    };
  }, [homeCountry, fetchLeagues, homeLeagueId, entityType]);

  useEffect(() => {
    if (!awayCountry) return;
    let cancelled = false;
    fetchLeagues(awayCountry, entityType)
      .then((leagues) => {
        if (cancelled) return;
        setAwayLeagues(leagues);
        const nextId = resolveLeagueIdForCountry(leagues, awayLeagueId);
        if (nextId && nextId !== awayLeagueId) {
          setAwayLeagueId(nextId);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not load away leagues.");
      });
    return () => {
      cancelled = true;
    };
  }, [awayCountry, fetchLeagues, awayLeagueId, entityType]);

  useEffect(() => {
    setHomeTeams([]);
  }, [homeCountry]);

  useEffect(() => {
    setAwayTeams([]);
  }, [awayCountry]);

  useEffect(() => {
    const leagueId = Number(homeLeagueId);
    if (!Number.isFinite(leagueId)) return;
    let cancelled = false;
    fetchTeams(leagueId, entityType)
      .then((teams) => {
        if (cancelled) return;
        const list =
          entityType === "national" ? teamsForNationalCountry(teams, homeCountry) : teams;
        setHomeTeams(list);
        if (!list.some((t) => String(t.id) === homeTeamId) && list.length) {
          setHomeTeamId(String(list[0].id));
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not load home teams.");
      });
    return () => {
      cancelled = true;
    };
  }, [homeLeagueId, fetchTeams, homeTeamId, entityType, homeCountry]);

  useEffect(() => {
    const leagueId = Number(awayLeagueId);
    if (!Number.isFinite(leagueId)) return;
    let cancelled = false;
    fetchTeams(leagueId, entityType)
      .then((teams) => {
        if (cancelled) return;
        const list =
          entityType === "national" ? teamsForNationalCountry(teams, awayCountry) : teams;
        setAwayTeams(list);
        if (!list.some((t) => String(t.id) === awayTeamId) && list.length) {
          setAwayTeamId(String(list[0].id));
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not load away teams.");
      });
    return () => {
      cancelled = true;
    };
  }, [awayLeagueId, fetchTeams, awayTeamId, entityType, awayCountry]);

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
          applyFixture(list[0]);
        } else {
          setSelectedFixtureId("");
        }
      })
      .catch(async (err) => {
        if (cancelled) return;
        setFixtures([]);
        setFixtureNotice(null);
        const message =
          err instanceof Error ? err.message : "Could not load upcoming matches.";
        setError(sanitizeUserFacingMessage(message));
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
      if (match.venueCity) {
        setCity(match.venueCity);
      }
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
  const matchLeagueName = matchLeagues.find((l) => String(l.id) === matchLeagueId)?.name;

  const homeTeam = homeTeams.find((t) => String(t.id) === homeTeamId);
  const awayTeam = awayTeams.find((t) => String(t.id) === awayTeamId);
  const homeTeamName = homeTeam?.name;
  const awayTeamName = awayTeam?.name;

  const bridgeCompetition =
    homeLeagueName === awayLeagueName
      ? homeLeagueName ?? matchLeagueName
      : [homeLeagueName, awayLeagueName].filter(Boolean).join(" · ") || matchLeagueName;

  const submitDisabled =
    loading ||
    !homeTeamId ||
    !awayTeamId ||
    (inputMode === "fixture" && !matchId);

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
            homeTeamShortName: homeTeam?.shortName,
            awayTeamShortName: awayTeam?.shortName,
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
            homeTeamShortName: homeTeam?.shortName,
            awayTeamShortName: awayTeam?.shortName,
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
        setError(
          sanitizeUserFacingMessage(data.error) ?? "Unable to complete prediction. Please try again."
        );
        return;
      }
      setResult(data);
    } catch {
      setError("Network error - please try again.");
    } finally {
      setLoading(false);
    }
  }

  return {
    loading,
    error,
    result,
    countries,
    loadingCountries,
    entityType,
    setEntityType,
    inputMode,
    setInputMode,
    matchCountry,
    setMatchCountry,
    matchLeagues,
    matchLeagueId,
    setMatchLeagueId,
    fixtures,
    selectedFixtureId,
    loadingFixtures,
    homeCountry,
    setHomeCountry,
    homeLeagues,
    homeLeagueId,
    setHomeLeagueId,
    homeTeams,
    homeTeamId,
    homeTeam,
    homeTeamName,
    awayCountry,
    setAwayCountry,
    awayLeagues,
    awayLeagueId,
    setAwayLeagueId,
    awayTeams,
    awayTeamId,
    awayTeam,
    awayTeamName,
    matchId,
    city,
    setCity,
    date,
    setDate,
    time,
    setTime,
    fixtureNotice,
    systemNotice,
    homeLeagueName,
    awayLeagueName,
    matchLeagueName,
    bridgeCompetition,
    handleFixtureChange,
    handleHomeTeamChange,
    handleAwayTeamChange,
    applyFixture,
    submitDisabled,
    handleSubmit,
  };
}

export type PredictionFormState = ReturnType<typeof usePredictionForm>;
