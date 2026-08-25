"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { BRAND_TAGLINE } from "@/lib/brand";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Invalid username or password");
        return;
      }

      const nextPath = searchParams.get("next");
      const destination =
        nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")
          ? nextPath
          : "/home";
      // Cookie is already set; a single navigation is enough (refresh doubled /home work).
      router.replace(destination);
    } catch {
      setError("Unable to sign in. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const fieldClass =
    "w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";

  return (
    <div className="liquid-glass-panel relative w-full overflow-hidden rounded-[2rem] p-6 sm:p-8">
      <div className="text-center">
        <BrandLogo size="lg" />
        <h1 className="mt-4 text-2xl font-bold text-foreground">Welcome back</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          {BRAND_TAGLINE}
        </p>
      </div>

      <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
        <div>
          <label
            htmlFor="username"
            className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300"
          >
            Username
          </label>
          <input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className={fieldClass}
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300"
          >
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={fieldClass}
          />
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
          >
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="chromatic-cta w-full rounded-full bg-slate-950 py-3.5 text-sm font-bold text-white transition disabled:opacity-60 dark:bg-slate-100 dark:text-slate-950"
        >
          {isSubmitting ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        New here?{" "}
        <Link href="/signup" className="font-semibold text-primary hover:underline">
          Join the waitlist
        </Link>
      </p>
      <p className="mt-3 text-center text-[11px] leading-relaxed text-muted">
        By signing in you agree to our{" "}
        <Link href="/terms" className="underline underline-offset-2">
          Terms
        </Link>
        ,{" "}
        <Link href="/privacy" className="underline underline-offset-2">
          Privacy
        </Link>
        , and{" "}
        <Link href="/disclaimer" className="underline underline-offset-2">
          Disclaimer
        </Link>
        . Estimates are not betting advice. 18+.
      </p>
    </div>
  );
}
