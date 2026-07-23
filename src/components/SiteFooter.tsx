import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";
import { CONTACT_EMAIL, FOOTER_DISCLAIMER } from "@/lib/marketing/copy";

const companyLinks = [
  { href: "/features", label: "Features" },
  { href: "/methodology", label: "Methodology" },
  { href: "/pricing", label: "Pricing" },
  { href: "/faq", label: "FAQ" },
];

const productLinks = [
  { href: "/home", label: "App home" },
  { href: "/predict", label: "Predict" },
  { href: "/league", label: "League" },
  { href: "/predictions", label: "History" },
];

const legalLinks = [
  { href: "/privacy", label: "Privacy policy" },
  { href: "/terms", label: "Terms & conditions" },
  { href: "/disclaimer", label: "Disclaimer" },
];

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative z-10 border-t border-white/30 bg-white/40 backdrop-blur-xl dark:border-slate-800/50 dark:bg-slate-950/40">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <BrandLogo size="lg" />
            <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              {BRAND_TAGLINE} Built for fans who want clear numbers, not noise.
            </p>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="mt-3 inline-block text-sm font-semibold text-indigo-600 dark:text-cyan-400"
            >
              {CONTACT_EMAIL}
            </a>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
              Company
            </p>
            <ul className="mt-3 space-y-2">
              {companyLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm font-medium text-slate-700 transition hover:text-indigo-600 dark:text-slate-300 dark:hover:text-cyan-400"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
              Product
            </p>
            <ul className="mt-3 space-y-2">
              {productLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm font-medium text-slate-700 transition hover:text-indigo-600 dark:text-slate-300 dark:hover:text-cyan-400"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
              Legal
            </p>
            <ul className="mt-3 space-y-2">
              {legalLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm font-medium text-slate-700 transition hover:text-indigo-600 dark:text-slate-300 dark:hover:text-cyan-400"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mt-8 border-t border-slate-200/60 pt-6 text-center text-xs leading-relaxed text-slate-500 dark:border-slate-800/60 dark:text-slate-500">
          © {year} {BRAND_NAME}. {FOOTER_DISCLAIMER}
        </p>
      </div>
    </footer>
  );
}
