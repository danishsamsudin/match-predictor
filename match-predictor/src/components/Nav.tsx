import Link from "next/link";

const links = [
  { href: "/", label: "Predict" },
  { href: "/predictions", label: "History" },
];

export function Nav() {
  return (
    <header className="border-b border-zinc-200/80 bg-white/70 backdrop-blur-md dark:border-zinc-700/60 dark:bg-zinc-900/70">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
        <Link
          href="/"
          className="bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-lg font-semibold tracking-tight text-transparent dark:from-emerald-400 dark:to-teal-300"
        >
          Match Predictor
        </Link>
        <nav className="flex gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
