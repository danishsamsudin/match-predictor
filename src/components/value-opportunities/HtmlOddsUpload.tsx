"use client";

import { useRef, useState } from "react";
import type { OddsBookSource } from "@/lib/odds-api/types";
import {
  parseUnibetHtmlToValueRows,
  teamsLikelyMatch,
} from "@/lib/value-opportunities/parse-unibet-html";

const MAX_BYTES = 8_000_000;

export function HtmlOddsUpload({
  homeLabel,
  awayLabel,
  overwrite,
  onOverwriteChange,
  onFill,
}: {
  homeLabel: string;
  awayLabel: string;
  overwrite: boolean;
  onOverwriteChange: (v: boolean) => void;
  onFill: (
    bookByRowId: Record<string, string>,
    sourceByRowId: Record<string, OddsBookSource>,
    meta: { filled: number; warnings: string[]; bookmakerName: string | null }
  ) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    setStatus(null);
    try {
      if (file.size > MAX_BYTES) {
        setStatus("File too large (max 8 MB). Nothing was stored.");
        return;
      }
      const raw = await file.text();
      // Session-only: parse in memory, never POST / never localStorage.
      const parsed = parseUnibetHtmlToValueRows(raw, {
        homeLabel,
        awayLabel,
      });
      const warnings = [...parsed.warnings];

      if (
        parsed.homeHint &&
        !teamsLikelyMatch(parsed.homeHint, homeLabel)
      ) {
        warnings.push(
          `Uploaded page home "${parsed.homeHint}" may not match ${homeLabel}.`
        );
      }
      if (
        parsed.awayHint &&
        !teamsLikelyMatch(parsed.awayHint, awayLabel)
      ) {
        warnings.push(
          `Uploaded page away "${parsed.awayHint}" may not match ${awayLabel}.`
        );
      }

      const bookByRowId: Record<string, string> = {};
      const sourceByRowId: Record<string, OddsBookSource> = {};
      for (const row of parsed.odds) {
        bookByRowId[row.rowId] = row.price.toFixed(2);
        sourceByRowId[row.rowId] = "upload";
      }

      onFill(bookByRowId, sourceByRowId, {
        filled: parsed.odds.length,
        warnings,
        bookmakerName: parsed.bookmakerName,
      });

      const brand = parsed.bookmakerName ? ` (${parsed.bookmakerName})` : "";
      setStatus(
        parsed.odds.length
          ? `Filled ${parsed.odds.length} market${parsed.odds.length === 1 ? "" : "s"} from file${brand} - session only, not saved.`
          : "No markets filled."
      );
    } catch {
      setStatus("Could not read that HTML/MHTML file.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="type-meta font-semibold uppercase tracking-wide">
            Bookmaker HTML
          </p>
          <p className="type-meta mt-0.5">
            Upload a saved event page. Parsed in-browser only.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 type-meta">
            <input
              type="checkbox"
              className="rounded border-glass-border"
              checked={overwrite}
              onChange={(e) => onOverwriteChange(e.target.checked)}
            />
            Overwrite filled
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="h-9 rounded-lg border border-glass-border bg-background px-3 text-xs font-semibold text-foreground transition hover:bg-surface disabled:opacity-50"
          >
            {busy ? "Parsing…" : "Choose HTML"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".html,.htm,.mhtml,.mht,text/html,multipart/related,message/rfc822"
            className="hidden"
            onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>
      {status ? <p className="type-meta">{status}</p> : null}
    </div>
  );
}
