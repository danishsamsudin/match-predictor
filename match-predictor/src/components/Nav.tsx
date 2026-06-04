"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggle } from "./ThemeToggle";

const links = [
  { href: "/", label: "Predict" },
  { href: "/world-cup", label: "World Cup" },
  { href: "/predictions", label: "History" },
];

export function Nav() {
  const pathname = usePathname();

  const navLinks = (
    <nav className="flex w-full shrink-0 items-stretch justify-center gap-1 sm:w-auto sm:gap-1.5">
      {links.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`flex min-h-11 flex-1 items-center justify-center whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-semibold transition-all duration-300 sm:min-h-0 sm:flex-none sm:px-5 sm:py-2 sm:text-[15px] ${
              active
                ? "bg-slate-950 text-white dark:bg-slate-100 dark:text-slate-950"
                : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <header className="sticky top-0 z-50 border-b border-white/30 bg-white/50 backdrop-blur-2xl transition-colors duration-500 dark:border-slate-800/50 dark:bg-slate-950/30">
      <div className="mx-auto max-w-6xl min-w-0 px-4 py-3 sm:px-6 sm:py-3.5">
        {/* Mobile: theme top-right, logo centered, nav pill below */}
        <div className="sm:hidden">
          <div className="relative flex min-h-9 items-center justify-center">
            <div className="absolute right-0 top-1/2 -translate-y-1/2">
              <ThemeToggle />
            </div>
            <Link href="/" className="transition-opacity hover:opacity-90">
              <BrandLogo size="md" />
            </Link>
          </div>
          <div className="mt-3.5 flex justify-center px-1">
            <div className="liquid-glass-pill flex w-full max-w-lg items-center rounded-full p-1.5">
              {navLinks}
            </div>
          </div>
        </div>

        {/* Desktop: logo left, theme + links in one pill */}
        <div className="hidden items-center justify-between gap-3 sm:flex">
          <Link href="/" className="shrink-0 transition-opacity hover:opacity-90">
            <BrandLogo size="md" />
          </Link>
          <div className="liquid-glass-pill flex items-center gap-1.5 rounded-full p-1.5">
            <ThemeToggle />
            {navLinks}
          </div>
        </div>
      </div>
    </header>
  );
}
