"use client";

import { useCallback, useEffect, useState } from "react";

type Team = { id: string; name: string };
type PlayerStat = {
  stat_type: string;
  competition: string | null;
  stats: Record<string, unknown>;
};
type Player = {
  id: string;
  name: string;
  stats: PlayerStat[];
};
type Match = {
  id: string;
  date: string | null;
  home_team_name: string | null;
  away_team_name: string | null;
  venue: string | null;
  home_goals: number | null;
  away_goals: number | null;
};

export default function FbrefDevPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [teamsRes, matchesRes] = await Promise.all([
          fetch("/api/fbref/teams"),
          fetch("/api/fbref/matches"),
        ]);
        if (!teamsRes.ok) {
          const body = await teamsRes.json().catch(() => ({}));
          throw new Error(body.error ?? teamsRes.statusText);
        }
        const teamsJson = await teamsRes.json();
        const matchesJson = matchesRes.ok ? await matchesRes.json() : { matches: [] };
        if (cancelled) return;
        setTeams(teamsJson.teams ?? []);
        setMatches(matchesJson.matches ?? []);
        if (teamsJson.teams?.length) {
          setSelectedId(teamsJson.teams[0].id);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadPlayers = useCallback(async (teamId: string) => {
    if (!teamId) return;
    setError(null);
    const res = await fetch(`/api/fbref/teams/${teamId}/players`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? res.statusText);
      setPlayers([]);
      return;
    }
    const json = await res.json();
    setPlayers(json.players ?? []);
  }, []);

  useEffect(() => {
    if (selectedId) void loadPlayers(selectedId);
  }, [selectedId, loadPlayers]);

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl p-8">
        <p className="text-muted-foreground">Loading FBref data…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-8">
      <header>
        <h1 className="text-2xl font-semibold">FBref World Cup data (dev)</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Browse imported Supabase tables (teams, players, stats, schedule). The main predictor
          still uses SofaScore sync + lineups unless integrated further.
        </p>
      </header>

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <section>
        <h2 className="mb-2 text-lg font-medium">Teams ({teams.length})</h2>
        <select
          className="w-full max-w-md rounded-md border bg-background px-3 py-2"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.id})
            </option>
          ))}
        </select>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-medium">Players ({players.length})</h2>
        <div className="max-h-96 overflow-auto rounded-md border">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-muted">
              <tr>
                <th className="p-2">Name</th>
                <th className="p-2">Player ID</th>
                <th className="p-2">Stat types</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="p-2 font-medium">{p.name}</td>
                  <td className="p-2 font-mono text-xs">{p.id}</td>
                  <td className="p-2">{p.stats.map((s) => s.stat_type).join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-medium">World Cup schedule ({matches.length})</h2>
        <div className="max-h-64 overflow-auto rounded-md border text-sm">
          <ul className="divide-y">
            {matches.map((m) => (
              <li key={m.id} className="p-2">
                <span className="text-muted-foreground">{m.date}</span> — {m.home_team_name} vs{" "}
                {m.away_team_name}
                {m.home_goals != null && m.away_goals != null
                  ? ` (${m.home_goals}-${m.away_goals})`
                  : ""}
                {m.venue ? ` · ${m.venue}` : ""}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
