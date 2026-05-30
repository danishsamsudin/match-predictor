"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

const links = [
  { href: "/", label: "Predict" },
  { href: "/predictions", label: "History" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="glass-nav sticky top-0 z-50">
      <div className="relative mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
        <Link href="/" className="text-lg font-bold tracking-tight text-gradient">
          Match Predictor
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <nav className="glass-nav-pill flex gap-1 rounded-xl p-1">
            {links.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
                    active ? "nav-link-active" : "nav-link-inactive"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}
