export function PageHero({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-10">
      <p className="page-hero-eyebrow mb-2 text-xs font-bold uppercase text-indigo-600 dark:text-cyan-400">
        {eyebrow}
      </p>
      <h1 className="hero-title-glow text-4xl font-extrabold tracking-tighter sm:text-5xl">
        {title}
      </h1>
      {description && (
        <p className="mt-3 max-w-xl text-sm text-slate-500 dark:text-slate-400">{description}</p>
      )}
    </div>
  );
}
