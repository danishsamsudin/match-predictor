"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { PRICING_PLANS, type PricingPlanId } from "@/lib/marketing/pricing";

type WaitlistFormProps = {
  defaultPlan?: PricingPlanId | null;
  source?: "pricing" | "signup" | "landing";
  compact?: boolean;
};

export function WaitlistForm({
  defaultPlan = "edge",
  source = "pricing",
  compact = false,
}: WaitlistFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState<PricingPlanId>(defaultPlan ?? "edge");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setMessage(null);

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          fullName: name || undefined,
          plan,
          source,
          marketingOptIn: true,
        }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string; ok?: boolean } | null;
      if (!response.ok) {
        setStatus("error");
        setMessage(data?.error ?? "Unable to join the waitlist. Please try again.");
        return;
      }
      setStatus("success");
      setMessage("You're on the list. We'll reach out when your tier opens.");
      setEmail("");
      setName("");
    } catch {
      setStatus("error");
      setMessage("Unable to join the waitlist. Please try again.");
    }
  }

  if (status === "success") {
    return (
      <div className="liquid-glass-panel rounded-2xl p-6 text-sm text-foreground">
        <p className="font-semibold">{message}</p>
        <p className="mt-2 text-muted">
          Already have access?{" "}
          <Link href="/login" className="font-semibold text-primary hover:underline">
            Sign in
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`liquid-glass-panel space-y-4 rounded-2xl ${compact ? "p-5" : "p-6 sm:p-8"}`}
    >
      {!compact ? (
        <div>
          <h3 className="text-lg font-bold text-foreground">Join the waitlist</h3>
          <p className="mt-1 text-sm text-muted">
            Pick a tier. No payment today - we&apos;ll email when the 14-day trial opens.
          </p>
        </div>
      ) : null}

      <div className={compact ? "grid gap-3 sm:grid-cols-2" : "space-y-4"}>
        <div>
          <label htmlFor="waitlist-name" className="mb-1.5 block text-sm font-semibold text-foreground">
            Name <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id="waitlist-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div>
          <label htmlFor="waitlist-email" className="mb-1.5 block text-sm font-semibold text-foreground">
            Email
          </label>
          <input
            id="waitlist-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      <div>
        <label htmlFor="waitlist-plan" className="mb-1.5 block text-sm font-semibold text-foreground">
          Preferred plan
        </label>
        <select
          id="waitlist-plan"
          value={plan}
          onChange={(e) => setPlan(e.target.value as PricingPlanId)}
          className="w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        >
          {PRICING_PLANS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} ({item.priceLabel}/mo)
            </option>
          ))}
        </select>
      </div>

      {message && status === "error" ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={status === "loading"}
        className="chromatic-cta w-full rounded-full bg-slate-950 py-3.5 text-sm font-bold text-white disabled:opacity-60 dark:bg-white dark:text-slate-950"
      >
        {status === "loading" ? "Submitting…" : "Join waitlist"}
      </button>
      <p className="text-[11px] leading-relaxed text-muted">
        By joining you agree we may contact you about DynamixG access. Estimates are not betting
        advice. 18+.{" "}
        <Link href="/privacy" className="underline underline-offset-2">
          Privacy
        </Link>
        .
      </p>
    </form>
  );
}
