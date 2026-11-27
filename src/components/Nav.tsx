"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { ChevronDown, Menu, X } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggle } from "./ThemeToggle";
import {
  APP_NAV_LINKS,
  type AppNavLink,
  isMarketingPath,
  MARKETING_NAV_LINKS,
} from "@/lib/marketing/routes";
import { PAGE_MAX_WIDTH_CLASS } from "@/lib/layout";

function linkActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function tournamentsActive(pathname: string, link: AppNavLink): boolean {
  if (!link.children) return false;
  return link.children.some((c) => linkActive(pathname, c.href));
}

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openMenuLabel, setOpenMenuLabel] = useState<string | null>(null);
  const menuTitleId = useId();
  const marketing = isMarketingPath(pathname);
  const minimalAuthChrome = pathname === "/login" || pathname === "/signup";

  useEffect(() => {
    setMenuOpen(false);
    setOpenMenuLabel(null);
  }, [pathname]);

  useEffect(() => {
    const hrefs = new Set<string>();
    for (const link of marketing ? MARKETING_NAV_LINKS : APP_NAV_LINKS) {
      if (link.children) {
        for (const child of link.children) hrefs.add(child.href);
      } else if (link.href) {
        hrefs.add(link.href);
      }
    }
    if (marketing) {
      hrefs.add("/signup");
      hrefs.add("/login");
      hrefs.add("/about");
      hrefs.add("/sources");
    } else {
      hrefs.add("/home");
    }
    for (const href of hrefs) {
      router.prefetch(href);
    }
  }, [marketing, router]);

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
      className="flex min-h-11 items-center justify-center whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-semibold text-slate-700 transition-all duration-300 hover:text-slate-950 disabled:opacity-60 dark:text-slate-200 dark:hover:text-white sm:min-h-0 sm:px-5 sm:py-2 sm:text-[15px]"
    >
      {isLoggingOut ? "Signing out…" : "Log out"}
    </button>
  );

  const navInactive =
    "text-slate-700 hover:text-slate-950 dark:text-slate-200 dark:hover:text-white";
  const navActive =
    "bg-slate-950 text-white dark:bg-white dark:text-slate-950";

  function renderNavItem(link: AppNavLink, mobile = false) {
    if (link.children) {
      const active = tournamentsActive(pathname, link);
      if (mobile) {
        return (
          <div key={link.label} className="flex flex-col gap-1">
            <p className="px-4 pt-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              {link.label}
            </p>
            {link.children.map((child) => {
              const childActive = linkActive(pathname, child.href);
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  className={`flex min-h-12 items-center rounded-2xl px-4 text-base font-semibold transition ${
                    childActive
                      ? "bg-slate-950 text-white dark:bg-slate-100 dark:text-slate-950"
                      : "text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  {child.label}
                </Link>
              );
            })}
          </div>
        );
      }

      const menuOpenForLink = openMenuLabel === link.label;
      return (
        <div key={link.label} className="relative">
          <button
            type="button"
            onClick={() =>
              setOpenMenuLabel((current) => (current === link.label ? null : link.label))
            }
            onBlur={() => {
              // delay so click on link registers
              window.setTimeout(() => setOpenMenuLabel(null), 150);
            }}
            className={`flex items-center justify-center gap-1 whitespace-nowrap rounded-full px-4 py-2 text-[15px] font-semibold transition-all duration-300 ${
              active ? navActive : navInactive
            }`}
            aria-expanded={menuOpenForLink}
            aria-haspopup="menu"
          >
            {link.label}
            <ChevronDown className="h-4 w-4 opacity-80" aria-hidden />
          </button>
          {menuOpenForLink ? (
            <div
              role="menu"
              className="glass-surface absolute left-0 top-full z-50 mt-2 min-w-[14rem] rounded-2xl p-1.5 shadow-xl"
            >
              {link.children.map((child) => {
                const childActive = linkActive(pathname, child.href);
                return (
                  <Link
                    key={child.href}
                    href={child.href}
                    role="menuitem"
                    className={`block rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                      childActive
                        ? "bg-slate-100 text-slate-950 dark:bg-slate-800 dark:text-white"
                        : "text-slate-800 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-900"
                    }`}
                  >
                    {child.label}
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>
      );
    }

    const active = linkActive(pathname, link.href);
    if (mobile) {
      return (
        <Link
          key={link.href}
          href={link.href}
          className={`flex min-h-12 items-center rounded-2xl px-4 text-base font-semibold transition ${
            active
              ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
              : "text-slate-900 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          {link.label}
        </Link>
      );
    }

    return (
      <Link
        key={link.href}
        href={link.href}
        className={`flex items-center justify-center whitespace-nowrap rounded-full px-4 py-2 text-[15px] font-semibold transition-all duration-300 ${
          active ? navActive : navInactive
        }`}
      >
        {link.label}
      </Link>
    );
  }

  function renderLinks(links: readonly AppNavLink[], logoHref: string) {
    const desktopNavLinks = (
      <nav className="flex w-auto shrink-0 items-stretch justify-center gap-1.5">
        {links.map((link) => renderNavItem(link))}
      </nav>
    );

    return (
      <header className="pointer-events-none sticky top-0 z-50 px-3 pt-3 sm:px-4 sm:pt-4">
        <div className={`glass-chrome glass-chrome-float pointer-events-auto mx-auto ${PAGE_MAX_WIDTH_CLASS} min-w-0 px-3 py-2.5 sm:px-4 sm:py-3`}>
          <div className="flex items-center justify-between gap-3 md:hidden">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="flex h-11 w-11 items-center justify-center rounded-full text-slate-700 transition hover:bg-black/5 hover:text-slate-950 dark:text-slate-100 dark:hover:bg-white/10 dark:hover:text-white"
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
              <div className="glass-nav-pill flex min-w-0 items-center gap-1.5 overflow-visible rounded-full p-1.5">
                <ThemeToggle />
                {desktopNavLinks}
              </div>
              {marketing ? (
                <>
                  <Link
                    href="/login"
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${navInactive}`}
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/signup"
                    className="shrink-0 rounded-full bg-slate-950 px-4 py-2 text-sm font-bold text-white dark:bg-white dark:text-slate-950"
                  >
                    Request beta
                  </Link>
                </>
              ) : (
                logoutButton
              )}
            </div>
          </div>
        </div>

        {menuOpen ? (
          <div className="pointer-events-auto md:hidden" id="mobile-nav-drawer">
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
              className="glass-surface fixed inset-x-3 top-3 z-[70] max-h-[min(88vh,36rem)] overflow-y-auto rounded-[1.75rem] p-4 shadow-2xl"
            >
              <div className="flex items-center justify-between gap-3">
                <p
                  id={menuTitleId}
                  className="text-sm font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300"
                >
                  Menu
                </p>
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800"
                  aria-label="Close menu"
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>

              <nav className="mt-3 flex flex-col gap-1" aria-label="Primary">
                {links.map((link) => renderNavItem(link, true))}
              </nav>

              <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-700">
                {marketing ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Link
                      href="/login"
                      className="flex min-h-11 items-center justify-center rounded-full border border-slate-200 px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
                    >
                      Sign in
                    </Link>
                    <Link
                      href="/signup"
                      className="flex min-h-11 items-center justify-center rounded-full bg-slate-950 px-4 text-sm font-bold text-white dark:bg-white dark:text-slate-950"
                    >
                      Request beta
                    </Link>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                    className="flex min-h-11 w-full items-center justify-center rounded-full px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60 dark:text-slate-200 dark:hover:bg-slate-800"
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
      <header className="pointer-events-none sticky top-0 z-50 px-3 pt-3 sm:px-4 sm:pt-4">
        <div className={`glass-chrome glass-chrome-float pointer-events-auto mx-auto flex ${PAGE_MAX_WIDTH_CLASS} min-w-0 items-center justify-between px-3 py-2.5 sm:px-4 sm:py-3`}>
          <Link href="/">
            <BrandLogo size="md" />
          </Link>
          <div className="flex items-center gap-2">
            {pathname === "/login" ? (
              <Link
                href="/signup"
                className="rounded-full px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200"
              >
                Request beta
              </Link>
            ) : (
              <Link
                href="/login"
                className="rounded-full px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200"
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
    return renderLinks(MARKETING_NAV_LINKS, "/");
  }

  return renderLinks(APP_NAV_LINKS, "/home");
}
