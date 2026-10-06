"use client";

import { useEffect, useRef, useState } from "react";
import type { MatchOddsResult, OddsBookSource } from "@/lib/odds-api/types";

type OddsFillStatus = "idle" | "loading" | "ready" | "empty" | "error";

export type UseOddsAutoFillArgs = {
  leagueSmId: number | null | undefined;
  homeTeamName: string;
  awayTeamName: string;
  kickoffIso?: string | null;
  /** Called once when API odds arrive so the panel can fill book inputs. */
  onFill: (
    bookByRowId: Record<string, string>,
    sourceByRowId: Record<string, OddsBookSource>
  ) => void;
  enabled?: boolean;
};

export type OddsAutoFillState = {
  status: OddsFillStatus;
  result: MatchOddsResult | null;
  error: string | null;
  refresh: () => void;
};

/**
 * Fetch Pinnacle / Unibet odds for the current prediction and push into book state.
 * Dedupes by league + teams so React Strict Mode double-mounts do not double-spend credits
 * beyond a single in-flight abortable request.
 */
export function useOddsAutoFill({
  leagueSmId,
  homeTeamName,
  awayTeamName,
  kickoffIso,
  onFill,
  enabled = true,
}: UseOddsAutoFillArgs): OddsAutoFillState {
  const [status, setStatus] = useState<OddsFillStatus>("idle");
  const [result, setResult] = useState<MatchOddsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const onFillRef = useRef(onFill);
  onFillRef.current = onFill;

  useEffect(() => {
    if (!enabled || leagueSmId == null || !homeTeamName || !awayTeamName) {
      setStatus("idle");
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    async function run() {
      setStatus("loading");
      setError(null);
      try {
        const params = new URLSearchParams({
          leagueSmId: String(leagueSmId),
          home: homeTeamName,
          away: awayTeamName,
        });
        if (kickoffIso) params.set("kickoff", kickoffIso);

        const res = await fetch(`/api/odds/value-opportunities?${params}`, {
          signal: controller.signal,
        });
        const body = (await res.json()) as MatchOddsResult & { error?: string };
        if (cancelled) return;

        if (!res.ok) {
          setStatus("error");
          setError(body.error ?? `Odds request failed (${res.status})`);
          setResult(null);
          return;
        }

        setResult(body);
        if (body.matched && Object.keys(body.bookByRowId).length > 0) {
          onFillRef.current(body.bookByRowId, body.sourceByRowId);
          setStatus("ready");
        } else {
          setStatus("empty");
          setError(body.message);
        }
      } catch (err) {
        if (cancelled || (err instanceof DOMException && err.name === "AbortError")) {
          return;
        }
        setStatus("error");
        setError(err instanceof Error ? err.message : "Odds request failed");
        setResult(null);
      }
    }

    void run();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [leagueSmId, homeTeamName, awayTeamName, kickoffIso, enabled, nonce]);

  return {
    status,
    result,
    error,
    refresh: () => setNonce((n) => n + 1),
  };
}
