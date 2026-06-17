"use client";

import { useState } from "react";

export default function SimulatePage() {
  const [homeXg, setHomeXg] = useState("1.45");
  const [awayXg, setAwayXg] = useState("1.05");
  const [iterations, setIterations] = useState("1000");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    homeWinPct: number;
    drawPct: number;
    awayWinPct: number;
    iterations: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runSim() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/simulate/tournament", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          iterations: Number(iterations),
          matches: [
            {
              homeTeamId: 1,
              awayTeamId: 2,
              homeXg: Number(homeXg),
              awayXg: Number(awayXg),
            },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Simulation failed");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Simulation failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
        Match Monte Carlo
      </h1>
      <p className="mt-2 text-sm text-slate-500">
        Sample outcomes from a Poisson score grid using resolved xG (lightweight kernel).
      </p>

      <div className="mt-6 space-y-3">
        <label className="block text-sm">
          Home xG
          <input
            value={homeXg}
            onChange={(e) => setHomeXg(e.target.value)}
            className="mt-1 w-full rounded-lg border px-3 py-2 dark:bg-slate-800"
          />
        </label>
        <label className="block text-sm">
          Away xG
          <input
            value={awayXg}
            onChange={(e) => setAwayXg(e.target.value)}
            className="mt-1 w-full rounded-lg border px-3 py-2 dark:bg-slate-800"
          />
        </label>
        <label className="block text-sm">
          Iterations (max 10,000)
          <input
            value={iterations}
            onChange={(e) => setIterations(e.target.value)}
            className="mt-1 w-full rounded-lg border px-3 py-2 dark:bg-slate-800"
          />
        </label>
        <button
          type="button"
          onClick={runSim}
          disabled={loading}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Running…" : "Run simulation"}
        </button>
      </div>

      {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}

      {result && (
        <div className="mt-6 rounded-2xl border p-4 dark:border-slate-700">
          <p className="text-xs text-slate-500">{result.iterations} iterations</p>
          <ul className="mt-2 space-y-1 text-sm">
            <li>Home win: {result.homeWinPct.toFixed(1)}%</li>
            <li>Draw: {result.drawPct.toFixed(1)}%</li>
            <li>Away win: {result.awayWinPct.toFixed(1)}%</li>
          </ul>
        </div>
      )}
    </main>
  );
}
