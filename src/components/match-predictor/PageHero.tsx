export function PageHero({
  eyebrow,
  title,
  description,
  className = "",
}: {
  eyebrow: string;
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={`mb-6 sm:mb-8${className ? ` ${className}` : ""}`}>
      <p className="page-hero-eyebrow mb-2 type-meta font-bold uppercase text-indigo-600 dark:text-cyan-400">
        {eyebrow}
      </p>
      <h1 className="hero-title-glow type-page-title">{title}</h1>
      {description ? (
        <p className="type-body-muted mt-3 max-w-2xl">{description}</p>
      ) : null}
    </div>
  );
}
