"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ModeToolbar } from "@/components/match-predictor/ModeToolbar";
import { PageHero } from "@/components/match-predictor/PageHero";
import { InfoTip } from "@/components/ui/InfoTip";
import type { GlpmCxPredictPayload } from "@/lib/glpm-cx/run-cx-predict";
import type { GlpmPickerBootstrap } from "@/lib/glpm/load-teams-for-season";
import type { EntityType } from "@/lib/types/football-lookup";
import { sanitizeUserFacingMessage } from "@/lib/api/user-facing-messages";
import { isPriorGlpmSeasonId } from "@/lib/sportmonks/constants";

const GlpmInsightsDashboard = dynamic(
  () =>
    import("@/components/glpm/insights/GlpmInsightsDashboard").then((m) => ({
      default: m.GlpmInsightsDashboard,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="animate-pulse space-y-3 rounded-2xl border border-glass-border p-6">
        <div className="mb-4 h-6 w-48 rounded bg-slate-200/80 dark:bg-slate-700/50" />
        <div className="mb-2 h-4 w-full rounded bg-slate-200/60 dark:bg-slate-700/40" />
        <div className="h-4 w-3/4 rounded bg-slate-200/60 dark:bg-slate-700/40" />
      </div>
    ),
  }
);

type CompetitionOption = {
  id: number;
  name: string;
  areaName: string | null;
  defaultSeasonId?: number | null;
};
type SeasonOption = {
  id: number;
  name: string | null;
  competitionId: number;
  isPredictReady?: boolean;
  hasFinishedMatches?: boolean;
};
type TeamOption = {
  id: number;
  name: string;
  shortName: string | null;
  promotedWarning?: boolean;
};

function pickHomeAway(
  list: TeamOption[],
  prefillHome: string | null,
  prefillAway: string | null,
  prevHome: string,
  prevAway: string
): { home: string; away: string } {
  const home =
    (prevHome && list.some((t) => String(t.id) === prevHome) ? prevHome : null) ??
    (prefillHome && list.some((t) => String(t.id) === prefillHome)
      ? prefillHome
      : null) ??
    (list.length ? String(list[0].id) : "");
  const away =
    (prevAway && list.some((t) => String(t.id) === prevAway) && prevAway !== home
      ? prevAway
      : null) ??
    (prefillAway &&
    list.some((t) => String(t.id) === prefillAway) &&
    prefillAway !== home
      ? prefillAway
      : null) ??
    (() => {
      const fallback = list.find((t) => String(t.id) !== home);
      return fallback ? String(fallback.id) : "";
    })();
  return { home, away };
}

export function GlpmClubPredictor({
  entityType,
  onEntityTypeChange,
  initialBootstrap,
  initialResult,
}: {
  entityType: EntityType;
  onEntityTypeChange: (v: EntityType) => void;
  initialBootstrap?: GlpmPickerBootstrap | null;
  initialResult?: GlpmCxPredictPayload | null;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const prefillHome = searchParams.get("home");
  const prefillAway = searchParams.get("away");
  const prefillSeason = searchParams.get("seasonId");
  const prefillCompetition = searchParams.get("competitionId");
  const prefillMatch = searchParams.get("matchSmId");

  const boot = initialBootstrap ?? null;
  const initialTeams = boot?.teams ?? [];
  const initialHomeAway = pickHomeAway(
    initialTeams,
    prefillHome,
    prefillAway,
    prefillHome ?? "",
    prefillAway ?? ""
  );

  const [competitions, setCompetitions] = useState<CompetitionOption[]>(
    boot?.competitions ?? []
  );
  const [seasons, setSeasons] = useState<SeasonOption[]>(boot?.seasons ?? []);
  const [competitionId, setCompetitionId] = useState(
    boot?.competitionId || prefillCompetition || ""
  );
  const [seasonId, setSeasonId] = useState(boot?.seasonId || prefillSeason || "");
  const [teams, setTeams] = useState<TeamOption[]>(initialTeams);
  const [homeTeamId, setHomeTeamId] = useState(initialHomeAway.home);
  const [awayTeamId, setAwayTeamId] = useState(initialHomeAway.away);
  const [matchSmId, setMatchSmId] = useState(prefillMatch ?? "");
  const [loadingMeta, setLoadingMeta] = useState(!boot);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GlpmCxPredictPayload | null>(
    initialResult ?? null
  );
  const autoRanKey = useRef<string | null>(
    initialResult && prefillMatch ? `hydrated:${prefillMatch}` : null
  );

  useEffect(() => {
    if (boot) return;
    let cancelled = false;
    setLoadingMeta(true);
    fetch("/api/glpm/seasons")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const comps = (data.competitions ?? []) as CompetitionOption[];
        const seas = (data.seasons ?? []) as SeasonOption[];
        setCompetitions(comps);
        setSeasons(seas);
        if (prefillSeason && seas.some((s) => String(s.id) === prefillSeason)) {
          const s = seas.find((x) => String(x.id) === prefillSeason)!;
          setSeasonId(String(s.id));
          setCompetitionId(String(s.competitionId));
        } else if (
          prefillCompetition &&
          comps.some((c) => String(c.id) === prefillCompetition)
        ) {
          setCompetitionId(prefillCompetition);
        } else if (comps.length && !competitionId) {
          const firstComp = comps[0];
          setCompetitionId(String(firstComp.id));
          const defaultSeason =
            firstComp.defaultSeasonId ??
            seas.find((s) => s.competitionId === firstComp.id && s.isPredictReady)
              ?.id ??
            seas.find(
              (s) => s.competitionId === firstComp.id && s.hasFinishedMatches
            )?.id;
          if (defaultSeason != null) setSeasonId(String(defaultSeason));
        } else if (data.defaultSeasonId != null && !seasonId) {
          setSeasonId(String(data.defaultSeasonId));
          const s = seas.find((x) => x.id === data.defaultSeasonId);
          if (s) setCompetitionId(String(s.competitionId));
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not load GLPM competitions.");
      })
      .finally(() => {
        if (!cancelled) setLoadingMeta(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only when no SSR bootstrap
  }, [boot]);

  const seasonsForCompetition = useMemo(() => {
    const pool = competitionId
      ? seasons.filter((s) => String(s.competitionId) === competitionId)
      : seasons;
    const current = pool.filter((s) => !isPriorGlpmSeasonId(s.id));
    return current.length ? current : pool;
  }, [seasons, competitionId]);

  useEffect(() => {
    if (!competitionId) return;
    const comp = competitions.find((c) => String(c.id) === competitionId);
    const preferred =
      (comp?.defaultSeasonId != null &&
      seasonsForCompetition.some((s) => s.id === comp.defaultSeasonId)
        ? comp.defaultSeasonId
        : null) ??
      seasonsForCompetition.find((s) => s.isPredictReady)?.id ??
      seasonsForCompetition.find((s) => s.hasFinishedMatches)?.id;
    if (
      preferred != null &&
      !seasonsForCompetition.some((s) => String(s.id) === seasonId)
    ) {
      setSeasonId(String(preferred));
    }
  }, [competitionId, competitions, seasonsForCompetition, seasonId]);

  const loadTeams = useCallback(
    async (sid: string, opts?: { skipIfBoot?: boolean }) => {
      if (!sid) {
        setTeams([]);
        return;
      }
      if (
        opts?.skipIfBoot &&
        boot &&
        boot.seasonId === sid &&
        boot.teams.length > 0
      ) {
        return;
      }
      setLoadingTeams(true);
      try {
        const res = await fetch(
          `/api/glpm/teams?seasonId=${encodeURIComponent(sid)}`
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load teams");
        const list = (data.teams ?? []) as TeamOption[];
        setTeams(list);
        setHomeTeamId((prev) => {
          const picked = pickHomeAway(list, prefillHome, prefillAway, prev, "");
          return picked.home;
        });
        setAwayTeamId((prev) => {
          const home =
            (prefillHome && list.some((t) => String(t.id) === prefillHome)
              ? prefillHome
              : null) ??
            (list[0] ? String(list[0].id) : "");
          const picked = pickHomeAway(list, prefillHome, prefillAway, home, prev);
          return picked.away;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load teams");
        setTeams([]);
      } finally {
        setLoadingTeams(false);
      }
    },
    [prefillHome, prefillAway, boot]
  );

  useEffect(() => {
    void loadTeams(seasonId, { skipIfBoot: true });
  }, [seasonId, loadTeams]);

  useEffect(() => {
    const homeOk = Boolean(prefillHome && homeTeamId === prefillHome);
    const awayOk = Boolean(prefillAway && awayTeamId === prefillAway);
    const seasonOk = !prefillSeason || seasonId === prefillSeason;
    if (homeOk && awayOk && seasonOk && prefillMatch) {
      setMatchSmId(prefillMatch);
    } else {
      setMatchSmId("");
    }
  }, [
    homeTeamId,
    awayTeamId,
    seasonId,
    prefillHome,
    prefillAway,
    prefillSeason,
    prefillMatch,
  ]);

  const skipNextResultClear = useRef(Boolean(initialResult));
  useEffect(() => {
    if (skipNextResultClear.current) {
      skipNextResultClear.current = false;
      return;
    }
    setResult(null);
  }, [homeTeamId, awayTeamId, seasonId, matchSmId]);

  const runPredict = useCallback(async () => {
    if (!homeTeamId || !awayTeamId || homeTeamId === awayTeamId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/glpm/predict-cx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homeTeamSmId: Number(homeTeamId),
          awayTeamSmId: Number(awayTeamId),
          seasonId: seasonId ? Number(seasonId) : null,
          matchSmId: matchSmId ? Number(matchSmId) : null,
          persistAsync: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          sanitizeUserFacingMessage(data.error) ??
            "Unable to complete GLPM-CX prediction."
        );
        return;
      }
      setResult(data as GlpmCxPredictPayload);
    } catch {
      setError("Network error - please try again.");
    } finally {
      setLoading(false);
    }
  }, [homeTeamId, awayTeamId, seasonId, matchSmId]);

  // Prefill from a fixture card: auto-generate once when teams are ready and no hydrate.
  useEffect(() => {
    if (initialResult) return;
    if (!matchSmId || !homeTeamId || !awayTeamId || loadingMeta || loadingTeams) {
      return;
    }
    if (homeTeamId !== prefillHome || awayTeamId !== prefillAway) return;
    const key = `${matchSmId}:${homeTeamId}:${awayTeamId}`;
    if (autoRanKey.current === key) return;
    autoRanKey.current = key;
    void runPredict();
  }, [
    initialResult,
    matchSmId,
    homeTeamId,
    awayTeamId,
    loadingMeta,
    loadingTeams,
    prefillHome,
    prefillAway,
    runPredict,
  ]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await runPredict();
  }

  const submitDisabled =
    loading ||
    loadingMeta ||
    loadingTeams ||
    !homeTeamId ||
    !awayTeamId ||
    homeTeamId === awayTeamId;

  return (
    <div className="w-full space-y-8">
      <PageHero eyebrow="Graham League Prediction Model" title="Club matchup" />

      <form
        onSubmit={handleSubmit}
        className="liquid-glass-panel min-w-0 space-y-4 rounded-2xl p-4 sm:p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <ModeToolbar
              entityType={entityType}
              onEntityTypeChange={(next) => {
                if (next === "national") {
                  startTransition(() => {
                    const params = new URLSearchParams(searchParams.toString());
                    params.set("entity", "national");
                    router.replace(`/predict?${params.toString()}`);
                  });
                }
                onEntityTypeChange(next);
              }}
              inputMode="compare"
              onInputModeChange={() => {
                /* Clubs GLPM is compare-only for now */
              }}
            />
          </div>
          <InfoTip label="Club predictor" size="sm">
            <div className="max-w-xs space-y-2 text-xs leading-relaxed">
              <p>
                Clubs use the GLPM stack (SportMonks / Wyscout ratings). Pick a
                competition season and two teams with rating vectors.
              </p>
              <p className="text-muted">
                Fixture pickers from the legacy club API are disabled. Compare
                mode is the active flow for clubs.
              </p>
            </div>
          </InfoTip>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="block space-y-1.5">
            <span className="type-meta font-semibold uppercase tracking-wide">
              Competition
            </span>
            <select
              className="w-full rounded-xl border border-glass-border bg-background px-3 py-2.5 text-sm"
              value={competitionId}
              disabled={loadingMeta}
              onChange={(e) => setCompetitionId(e.target.value)}
            >
              {competitions.length === 0 ? (
                <option value="">No competitions ingested</option>
              ) : (
                competitions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.areaName ? ` · ${c.areaName}` : ""}
                  </option>
                ))
              )}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="type-meta font-semibold uppercase tracking-wide">
              Season
            </span>
            <select
              className="w-full rounded-xl border border-glass-border bg-background px-3 py-2.5 text-sm"
              value={seasonId}
              disabled={loadingMeta || !seasonsForCompetition.length}
              onChange={(e) => setSeasonId(e.target.value)}
            >
              {seasonsForCompetition.length === 0 ? (
                <option value="">No seasons</option>
              ) : (
                seasonsForCompetition.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name ?? `Season ${s.id}`}
                  </option>
                ))
              )}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="type-meta font-semibold uppercase tracking-wide text-primary">
              Home
            </span>
            <select
              className="w-full rounded-xl border border-primary/30 bg-background px-3 py-2.5 text-sm"
              value={homeTeamId}
              disabled={loadingTeams || !teams.length}
              onChange={(e) => setHomeTeamId(e.target.value)}
            >
              {teams.length === 0 ? (
                <option value="">No teams with vectors</option>
              ) : (
                teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))
              )}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="type-meta font-semibold uppercase tracking-wide text-accent">
              Away
            </span>
            <select
              className="w-full rounded-xl border border-accent/30 bg-background px-3 py-2.5 text-sm"
              value={awayTeamId}
              disabled={loadingTeams || !teams.length}
              onChange={(e) => setAwayTeamId(e.target.value)}
            >
              {teams.length === 0 ? (
                <option value="">No teams with vectors</option>
              ) : (
                teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))
              )}
            </select>
          </label>
        </div>

        {error ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 type-body text-red-700 dark:text-red-300">
            {error}
          </p>
        ) : null}

        <div className="flex justify-center">
          <button
            type="submit"
            disabled={submitDisabled}
            className="w-full rounded-full bg-slate-950 px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-slate-950 sm:w-auto sm:min-w-[12rem]"
          >
            {loading ? "Generating…" : "Generate insights"}
          </button>
        </div>
        {matchSmId ? (
          <div className="flex justify-center">
            <InfoTip label="Fixture context" size="sm">
              <p className="max-w-xs text-xs leading-relaxed">
                Using this fixture for rest, travel, weather, and lineup context
                so the numbers match the homepage card.
              </p>
            </InfoTip>
          </div>
        ) : null}
      </form>

      {loading && !result ? (
        <div className="animate-pulse space-y-3 rounded-2xl border border-glass-border p-6">
          <div className="mb-4 h-6 w-48 rounded bg-slate-200/80 dark:bg-slate-700/50" />
          <div className="mb-2 h-4 w-full rounded bg-slate-200/60 dark:bg-slate-700/40" />
          <div className="h-4 w-3/4 rounded bg-slate-200/60 dark:bg-slate-700/40" />
        </div>
      ) : null}

      {result ? (
        <GlpmInsightsDashboard
          payload={result}
          leagueSmId={competitionId ? Number(competitionId) : null}
        />
      ) : null}
    </div>
  );
}
