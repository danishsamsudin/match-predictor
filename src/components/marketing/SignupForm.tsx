"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { PRICING_PLANS, type PricingPlanId } from "@/lib/marketing/pricing";

const COUNTRIES = [
  "Netherlands",
  "Belgium",
  "Germany",
  "United Kingdom",
  "Ireland",
  "France",
  "Spain",
  "Italy",
  "Portugal",
  "United States",
  "Canada",
  "Australia",
  "Other",
] as const;

type SignupFormProps = {
  defaultPlan?: PricingPlanId | null;
};

export function SignupForm({ defaultPlan = "edge" }: SignupFormProps) {
  const initialPlan = useMemo(
    () => (defaultPlan && PRICING_PLANS.some((p) => p.id === defaultPlan) ? defaultPlan : "edge"),
    [defaultPlan]
  );

  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState<string>("Netherlands");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [plan, setPlan] = useState<PricingPlanId>(initialPlan);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [acceptDisclaimer, setAcceptDisclaimer] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (!ageConfirmed || !acceptTerms || !acceptPrivacy || !acceptDisclaimer) {
      setError("Please confirm you are 18+ and accept Terms, Privacy, and Disclaimer.");
      return;
    }

    setStatus("loading");
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "signup",
          username,
          fullName,
          email,
          phone,
          country,
          plan,
          marketingOptIn,
          ageConfirmed,
          acceptTerms,
          acceptPrivacy,
          acceptDisclaimer,
          // Password is collected for future auth wiring; not stored in waitlist this pass.
          passwordProvided: Boolean(password),
        }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setStatus("error");
        setError(data?.error ?? "Unable to submit. Please try again.");
        return;
      }
      setStatus("success");
    } catch {
      setStatus("error");
      setError("Unable to submit. Please try again.");
    }
  }

  if (status === "success") {
    return (
      <div className="liquid-glass-panel rounded-[2rem] p-8 text-center sm:p-10">
        <h2 className="text-2xl font-bold text-foreground">You&apos;re on the list</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          Thanks for registering interest. Access is invite / waitlist-based while we open tiers.
          We&apos;ll contact you at <span className="font-semibold text-foreground">{email}</span>{" "}
          when your plan is ready. No charge today.
        </p>
        <p className="mt-4 text-sm text-muted">
          Already have credentials?{" "}
          <Link href="/login" className="font-semibold text-primary hover:underline">
            Sign in
          </Link>
          .
        </p>
      </div>
    );
  }

  const fieldClass =
    "w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

  return (
    <form onSubmit={handleSubmit} className="liquid-glass-panel space-y-5 rounded-[2rem] p-6 sm:p-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground sm:text-3xl">Create your waitlist account</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Collecting the details we need for access. Multi-user login ships next - this signup does
          not create a live session yet.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="username" className="mb-1.5 block text-sm font-semibold">
            Username
          </label>
          <input
            id="username"
            required
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="fullName" className="mb-1.5 block text-sm font-semibold">
            Full name
          </label>
          <input
            id="fullName"
            required
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-semibold">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="phone" className="mb-1.5 block text-sm font-semibold">
            Phone
          </label>
          <input
            id="phone"
            type="tel"
            required
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="country" className="mb-1.5 block text-sm font-semibold">
            Country
          </label>
          <select
            id="country"
            required
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className={fieldClass}
          >
            {COUNTRIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="plan" className="mb-1.5 block text-sm font-semibold">
            Preferred plan
          </label>
          <select
            id="plan"
            value={plan}
            onChange={(e) => setPlan(e.target.value as PricingPlanId)}
            className={fieldClass}
          >
            {PRICING_PLANS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.priceLabel}/mo)
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-semibold">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-semibold">
            Confirm password
          </label>
          <input
            id="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={fieldClass}
          />
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-glass-border bg-surface/50 p-4 text-sm">
        <label className="flex gap-3">
          <input
            type="checkbox"
            checked={ageConfirmed}
            onChange={(e) => setAgeConfirmed(e.target.checked)}
            className="mt-1"
          />
          <span>I confirm I am 18 years of age or older.</span>
        </label>
        <label className="flex gap-3">
          <input
            type="checkbox"
            checked={acceptTerms}
            onChange={(e) => setAcceptTerms(e.target.checked)}
            className="mt-1"
          />
          <span>
            I agree to the{" "}
            <Link href="/terms" className="font-semibold text-primary underline">
              Terms &amp; conditions
            </Link>
            .
          </span>
        </label>
        <label className="flex gap-3">
          <input
            type="checkbox"
            checked={acceptPrivacy}
            onChange={(e) => setAcceptPrivacy(e.target.checked)}
            className="mt-1"
          />
          <span>
            I agree to the{" "}
            <Link href="/privacy" className="font-semibold text-primary underline">
              Privacy policy
            </Link>
            .
          </span>
        </label>
        <label className="flex gap-3">
          <input
            type="checkbox"
            checked={acceptDisclaimer}
            onChange={(e) => setAcceptDisclaimer(e.target.checked)}
            className="mt-1"
          />
          <span>
            I understand the{" "}
            <Link href="/disclaimer" className="font-semibold text-primary underline">
              Disclaimer
            </Link>{" "}
            - DynamixG is entertainment / research only and not betting advice.
          </span>
        </label>
        <label className="flex gap-3">
          <input
            type="checkbox"
            checked={marketingOptIn}
            onChange={(e) => setMarketingOptIn(e.target.checked)}
            className="mt-1"
          />
          <span>Send me product updates and waitlist emails (optional).</span>
        </label>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={status === "loading"}
        className="chromatic-cta w-full rounded-full bg-slate-950 py-3.5 text-sm font-bold text-white disabled:opacity-60 dark:bg-white dark:text-slate-950"
      >
        {status === "loading" ? "Submitting…" : "Join waitlist"}
      </button>

      <p className="text-center text-sm text-muted">
        Already have access?{" "}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
