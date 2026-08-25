"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { GlpmHubPayload } from "@/lib/glpm/hub-types";

export function GlpmHubSeasonPicker({
  payload,
  seasonId,
  competitionId,
}: {
  payload: GlpmHubPayload;
  seasonId: string | null;
  competitionId: string | null;
}) {
  const router = useRouter();
  const seasons = competitionId
    ? payload.seasons.filter((s) => String(s.competitionId) === competitionId)
    : payload.seasons;

  function navigate(next: { competitionId?: string; seasonId?: string }) {
    const params = new URLSearchParams();
    const c = next.competitionId ?? competitionId;
    const s = next.seasonId ?? seasonId;
    if (c) params.set("competitionId", c);
    if (s) params.set("seasonId", s);
    router.push(`/league?${params.toString()}`);
  }

  // Prefetch other competitions so switching reuses the 60s hub cache.
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

  return (
    <div className="mb-8 grid gap-3 sm:grid-cols-2">
      <label className="block space-y-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          Competition
        </span>
        <select
          className="w-full rounded-xl border border-glass-border bg-surface px-3 py-2.5 text-sm"
          value={competitionId ?? ""}
          onChange={(e) => {
            const c = e.target.value;
            const comp = payload.competitions.find((x) => String(x.smId) === c);
            const preferred =
              comp?.defaultSeasonId ??
              payload.seasons.find((s) => String(s.competitionId) === c && s.isPredictReady)
                ?.smId ??
              payload.seasons.find(
                (s) => String(s.competitionId) === c && s.hasFinishedMatches
              )?.smId;
            navigate({
              competitionId: c,
              seasonId: preferred != null ? String(preferred) : undefined,
            });
          }}
        >
          {payload.competitions.length === 0 ? (
            <option value="">No competitions</option>
          ) : (
            payload.competitions.map((c) => (
              <option key={c.smId} value={c.smId}>
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
          value={seasonId ?? ""}
          onChange={(e) => navigate({ seasonId: e.target.value })}
        >
          {seasons.length === 0 ? (
            <option value="">No seasons</option>
          ) : (
            seasons.map((s) => (
              <option key={s.smId} value={s.smId}>
                {s.name ?? `Season ${s.smId}`}
                {!s.isPredictReady && !s.hasFinishedMatches ? " (no data)" : ""}
                {s.hasFinishedMatches && !s.isPredictReady ? " (not trained)" : ""}
              </option>
            ))
          )}
        </select>
      </label>
    </div>
  );
}
