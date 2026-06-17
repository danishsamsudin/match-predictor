"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { HubSnapshotMeta } from "@/lib/world-cup/hub-snapshot";

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m <= 0) return `${s}s`;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

export function WorldCupRefreshButton({ initialUpdatedAt }: { initialUpdatedAt?: string }) {
  const router = useRouter();
  const [meta, setMeta] = useState<HubSnapshotMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [displayUpdatedAt, setDisplayUpdatedAt] = useState(initialUpdatedAt ?? null);
  const wasRunning = useRef(false);

  const fetchMeta = useCallback(async () => {
    const res = await fetch("/api/world-cup/refresh");
    if (!res.ok) return null;
    return (await res.json()) as HubSnapshotMeta;
  }, []);

  useEffect(() => {
    void fetchMeta().then((m) => {
      if (m) setMeta(m);
    });
  }, [fetchMeta]);

  useEffect(() => {
    const shouldPoll =
      (meta?.cooldownSecondsRemaining ?? 0) > 0 || meta?.refreshStatus === "running";
    if (!shouldPoll) return;

    const timer = window.setInterval(() => {
      void fetchMeta().then((m) => {
        if (m) setMeta(m);
      });
    }, 2000);
    return () => window.clearInterval(timer);
  }, [meta?.cooldownSecondsRemaining, meta?.refreshStatus, fetchMeta]);

  useEffect(() => {
    const running = meta?.refreshStatus === "running";
    if (wasRunning.current && !running) {
      router.refresh();
      if (meta?.computedAt) setDisplayUpdatedAt(meta.computedAt);
    }
    wasRunning.current = running;
  }, [meta?.refreshStatus, meta?.computedAt, router]);

  const onRefresh = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/world-cup/refresh", { method: "POST" });
      let body: { error?: string; updatedAt?: string; started?: boolean; message?: string } = {};
      try {
        body = (await res.json()) as typeof body;
      } catch {
        if (res.status === 504) {
          setError("Refresh is still running — check back in a few minutes.");
          const m = await fetchMeta();
          if (m) setMeta(m);
          return;
        }
      }

      if (res.status === 429) {
        setError(body.error ?? "Please wait before refreshing again.");
        const m = await fetchMeta();
        if (m) setMeta(m);
        return;
      }

      if (res.status === 409) {
        setError(body.error ?? "A refresh is already in progress.");
        const m = await fetchMeta();
        if (m) setMeta(m);
        return;
      }

      if (res.status === 202 || body.started) {
        setMeta((prev) => ({
          ...(prev ?? {
            computedAt: null,
            refreshStatus: "running",
            lastManualRefreshAt: null,
            lastCronRefreshAt: null,
            refreshErrors: [],
            canRefreshAt: null,
            cooldownSecondsRemaining: 0,
          }),
          refreshStatus: "running",
        }));
        return;
      }

      if (!res.ok) {
        setError(body.error ?? "Refresh failed.");
        return;
      }

      if (body.updatedAt) setDisplayUpdatedAt(body.updatedAt);
      const m = await fetchMeta();
      if (m) setMeta(m);
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  };

  const coolingDown = (meta?.cooldownSecondsRemaining ?? 0) > 0;
  const running = meta?.refreshStatus === "running";
  const disabled = loading || running || coolingDown;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => void onRefresh()}
        disabled={disabled}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
      >
        {loading || running
          ? "Refreshing hub…"
          : coolingDown
            ? `Refresh in ${formatCountdown(meta?.cooldownSecondsRemaining ?? 0)}`
            : "Refresh hub data"}
      </button>
      <p className="text-xs text-slate-500">
        Last model update:{" "}
        {displayUpdatedAt ? new Date(displayUpdatedAt).toLocaleString() : "—"} · Shared
        snapshot for all visitors · Manual refresh limited to once every 10 minutes · Not
        betting advice.
      </p>
      {running && (
        <p className="w-full text-xs text-slate-500">
          Refresh runs in the background — this page will update when it finishes.
        </p>
      )}
      {error && <p className="w-full text-xs text-amber-600 dark:text-amber-400">{error}</p>}
    </div>
  );
}
