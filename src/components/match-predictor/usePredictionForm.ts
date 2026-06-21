"use client";

/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  parsePredictorPrefillFromSearchParams,
  PREDICTOR_PREFILL_DEFAULTS,
} from "@/lib/world-cup/predictor-prefill";
import {
  buildCustomLineupsFromSelections,
  isXiComplete,
} from "@/lib/prediction/build-custom-lineup";
import type { FixtureLineup } from "@/lib/types/football";
import type { PredictRequest, PredictionLineupSource, PredictionResult } from "@/lib/types/prediction";
import {
  slotsFromSuggestedStarters,
  type SquadRosterData,
} from "./SquadXiPicker";
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
import { localDateTimeToUtcIso, wcDateTimeToUtcIso } from "@/lib/utils/kickoff-display";
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
const EMPTY_XI_SLOTS: (number | null)[] = Array(11).fill(null);

async function fetchTeamSquad(input: {
  teamId: number;
  teamName?: string;
  leagueId: number;
  entityType: EntityType;
}): Promise<SquadRosterData> {
  const params = new URLSearchParams({
    teamId: String(input.teamId),
    leagueId: String(input.leagueId),
    entityType: input.entityType,
  });
  if (input.teamName) params.set("teamName", input.teamName);
  const res = await fetch(`/api/teams/squad?${params}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? "Failed to load squad");
  }
  return {
    teamId: data.teamId,
    teamName: input.teamName ?? data.teamName ?? "Team",
    preferredFormation: data.preferredFormation ?? null,
    roster: data.roster ?? [],
    suggestedStarters: data.suggestedStarters ?? [],
  };
}

export function usePredictionForm() {
  const searchParams = useSearchParams();
  const urlPrefill = useMemo(
    () => parsePredictorPrefillFromSearchParams(searchParams),
    [searchParams]
  );
  const prefillAppliedRef = useRef(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [resultsBySource, setResultsBySource] = useState<
    Partial<Record<PredictionLineupSource, PredictionResult>>
  >({});
  const [lineupSource, setLineupSource] = useState<PredictionLineupSource>("manual_xi");
  const lastPayloadRef = useRef<PredictRequest | null>(null);

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
  const [prefillHomeName, setPrefillHomeName] = useState<string | undefined>();
  const [prefillAwayName, setPrefillAwayName] = useState<string | undefined>();

  const [homeRosterData, setHomeRosterData] = useState<SquadRosterData | null>(null);
  const [awayRosterData, setAwayRosterData] = useState<SquadRosterData | null>(null);
  const [homeXiSlots, setHomeXiSlots] = useState<(number | null)[]>(EMPTY_XI_SLOTS);
  const [awayXiSlots, setAwayXiSlots] = useState<(number | null)[]>(EMPTY_XI_SLOTS);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);
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
        return [];
      }
      throw new Error(sanitizeUserFacingMessage(data.error) ?? "Failed to load fixtures");
    }
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
    if (!urlPrefill || prefillAppliedRef.current) return;
    prefillAppliedRef.current = true;
    setEntityType(urlPrefill.entityType);
    setInputMode(urlPrefill.inputMode);
    if (urlPrefill.entityType === "national") {
      setMatchCountry(PREDICTOR_PREFILL_DEFAULTS.nationalCountry);
      setHomeCountry(PREDICTOR_PREFILL_DEFAULTS.nationalCountry);
      setAwayCountry(PREDICTOR_PREFILL_DEFAULTS.nationalCountry);
      setMatchLeagueId(String(PREDICTOR_PREFILL_DEFAULTS.nationalLeagueId));
      setHomeLeagueId(String(PREDICTOR_PREFILL_DEFAULTS.nationalLeagueId));
      setAwayLeagueId(String(PREDICTOR_PREFILL_DEFAULTS.nationalLeagueId));
    }
    setHomeTeamId(String(urlPrefill.homeTeamId));
    setAwayTeamId(String(urlPrefill.awayTeamId));
    if (urlPrefill.city) setCity(urlPrefill.city);
    if (urlPrefill.date) setDate(urlPrefill.date);
    if (urlPrefill.time) setTime(urlPrefill.time);
    if (urlPrefill.homeName) setPrefillHomeName(urlPrefill.homeName);
    if (urlPrefill.awayName) setPrefillAwayName(urlPrefill.awayName);
    setMatchId("");
    setSelectedFixtureId("");
  }, [urlPrefill]);

  useEffect(() => {
    if (urlPrefill) return;
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
  }, [entityType, urlPrefill]);

  useEffect(() => {
    if (entityType !== "national") return;
    if (homeCountry !== DEFAULT_NATIONAL_COUNTRY) setHomeCountry(DEFAULT_NATIONAL_COUNTRY);
    if (awayCountry !== DEFAULT_NATIONAL_COUNTRY) setAwayCountry(DEFAULT_NATIONAL_COUNTRY);
  }, [entityType, homeCountry, awayCountry]);

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
        setHomeTeams(teams);
        if (
          !prefillAppliedRef.current &&
          !teams.some((t) => String(t.id) === homeTeamId) &&
          teams.length
        ) {
          setHomeTeamId(String(teams[0].id));
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
        setAwayTeams(teams);
        if (
          !prefillAppliedRef.current &&
          !teams.some((t) => String(t.id) === awayTeamId) &&
          teams.length
        ) {
          setAwayTeamId(String(teams[0].id));
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
  const homeTeamName = homeTeam?.name ?? prefillHomeName;
  const awayTeamName = awayTeam?.name ?? prefillAwayName;

  const bridgeCompetition =
    homeLeagueName === awayLeagueName
      ? homeLeagueName ?? matchLeagueName
      : [homeLeagueName, awayLeagueName].filter(Boolean).join(" · ") || matchLeagueName;

  const showXiPicker = Boolean(homeTeamId && awayTeamId);

  useEffect(() => {
    setResultsBySource({});
    setResult(null);
  }, [homeTeamId, awayTeamId, inputMode, entityType]);

  useEffect(() => {
    if (!showXiPicker) {
      setHomeRosterData(null);
      setAwayRosterData(null);
      setHomeXiSlots(EMPTY_XI_SLOTS);
      setAwayXiSlots(EMPTY_XI_SLOTS);
      setRosterError(null);
      setRosterLoading(false);
      return;
    }

    let cancelled = false;
    setRosterLoading(true);
    setRosterError(null);
    setHomeRosterData(null);
    setAwayRosterData(null);
    setHomeXiSlots(EMPTY_XI_SLOTS);
    setAwayXiSlots(EMPTY_XI_SLOTS);

    const homeName = homeTeams.find((t) => String(t.id) === homeTeamId)?.name ?? prefillHomeName;
    const awayName = awayTeams.find((t) => String(t.id) === awayTeamId)?.name ?? prefillAwayName;

    Promise.all([
      fetchTeamSquad({
        teamId: Number(homeTeamId),
        teamName: homeName,
        leagueId: Number(homeLeagueId),
        entityType,
      }),
      fetchTeamSquad({
        teamId: Number(awayTeamId),
        teamName: awayName,
        leagueId: Number(awayLeagueId),
        entityType,
      }),
    ])
      .then(([homeSquad, awaySquad]) => {
        if (cancelled) return;
        setHomeRosterData(homeSquad);
        setAwayRosterData(awaySquad);
        setHomeXiSlots(slotsFromSuggestedStarters(homeSquad.suggestedStarters));
        setAwayXiSlots(slotsFromSuggestedStarters(awaySquad.suggestedStarters));
        if (!homeSquad.roster.length || !awaySquad.roster.length) {
          setRosterError("Squad data is unavailable for one or both teams.");
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setRosterError(
          err instanceof Error ? err.message : "Could not load squad rosters."
        );
      })
      .finally(() => {
        if (!cancelled) setRosterLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    showXiPicker,
    homeTeamId,
    awayTeamId,
    homeLeagueId,
    awayLeagueId,
    entityType,
    homeTeams,
    awayTeams,
    prefillHomeName,
    prefillAwayName,
  ]);

  const xiSelectionComplete =
    isXiComplete(homeXiSlots) && isXiComplete(awayXiSlots);

  const submitDisabled =
    loading ||
    !homeTeamId ||
    !awayTeamId ||
    (inputMode === "fixture" && !matchId) ||
    (lineupSource === "manual_xi" && (rosterLoading || !xiSelectionComplete));

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const matchDate =
      entityType === "national"
        ? wcDateTimeToUtcIso(date, time)
        : localDateTimeToUtcIso(date, time);
    const basePayload =
      inputMode === "compare"
        ? {
            mode: "compare" as const,
            lineupSource,
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
            lineupSource,
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

    const customLineups =
      lineupSource === "manual_xi" &&
      homeRosterData &&
      awayRosterData &&
      xiSelectionComplete
        ? buildCustomLineupsFromSelections(
            {
              teamId: homeRosterData.teamId,
              teamName: homeRosterData.teamName,
              preferredFormation: homeRosterData.preferredFormation,
              roster: homeRosterData.roster,
            },
            {
              teamId: awayRosterData.teamId,
              teamName: awayRosterData.teamName,
              preferredFormation: awayRosterData.preferredFormation,
              roster: awayRosterData.roster,
            },
            homeXiSlots.filter((id): id is number => id != null),
            awayXiSlots.filter((id): id is number => id != null)
          )
        : undefined;

    const payload: PredictRequest =
      customLineups?.length
        ? { ...basePayload, customLineups }
        : basePayload;

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
      const typed = data as PredictionResult;
      lastPayloadRef.current = payload;
      setResult(typed);
      setResultsBySource((prev) => ({
        ...prev,
        [lineupSource]: typed,
      }));
    } catch {
      setError("Network error - please try again.");
    } finally {
      setLoading(false);
    }
  }

  const rerunWithCustomLineups = useCallback(async (customLineups: FixtureLineup[]) => {
    const base = lastPayloadRef.current;
    if (!base) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...base,
          customLineups,
          lineupSource: "manual_xi" as const,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          sanitizeUserFacingMessage(data.error) ?? "Unable to complete prediction. Please try again."
        );
        return;
      }
      const typed = data as PredictionResult;
      setResult(typed);
      setResultsBySource((prev) => ({
        ...prev,
        manual_xi: typed,
      }));
    } catch {
      setError("Network error - please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
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
    rerunWithCustomLineups,
    showXiPicker,
    lineupSource,
    setLineupSource,
    resultsBySource,
    homeRosterData,
    awayRosterData,
    homeXiSlots,
    awayXiSlots,
    setHomeXiSlots,
    setAwayXiSlots,
    rosterLoading,
    rosterError,
  };
}

export type PredictionFormState = ReturnType<typeof usePredictionForm>;
