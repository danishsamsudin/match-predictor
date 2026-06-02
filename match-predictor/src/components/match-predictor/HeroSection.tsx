"use client";

export function HeroSection() {
  return (
    <div className="space-y-3 text-center lg:col-span-4 lg:text-left">
      <span className="page-hero-eyebrow text-xs font-bold uppercase text-indigo-600 dark:text-cyan-400">
        AI Match Intelligence
      </span>
      <h1 className="hero-title-glow text-4xl font-extrabold leading-[0.95] tracking-tighter sm:text-5xl lg:text-6xl">
        Match
        <br />
        Predictor
      </h1>
      <p className="mx-auto max-w-xs text-sm leading-relaxed text-slate-500 dark:text-slate-400 lg:mx-0">
        Generate win probabilities, expected goals, and match stat estimates using advanced
        form models.
      </p>
    </div>
  );
}
