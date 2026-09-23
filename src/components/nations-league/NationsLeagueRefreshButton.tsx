"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function NationsLeagueRefreshButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onRefresh() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/nations-league/refresh", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Refresh failed (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onRefresh}
        disabled={busy}
        className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60 dark:bg-white dark:text-slate-950"
      >
        {busy ? "Refreshing…" : "Refresh hub data"}
      </button>
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
