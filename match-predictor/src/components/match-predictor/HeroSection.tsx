"use client";

import { BrandLogo } from "@/components/BrandLogo";
import { BRAND_HERO_EYEBROW, BRAND_HERO_SUBTITLE } from "@/lib/brand";

export function HeroSection() {
  return (
    <header className="relative w-full space-y-4 border-b border-slate-200/60 pb-6 text-center dark:border-slate-800/60 sm:pb-8">
      <div className="relative mx-auto inline-block">
        <div className="brand-hero-aura" aria-hidden />
        <h1>
          <BrandLogo size="hero" />
        </h1>
      </div>
      <p className="page-hero-eyebrow text-xs font-bold uppercase text-indigo-600 dark:text-cyan-400">
        {BRAND_HERO_EYEBROW}
      </p>
      <p className="mx-auto max-w-xl text-sm leading-relaxed text-slate-500 dark:text-slate-400 sm:text-base">
        {BRAND_HERO_SUBTITLE}
      </p>
    </header>
  );
}
