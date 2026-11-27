"use client";

import { BrandLogo } from "@/components/BrandLogo";
import { BRAND_HERO_EYEBROW, BRAND_HERO_SUBTITLE } from "@/lib/brand";

export function HeroSection() {
  return (
    <header className="relative w-full space-y-3 text-left sm:text-center">
      <div className="relative inline-block sm:mx-auto">
        <div className="brand-hero-aura" aria-hidden />
        <h1>
          <BrandLogo size="hero" />
        </h1>
      </div>
      <p className="page-hero-eyebrow type-meta font-bold uppercase text-indigo-600 dark:text-cyan-400">
        {BRAND_HERO_EYEBROW}
      </p>
      <p className="type-body-muted mx-auto max-w-2xl">{BRAND_HERO_SUBTITLE}</p>
    </header>
  );
}
