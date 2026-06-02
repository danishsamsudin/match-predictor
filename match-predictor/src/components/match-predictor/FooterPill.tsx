"use client";

import { Calendar, Clock, Loader2, MapPin } from "lucide-react";

export function FooterPill({
  city,
  onCityChange,
  date,
  onDateChange,
  time,
  onTimeChange,
  loading,
  submitDisabled,
}: {
  city: string;
  onCityChange: (v: string) => void;
  date: string;
  onDateChange: (v: string) => void;
  time: string;
  onTimeChange: (v: string) => void;
  loading: boolean;
  submitDisabled: boolean;
}) {
  return (
    <div className="liquid-glass-pill flex flex-col gap-3 rounded-2xl p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:rounded-full sm:p-2 sm:pl-6 md:pl-8">
      <div className="grid min-w-0 grid-cols-1 gap-3 min-[400px]:grid-cols-3 sm:flex sm:flex-wrap sm:items-center sm:gap-6 md:gap-8">
        <label className="flex min-w-0 items-center gap-2 border-b border-slate-200/80 pb-3 text-slate-700 dark:border-slate-800 dark:text-slate-300 min-[400px]:border-b-0 min-[400px]:pb-0 sm:border-b-0 sm:pb-0 sm:border-l-0 sm:pl-0">
          <MapPin className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          <span className="sr-only">City</span>
          <input
            type="text"
            name="city"
            value={city}
            onChange={(e) => onCityChange(e.target.value)}
            required
            placeholder="City"
            className="min-w-0 flex-1 border-none bg-transparent p-0 text-sm font-medium capitalize text-slate-800 outline-none focus:ring-0 dark:text-slate-200"
          />
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
            className="min-w-0 flex-1 border-none bg-transparent p-0 text-sm font-medium text-slate-800 outline-none focus:ring-0 dark:text-slate-200 dark:[color-scheme:dark]"
          />
        </label>

        <label className="flex min-w-0 items-center gap-2 text-slate-700 dark:text-slate-300 sm:border-l sm:border-slate-300/80 sm:pl-6 dark:sm:border-slate-800 md:pl-8">
          <Clock className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          <span className="sr-only">Kickoff time UTC</span>
          <input
            type="time"
            name="time"
            value={time}
            onChange={(e) => onTimeChange(e.target.value)}
            required
            className="min-w-0 flex-1 border-none bg-transparent p-0 text-sm font-medium text-slate-800 outline-none focus:ring-0 dark:text-slate-200 dark:[color-scheme:dark]"
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={submitDisabled}
        className="chromatic-cta flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-950 px-6 py-3.5 text-sm font-bold text-white shadow-md disabled:opacity-60 dark:bg-slate-100 dark:text-slate-950 sm:w-auto sm:rounded-full sm:px-8 sm:py-4"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Running…
          </>
        ) : (
          "Generate Prediction"
        )}
      </button>
    </div>
  );
}
