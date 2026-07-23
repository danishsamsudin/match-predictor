"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggle } from "./ThemeToggle";
import { APP_NAV_LINKS, isMarketingPath, MARKETING_NAV_LINKS } from "@/lib/marketing/routes";

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const marketing = isMarketingPath(pathname);
  const minimalAuthChrome = pathname === "/login" || pathname === "/signup";

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/");
      router.refresh();
    } finally {
      setIsLoggingOut(false);
    }
  }

  const logoutButton = (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isLoggingOut}
      className="flex min-h-11 items-center justify-center whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-semibold text-slate-500 transition-all duration-300 hover:text-slate-800 disabled:opacity-60 dark:text-slate-400 dark:hover:text-slate-200 sm:min-h-0 sm:px-5 sm:py-2 sm:text-[15px]"
    >
      {isLoggingOut ? "Signing out…" : "Log out"}
    </button>
  );

  function renderLinks(
    links: readonly { href: string; label: string }[],
    logoHref: string
  ) {
    const navLinks = (
      <nav className="flex w-full shrink-0 items-stretch justify-center gap-1 sm:w-auto sm:gap-1.5">
        {links.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex min-h-11 flex-1 items-center justify-center whitespace-nowrap rounded-full px-3 py-2.5 text-sm font-semibold transition-all duration-300 sm:min-h-0 sm:flex-none sm:px-4 sm:py-2 sm:text-[15px] ${
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
          <div className="sm:hidden">
            <div className="relative flex min-h-9 items-center justify-center">
              <div className="absolute right-0 top-1/2 flex -translate-y-1/2 items-center gap-1">
                {!marketing ? logoutButton : null}
                <ThemeToggle />
              </div>
              <Link href={logoHref} className="transition-opacity hover:opacity-90">
                <BrandLogo size="md" />
              </Link>
            </div>
            <div className="mt-3.5 flex justify-center px-1">
              <div className="liquid-glass-pill flex w-full max-w-lg items-center overflow-x-auto rounded-full p-1.5">
                {navLinks}
              </div>
            </div>
            {marketing ? (
              <div className="mt-3 flex justify-center gap-2">
                <Link
                  href="/login"
                  className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300"
                >
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  className="rounded-full bg-slate-950 px-4 py-2 text-sm font-bold text-white dark:bg-white dark:text-slate-950"
                >
                  Join waitlist
                </Link>
              </div>
            ) : null}
          </div>

          <div className="hidden items-center justify-between gap-3 sm:flex">
            <Link href={logoHref} className="shrink-0 transition-opacity hover:opacity-90">
              <BrandLogo size="md" />
            </Link>
            <div className="flex items-center gap-2">
              <div className="liquid-glass-pill flex items-center gap-1.5 rounded-full p-1.5">
                <ThemeToggle />
                {navLinks}
              </div>
              {marketing ? (
                <>
                  <Link
                    href="/login"
                    className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/signup"
                    className="rounded-full bg-slate-950 px-4 py-2 text-sm font-bold text-white dark:bg-white dark:text-slate-950"
                  >
                    Join waitlist
                  </Link>
                </>
              ) : (
                logoutButton
              )}
            </div>
          </div>
        </div>
      </header>
    );
  }

  if (minimalAuthChrome) {
    return (
      <header className="sticky top-0 z-50 border-b border-white/30 bg-white/50 backdrop-blur-2xl transition-colors duration-500 dark:border-slate-800/50 dark:bg-slate-950/30">
        <div className="mx-auto flex max-w-6xl min-w-0 items-center justify-between px-4 py-3 sm:px-6 sm:py-3.5">
          <Link href="/">
            <BrandLogo size="md" />
          </Link>
          <div className="flex items-center gap-2">
            {pathname === "/login" ? (
              <Link
                href="/signup"
                className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300"
              >
                Join waitlist
              </Link>
            ) : (
              <Link
                href="/login"
                className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300"
              >
                Sign in
              </Link>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>
    );
  }

  if (marketing) {
    return renderLinks([...MARKETING_NAV_LINKS], "/");
  }

  return renderLinks([...APP_NAV_LINKS], "/home");
}
