import type { Metadata } from "next";
import Link from "next/link";
import { BRAND_NAME } from "@/lib/brand";
import {
  createSignedReportUrl,
  getReportsServiceClient,
  listProductReports,
  type ProductReportRow,
} from "@/lib/product-reports";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Reports | ${BRAND_NAME}`,
};

function kindLabel(kind: ProductReportRow["kind"]): string {
  if (kind === "glpm-league-run") return "League run";
  if (kind === "wc-post-match") return "World Cup post-match";
  return kind;
}

export default async function ReportsPage() {
  const client = getReportsServiceClient();
  let reports: ProductReportRow[] = [];
  let loadError: string | null = null;

  if (!client) {
    loadError = "Reports storage is not configured.";
  } else {
    try {
      reports = await listProductReports(client, 80);
    } catch (err) {
      loadError = err instanceof Error ? err.message : String(err);
    }
  }

  const withUrls = await Promise.all(
    reports.map(async (report) => {
      const [mdUrl, pdfUrl] = await Promise.all([
        report.storage_path_md && client
          ? createSignedReportUrl(client, report.storage_path_md)
          : Promise.resolve(null),
        report.storage_path_pdf && client
          ? createSignedReportUrl(client, report.storage_path_pdf)
          : Promise.resolve(null),
      ]);
      return { report, mdUrl, pdfUrl };
    })
  );

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <section className="liquid-glass-panel rounded-2xl p-5 sm:rounded-[2rem] sm:p-8">
        <p className="page-hero-eyebrow text-xs font-bold uppercase text-indigo-600 dark:text-cyan-400">
          Downloads
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Reports
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
          League-run and methodology exports. Signed links expire after a few
          minutes - refresh this page if a download fails.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        {loadError ? (
          <p className="rounded-xl border border-glass-border bg-surface/60 px-4 py-3 text-sm text-muted">
            {loadError}
          </p>
        ) : null}

        {!loadError && withUrls.length === 0 ? (
          <p className="rounded-xl border border-glass-border bg-surface/60 px-4 py-3 text-sm text-muted">
            No reports uploaded yet. New league runs appear here after they finish.
          </p>
        ) : null}

        {withUrls.map(({ report, mdUrl, pdfUrl }) => (
          <article
            key={report.id}
            className="liquid-glass-panel rounded-2xl p-4 sm:p-5"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">
                  {kindLabel(report.kind)}
                  {report.competition_name ? ` · ${report.competition_name}` : ""}
                  {report.season_id != null ? ` · season ${report.season_id}` : ""}
                </p>
                <h2 className="mt-1 text-base font-semibold text-foreground sm:text-lg">
                  {report.title}
                </h2>
                {report.summary ? (
                  <p className="mt-1 text-sm text-muted">{report.summary}</p>
                ) : null}
                <p className="mt-2 text-xs text-muted">
                  {new Date(report.created_at).toLocaleString()}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {pdfUrl ? (
                  <a
                    href={pdfUrl}
                    className="inline-flex min-h-10 items-center justify-center rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-slate-950"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    PDF
                  </a>
                ) : null}
                {mdUrl ? (
                  <a
                    href={mdUrl}
                    className="inline-flex min-h-10 items-center justify-center rounded-full border border-glass-border bg-surface px-4 py-2 text-sm font-semibold text-foreground"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Markdown
                  </a>
                ) : null}
                {!pdfUrl && !mdUrl ? (
                  <span className="text-xs text-muted">No files</span>
                ) : null}
              </div>
            </div>
          </article>
        ))}
      </section>

      <p className="mt-8 text-center text-sm text-muted">
        <Link href="/home" className="font-semibold text-primary hover:underline">
          Back to home
        </Link>
      </p>
    </div>
  );
}
