"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggle } from "./ThemeToggle";

const links = [
  { href: "/", label: "Predict" },
  { href: "/predictions", label: "History" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-white/30 bg-white/50 backdrop-blur-2xl transition-colors duration-500 dark:border-slate-800/50 dark:bg-slate-950/30">
      <div className="relative mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
        <Link href="/" className="transition-opacity hover:opacity-90">
          <BrandLogo size="md" />
        </Link>
        <div className="flex items-center gap-2">
          <div className="liquid-glass-pill flex items-center gap-1 rounded-full p-1">
            <ThemeToggle />
            <nav className="flex gap-0.5">
              {links.map((link) => {
                const active = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-300 ${
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
          </div>
        </div>
      </div>
    </header>
  );
}
