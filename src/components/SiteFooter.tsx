import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";
import { CONTACT_EMAIL, FOOTER_DISCLAIMER } from "@/lib/marketing/copy";
import { FOOTER_COLUMNS } from "@/lib/marketing/routes";
import { PAGE_MAX_WIDTH_CLASS } from "@/lib/layout";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="glass-chrome relative z-10 mt-8 border-t border-glass-border sm:mt-0">
      <div className={`mx-auto ${PAGE_MAX_WIDTH_CLASS} px-4 py-10 sm:px-6`}>
        <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <div className="sm:col-span-2 md:col-span-3 lg:col-span-1">
            <BrandLogo size="lg" />
            <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              {BRAND_TAGLINE} Built for fans who want clear numbers, not noise.
            </p>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-indigo-600 dark:text-cyan-400"
            >
              {CONTACT_EMAIL}
            </a>
          </div>

          {FOOTER_COLUMNS.map((column) => (
            <div key={column.title}>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                {column.title}
              </p>
              <ul className="mt-3 space-y-1">
                {column.links.map((link) => (
                  <li key={`${column.title}-${link.href}-${link.label}`}>
                    <Link
                      href={link.href}
                      className="inline-flex min-h-10 items-center text-sm font-medium text-slate-700 transition hover:text-indigo-600 dark:text-slate-300 dark:hover:text-cyan-400"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="mt-8 border-t border-slate-200/60 pt-6 text-center text-xs leading-relaxed text-slate-500 dark:border-slate-800/60 dark:text-slate-500">
          © {year} {BRAND_NAME}. {FOOTER_DISCLAIMER}
        </p>
      </div>
    </footer>
  );
}
