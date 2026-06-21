"use client";

import { getLocalTimezoneLabel, getWcTimezoneLabel } from "@/lib/utils/kickoff-display";
import type { PredictionLineupSource } from "@/lib/types/prediction";
import { Calendar, ChevronDown, Clock, Loader2, MapPin } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const LINEUP_SOURCE_OPTIONS: Array<{
  value: PredictionLineupSource;
  label: string;
  description: string;
}> = [
  {
    value: "manual_xi",
    label: "With your XI",
    description: "Uses your selected starting XI and player-xG model",
  },
  {
    value: "model_xi",
    label: "Model squad (team xG)",
    description: "Team structural xG only — ignores manual XI selection",
  },
];

export function FooterPill({
  city,
  onCityChange,
  date,
  onDateChange,
  time,
  onTimeChange,
  loading,
  submitDisabled,
  citySuggestions = [],
  lineupSource,
  onLineupSourceChange,
  entityType = "club",
}: {
  city: string;
  onCityChange: (v: string) => void;
  date: string;
  onDateChange: (v: string) => void;
  time: string;
  onTimeChange: (v: string) => void;
  loading: boolean;
  submitDisabled: boolean;
  citySuggestions?: string[];
  lineupSource: PredictionLineupSource;
  onLineupSourceChange: (v: PredictionLineupSource) => void;
  entityType?: "club" | "national";
}) {
  const [cityFocused, setCityFocused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [timezoneLabel, setTimezoneLabel] = useState("local");

  useEffect(() => {
    setTimezoneLabel(
      entityType === "national" ? getWcTimezoneLabel() : getLocalTimezoneLabel()
    );
  }, [entityType]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  const filteredCities = useMemo(() => {
    const query = city.trim().toLowerCase();
    const list = (citySuggestions ?? []).filter(Boolean);
    if (!query) return list.slice(0, 4);
    return list
      .filter((name) => name.toLowerCase().includes(query))
      .slice(0, 4);
  }, [city, citySuggestions]);

  const activeOption =
    LINEUP_SOURCE_OPTIONS.find((o) => o.value === lineupSource) ??
    LINEUP_SOURCE_OPTIONS[0];

  const submitLabel = loading
    ? "Running…"
    : lineupSource === "manual_xi"
      ? "Generate · Your XI"
      : "Generate · Model squad";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="liquid-glass-pill flex flex-col gap-3 overflow-visible rounded-2xl p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:rounded-full sm:p-2 sm:pl-6 md:pl-8">
        <div className="grid min-w-0 grid-cols-1 gap-3 overflow-visible min-[400px]:grid-cols-3 sm:flex sm:flex-wrap sm:items-center sm:gap-6 md:gap-8">
          <label
            className={`relative flex min-w-0 items-center gap-2 border-b border-slate-200/80 pb-3 text-slate-700 dark:border-slate-800 dark:text-slate-300 min-[400px]:border-b-0 min-[400px]:pb-0 sm:border-b-0 sm:pb-0 sm:border-l-0 sm:pl-0 ${
              cityFocused ? "z-50" : ""
            }`}
          >
            <MapPin className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            <span className="sr-only">City</span>
            <input
              type="text"
              name="city"
              value={city}
              onChange={(e) => onCityChange(e.target.value)}
              onFocus={() => setCityFocused(true)}
              onBlur={() => setTimeout(() => setCityFocused(false), 120)}
              required
              placeholder="City"
              className="min-w-0 flex-1 border-none bg-transparent p-0 text-sm font-medium capitalize text-slate-800 outline-none focus:ring-0 dark:text-slate-200"
              autoComplete="off"
            />
            {cityFocused && filteredCities.length > 0 ? (
              <div className="absolute left-0 top-full z-50 mt-2 w-full min-w-[14rem] rounded-xl border border-white/30 bg-white/95 shadow-lg backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-950/95">
                <ul className="py-1">
                  {filteredCities.map((name) => (
                    <li key={name}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => onCityChange(name)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm font-medium text-slate-800 transition hover:bg-slate-100/80 dark:text-slate-200 dark:hover:bg-slate-800/50"
                      >
                        <span className="truncate">{name}</span>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          Suggestion
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </label>

          <label className="flex min-w-0 items-center gap-2 border-b border-slate-200/80 pb-3 text-slate-700 dark:border-slate-800 dark:text-slate-300 min-[400px]:border-b-0 min-[400px]:pb-0 sm:border-l sm:border-slate-300/80 sm:pb-0 sm:pl-6 dark:sm:border-slate-800 md:pl-8">
            <Calendar className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            <span className="sr-only">Match date</span>
            <input
              type="date"
              name="date"
              value={date}
              onChange={(e) => onDateChange(e.target.value)}
              required
              suppressHydrationWarning
              className="min-w-0 flex-1 border-none bg-transparent p-0 text-sm font-medium text-slate-800 outline-none focus:ring-0 dark:text-slate-200 dark:[color-scheme:dark]"
            />
          </label>

          <label
            className="flex min-w-0 items-center gap-2 text-slate-700 dark:text-slate-300 sm:border-l sm:border-slate-300/80 sm:pl-6 dark:sm:border-slate-800 md:pl-8"
            title={
              entityType === "national"
                ? `Kickoff time in Central European time (${timezoneLabel})`
                : `Kickoff time in your local timezone (${timezoneLabel})`
            }
          >
            <Clock className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            <span className="sr-only">Kickoff time ({timezoneLabel})</span>
            <input
              type="time"
              name="time"
              value={time}
              onChange={(e) => onTimeChange(e.target.value)}
              required
              suppressHydrationWarning
              className="min-w-0 flex-1 border-none bg-transparent p-0 text-sm font-medium text-slate-800 outline-none focus:ring-0 dark:text-slate-200 dark:[color-scheme:dark]"
            />
          </label>
        </div>

        <div
          ref={menuRef}
          className="relative flex w-full shrink-0 sm:w-auto"
        >
          <button
            type="submit"
            disabled={submitDisabled}
            className="chromatic-cta flex min-w-0 flex-1 items-center justify-center gap-2 rounded-l-xl bg-slate-950 px-5 py-3.5 text-sm font-bold text-white shadow-md disabled:opacity-60 dark:bg-slate-100 dark:text-slate-950 sm:rounded-l-full sm:px-7 sm:py-4"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Running…
              </>
            ) : (
              submitLabel
            )}
          </button>
          <button
            type="button"
            disabled={loading}
            aria-label="Choose lineup source for prediction"
            aria-expanded={menuOpen}
            aria-haspopup="listbox"
            onClick={() => setMenuOpen((open) => !open)}
            className="flex items-center justify-center rounded-r-xl border-l border-white/20 bg-slate-950 px-3 py-3.5 text-white shadow-md disabled:opacity-60 dark:border-slate-800 dark:bg-slate-100 dark:text-slate-950 sm:rounded-r-full sm:px-3.5 sm:py-4"
          >
            <ChevronDown
              className={`h-4 w-4 transition ${menuOpen ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>

          {menuOpen ? (
            <div
              role="listbox"
              aria-label="Lineup source"
              className="absolute bottom-full right-0 z-50 mb-2 w-72 overflow-hidden rounded-xl border border-white/30 bg-white/95 shadow-lg backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-950/95"
            >
              <ul className="py-1">
                {LINEUP_SOURCE_OPTIONS.map((option) => (
                  <li key={option.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={lineupSource === option.value}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        onLineupSourceChange(option.value);
                        setMenuOpen(false);
                      }}
                      className={`flex w-full flex-col gap-0.5 px-3 py-2.5 text-left transition hover:bg-slate-100/80 dark:hover:bg-slate-800/50 ${
                        lineupSource === option.value
                          ? "bg-primary/10 dark:bg-primary/15"
                          : ""
                      }`}
                    >
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">
                        {option.label}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {option.description}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="border-t border-slate-200/80 px-3 py-2 text-[10px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                Selected: {activeOption.label}
              </p>
            </div>
          ) : null}
        </div>
      </div>
      <p className="text-center text-[10px] text-slate-500 dark:text-slate-400 sm:text-left sm:pl-6 md:pl-8">
        Date and kickoff use your local time ({timezoneLabel})
      </p>
    </div>
  );
}
