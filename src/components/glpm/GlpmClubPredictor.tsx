"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ModeToolbar } from "@/components/match-predictor/ModeToolbar";
import { PageHero } from "@/components/match-predictor/PageHero";
import { GlpmPredictionResultCard } from "@/components/glpm/GlpmPredictionResultCard";
import type { GlpmPredictUiPayload } from "@/lib/glpm/ui-types";
import type { EntityType } from "@/lib/types/football-lookup";
import { sanitizeUserFacingMessage } from "@/lib/api/user-facing-messages";

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
type TeamOption = { id: number; name: string; shortName: string | null };

export function GlpmClubPredictor({
  entityType,
  onEntityTypeChange,
}: {
  entityType: EntityType;
  onEntityTypeChange: (v: EntityType) => void;
}) {
  const searchParams = useSearchParams();
  const prefillHome = searchParams.get("home");
  const prefillAway = searchParams.get("away");
  const prefillSeason = searchParams.get("seasonId");

  const [competitions, setCompetitions] = useState<CompetitionOption[]>([]);
  const [seasons, setSeasons] = useState<SeasonOption[]>([]);
  const [competitionId, setCompetitionId] = useState("");
  const [seasonId, setSeasonId] = useState(prefillSeason ?? "");
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [homeTeamId, setHomeTeamId] = useState(prefillHome ?? "");
  const [awayTeamId, setAwayTeamId] = useState(prefillAway ?? "");
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GlpmPredictUiPayload | null>(null);

  useEffect(() => {
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
        } else if (comps.length && !competitionId) {
          const firstComp = comps[0];
          setCompetitionId(String(firstComp.id));
          const defaultSeason =
            firstComp.defaultSeasonId ??
            seas.find((s) => s.competitionId === firstComp.id && s.isPredictReady)?.id ??
            seas.find((s) => s.competitionId === firstComp.id && s.hasFinishedMatches)?.id;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, []);

  const seasonsForCompetition = useMemo(
    () =>
      competitionId
        ? seasons.filter((s) => String(s.competitionId) === competitionId)
        : seasons,
    [seasons, competitionId]
  );

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
    if (preferred != null && !seasonsForCompetition.some((s) => String(s.id) === seasonId)) {
      setSeasonId(String(preferred));
    }
  }, [competitionId, competitions, seasonsForCompetition, seasonId]);

  const loadTeams = useCallback(async (sid: string) => {
    if (!sid) {
      setTeams([]);
      return;
    }
    setLoadingTeams(true);
    try {
      const res = await fetch(`/api/glpm/teams?seasonId=${encodeURIComponent(sid)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load teams");
      const list = (data.teams ?? []) as TeamOption[];
      setTeams(list);
      setHomeTeamId((prev) => {
        if (prev && list.some((t) => String(t.id) === prev)) return prev;
        if (prefillHome && list.some((t) => String(t.id) === prefillHome)) {
          return prefillHome;
        }
        return list.length ? String(list[0].id) : "";
      });
      setAwayTeamId((prev) => {
        if (prev && list.some((t) => String(t.id) === prev)) return prev;
        if (prefillAway && list.some((t) => String(t.id) === prefillAway)) {
          return prefillAway;
        }
        const home =
          (prefillHome && list.some((t) => String(t.id) === prefillHome)
            ? prefillHome
            : null) ?? (list[0] ? String(list[0].id) : "");
        const fallback = list.find((t) => String(t.id) !== home);
        return fallback ? String(fallback.id) : "";
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load teams");
      setTeams([]);
    } finally {
      setLoadingTeams(false);
    }
  }, [prefillHome, prefillAway]);

  useEffect(() => {
    void loadTeams(seasonId);
  }, [seasonId, loadTeams]);

  useEffect(() => {
    setResult(null);
  }, [homeTeamId, awayTeamId, seasonId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!homeTeamId || !awayTeamId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/glpm/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homeTeamSmId: Number(homeTeamId),
          awayTeamSmId: Number(awayTeamId),
          seasonId: seasonId ? Number(seasonId) : null,
          context: { isNeutralVenue: false },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          sanitizeUserFacingMessage(data.error) ??
            "Unable to complete GLPM prediction."
        );
        return;
      }
      setResult(data as GlpmPredictUiPayload);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  const homeName = teams.find((t) => String(t.id) === homeTeamId)?.name;
  const awayName = teams.find((t) => String(t.id) === awayTeamId)?.name;
  const submitDisabled =
    loading ||
    loadingMeta ||
    loadingTeams ||
    !homeTeamId ||
    !awayTeamId ||
    homeTeamId === awayTeamId;

  return (
    <div className="w-full space-y-6">
      <div className="mx-auto max-w-6xl px-0">
        <PageHero
          eyebrow="Graham League Prediction Model"
          title="Club matchup"
          description="Compare two clubs with the seven-dimensional GLPM rating vector, interaction xG, and Dixon–Coles markets."
        />
      </div>

      <form
        onSubmit={handleSubmit}
        className="liquid-glass-panel mx-auto max-w-6xl space-y-5 rounded-2xl p-4 sm:rounded-[2rem] sm:p-6"
      >
        <ModeToolbar
          entityType={entityType}
          onEntityTypeChange={onEntityTypeChange}
          inputMode="compare"
          onInputModeChange={() => {
            /* Clubs GLPM is compare-only for now */
          }}
        />

        <p className="text-xs text-muted">
          Clubs use the GLPM stack (SportMonks / Wyscout ratings). Fixture pickers from the legacy
          club API are disabled — choose a competition season and two teams with rating vectors.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              Competition
            </span>
            <select
              className="w-full rounded-xl border border-glass-border bg-surface px-3 py-2.5 text-sm"
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
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              Season
            </span>
            <select
              className="w-full rounded-xl border border-glass-border bg-surface px-3 py-2.5 text-sm"
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
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-primary">
              Home
            </span>
            <select
              className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2.5 text-sm"
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
            <span className="text-xs font-semibold uppercase tracking-wide text-accent">
              Away
            </span>
            <select
              className="w-full rounded-xl border border-accent/30 bg-surface px-3 py-2.5 text-sm"
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

        {homeName && awayName ? (
          <p className="text-center text-sm font-medium text-foreground">
            <span className="text-primary">{homeName}</span>
            <span className="mx-2 text-muted">vs</span>
            <span className="text-accent">{awayName}</span>
          </p>
        ) : null}

        {error ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitDisabled}
          className="w-full rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-slate-950"
        >
          {loading ? "Generating GLPM forecast…" : "Generate GLPM forecast"}
        </button>
      </form>

      {loading && !result ? (
        <div className="liquid-glass-panel mx-auto max-w-6xl animate-pulse rounded-[2rem] p-8">
          <div className="mb-4 h-6 w-48 rounded bg-slate-200/80 dark:bg-slate-700/50" />
          <div className="mb-2 h-4 w-full rounded bg-slate-200/60 dark:bg-slate-700/40" />
          <div className="h-4 w-3/4 rounded bg-slate-200/60 dark:bg-slate-700/40" />
        </div>
      ) : null}

      {result ? (
        <div className="mx-auto w-full max-w-6xl">
          <GlpmPredictionResultCard result={result} />
        </div>
      ) : null}
    </div>
  );
}
