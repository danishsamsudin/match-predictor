"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { Menu, X } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggle } from "./ThemeToggle";
import { APP_NAV_LINKS, isMarketingPath, MARKETING_NAV_LINKS } from "@/lib/marketing/routes";

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTitleId = useId();
  const marketing = isMarketingPath(pathname);
  const minimalAuthChrome = pathname === "/login" || pathname === "/signup";

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/");
      router.refresh();
    } finally {
      setIsLoggingOut(false);
      setMenuOpen(false);
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
    const desktopNavLinks = (
      <nav className="flex w-auto shrink-0 items-stretch justify-center gap-1.5">
        {links.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center justify-center whitespace-nowrap rounded-full px-4 py-2 text-[15px] font-semibold transition-all duration-300 ${
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
          <div className="flex items-center justify-between gap-3 md:hidden">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="flex h-11 w-11 items-center justify-center rounded-full text-slate-600 transition hover:bg-white/50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-900/50 dark:hover:text-white"
              aria-label="Open menu"
              aria-expanded={menuOpen}
              aria-controls="mobile-nav-drawer"
            >
              <Menu className="h-5 w-5" aria-hidden />
            </button>
            <Link href={logoHref} className="transition-opacity hover:opacity-90">
              <BrandLogo size="md" />
            </Link>
            <ThemeToggle />
          </div>

          <div className="hidden items-center justify-between gap-3 md:flex">
            <Link href={logoHref} className="shrink-0 transition-opacity hover:opacity-90">
              <BrandLogo size="md" />
            </Link>
            <div className="flex min-w-0 items-center gap-2">
              <div className="liquid-glass-pill flex min-w-0 items-center gap-1.5 overflow-x-auto rounded-full p-1.5">
                <ThemeToggle />
                {desktopNavLinks}
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
                    className="shrink-0 rounded-full bg-slate-950 px-4 py-2 text-sm font-bold text-white dark:bg-white dark:text-slate-950"
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

        {menuOpen ? (
          <div className="md:hidden" id="mobile-nav-drawer">
            <button
              type="button"
              className="fixed inset-0 z-[60] bg-slate-950/55 backdrop-blur-md"
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={menuTitleId}
              className="fixed inset-x-3 top-3 z-[70] max-h-[min(88vh,36rem)] overflow-y-auto rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-950"
            >
              <div className="flex items-center justify-between gap-3">
                <p
                  id={menuTitleId}
                  className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                >
                  Menu
                </p>
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  aria-label="Close menu"
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>

              <nav className="mt-3 flex flex-col gap-1" aria-label="Primary">
                {links.map((link) => {
                  const active = pathname === link.href;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`flex min-h-12 items-center rounded-2xl px-4 text-base font-semibold transition ${
                        active
                          ? "bg-slate-950 text-white dark:bg-slate-100 dark:text-slate-950"
                          : "text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800"
                      }`}
                    >
                      {link.label}
                    </Link>
                  );
                })}
              </nav>

              <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-700">
                {marketing ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Link
                      href="/login"
                      className="flex min-h-11 items-center justify-center rounded-full border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Sign in
                    </Link>
                    <Link
                      href="/signup"
                      className="flex min-h-11 items-center justify-center rounded-full bg-slate-950 px-4 text-sm font-bold text-white dark:bg-white dark:text-slate-950"
                    >
                      Join waitlist
                    </Link>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                    className="flex min-h-11 w-full items-center justify-center rounded-full px-4 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 disabled:opacity-60 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    {isLoggingOut ? "Signing out…" : "Log out"}
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : null}
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
