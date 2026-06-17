import { BRAND_NAME } from "@/lib/brand";

const sizeClass = {
  sm: "text-base",
  md: "text-lg",
  lg: "text-2xl",
  hero: "text-[clamp(2rem,6vw,4.25rem)] leading-none",
} as const;

export function BrandLogo({
  size = "md",
  className = "",
}: {
  size?: keyof typeof sizeClass;
  className?: string;
}) {
  const hero = size === "hero";

  return (
    <span
      className={`brand-wordmark inline font-extrabold tracking-tighter ${sizeClass[size]} ${hero ? "brand-wordmark-hero" : ""} ${className}`.trim()}
      aria-label={BRAND_NAME}
    >
      <span className="text-slate-950 dark:text-white">Dynami</span>
      <span className="brand-wordmark-xg">xG</span>
    </span>
  );
}
