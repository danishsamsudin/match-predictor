"use client";

export function HeroSection() {
  return (
    <header className="w-full space-y-3 border-b border-slate-200/60 pb-6 text-center dark:border-slate-800/60 sm:pb-8">
      <span className="page-hero-eyebrow text-xs font-bold uppercase text-indigo-600 dark:text-cyan-400">
        AI Match Intelligence
      </span>
      <h1 className="hero-title-glow text-[clamp(1.75rem,5vw,3.75rem)] font-extrabold leading-none tracking-tighter whitespace-nowrap">
        Match Predictor
      </h1>
      <p className="mx-auto max-w-xl text-sm leading-relaxed text-slate-500 dark:text-slate-400 sm:text-base">
        Generate win probabilities, expected goals, and match stat estimates using advanced
        form models.
      </p>
    </header>
  );
}
