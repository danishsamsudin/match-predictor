"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { HomeLeagueTabs } from "@/components/glpm/HomeLeagueTabs";
import type { GlpmXgHubPayload } from "@/lib/glpm/hub-types";

export function GlpmXgLeaguePicker({
  payload,
  seasonId,
  competitionId,
}: {
  payload: GlpmXgHubPayload;
  seasonId: string | null;
  competitionId: string | null;
}) {
  const router = useRouter();
  const seasons = competitionId
    ? payload.seasons.filter((s) => String(s.competitionId) === competitionId)
    : payload.seasons;

  const leagueTabs = payload.competitions.map((c) => ({
    id: String(c.smId),
    label: c.areaName ? `${c.name}` : c.name,
  }));

  function navigate(next: { competitionId?: string; seasonId?: string }) {
    const params = new URLSearchParams();
    const c = next.competitionId ?? competitionId;
    const s = next.seasonId ?? seasonId;
    if (c) params.set("competitionId", c);
    if (s) params.set("seasonId", s);
    router.push(`/league?${params.toString()}`);
  }

  useEffect(() => {
    for (const c of payload.competitions) {
      if (competitionId != null && String(c.smId) === competitionId) continue;
      const params = new URLSearchParams();
      params.set("competitionId", String(c.smId));
      if (c.defaultSeasonId != null) {
        params.set("seasonId", String(c.defaultSeasonId));
      }
      router.prefetch(`/league?${params.toString()}`);
    }
  }, [payload.competitions, competitionId, router]);

  const activeCompetitionId =
    competitionId ?? (leagueTabs[0] != null ? leagueTabs[0].id : "");

  return (
    <div className="mb-8 space-y-4">
      {leagueTabs.length > 0 ? (
        <div className="space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            League
          </span>
          <HomeLeagueTabs
            leagues={leagueTabs}
            activeId={activeCompetitionId}
            ariaLabel="Select league"
            onSelect={(id) => {
              const comp = payload.competitions.find((x) => String(x.smId) === id);
              const preferred =
                comp?.defaultSeasonId ??
                payload.seasons.find(
                  (s) => String(s.competitionId) === id && s.hasFinishedMatches
                )?.smId ??
                payload.seasons.find((s) => String(s.competitionId) === id)?.smId;
              navigate({
                competitionId: id,
                seasonId: preferred != null ? String(preferred) : undefined,
              });
            }}
          />
        </div>
      ) : null}

      <label className="block max-w-xs space-y-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          Season
        </span>
        <select
          className="w-full rounded-xl border border-glass-border bg-surface px-3 py-2.5 text-sm"
          value={seasonId ?? ""}
          onChange={(e) => navigate({ seasonId: e.target.value })}
        >
          {seasons.length === 0 ? (
            <option value="">No seasons</option>
          ) : (
            seasons.map((s) => (
              <option key={s.smId} value={s.smId}>
                {s.name ?? `Season ${s.smId}`}
                {!s.hasFinishedMatches ? " (no finished matches)" : ""}
              </option>
            ))
          )}
        </select>
      </label>
    </div>
  );
}
