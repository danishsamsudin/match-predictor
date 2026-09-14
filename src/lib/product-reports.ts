/**
 * Product reports catalog + Storage helpers (service role).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { tryCreateServiceClient } from "@/lib/supabase";

export const PRODUCT_REPORTS_BUCKET = "product-reports";

export type ProductReportKind = "glpm-league-run" | "wc-post-match";

export type ProductReportRow = {
  id: string;
  kind: ProductReportKind;
  title: string;
  season_id: number | null;
  competition_name: string | null;
  summary: string | null;
  storage_path_md: string | null;
  storage_path_pdf: string | null;
  created_at: string;
};

function reportsDb(client: SupabaseClient) {
  return client as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        order: (
          col: string,
          opts: { ascending: boolean }
        ) => {
          limit: (n: number) => Promise<{
            data: ProductReportRow[] | null;
            error: { message: string } | null;
          }>;
        };
      };
      insert: (row: Record<string, unknown>) => Promise<{
        data: ProductReportRow[] | null;
        error: { message: string } | null;
      }>;
      upsert: (
        row: Record<string, unknown>,
        opts?: { onConflict?: string }
      ) => Promise<{ error: { message: string } | null }>;
    };
    storage: {
      from: (bucket: string) => {
        upload: (
          path: string,
          body: Buffer | Blob | ArrayBuffer | string,
          opts?: { contentType?: string; upsert?: boolean }
        ) => Promise<{ error: { message: string } | null }>;
        createSignedUrl: (
          path: string,
          expiresIn: number
        ) => Promise<{
          data: { signedUrl: string } | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
}

export function getReportsServiceClient(): SupabaseClient | null {
  return tryCreateServiceClient();
}

/** CLI scripts may only have SUPABASE_URL + SERVICE_ROLE. */
export function createReportsServiceClientFromEnv(): SupabaseClient | null {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url.replace(/\/rest\/v1\/?$/, ""), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function listProductReports(
  client: SupabaseClient,
  limit = 50
): Promise<ProductReportRow[]> {
  const { data, error } = await reportsDb(client)
    .from("product_reports")
    .select(
      "id, kind, title, season_id, competition_name, summary, storage_path_md, storage_path_pdf, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 200)));
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createSignedReportUrl(
  client: SupabaseClient,
  path: string,
  expiresInSeconds = 300
): Promise<string | null> {
  const { data, error } = await reportsDb(client)
    .storage.from(PRODUCT_REPORTS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error) {
    console.warn("[product-reports] signed URL failed", error.message);
    return null;
  }
  return data?.signedUrl ?? null;
}

export async function uploadProductReportFiles(
  client: SupabaseClient,
  input: {
    kind: ProductReportKind;
    title: string;
    seasonId?: number | null;
    competitionName?: string | null;
    summary?: string | null;
    storagePathMd?: string | null;
    storagePathPdf?: string | null;
    mdBody?: Buffer | string | null;
    pdfBody?: Buffer | null;
    contentTypeMd?: string;
  }
): Promise<{ id: string | null; error: string | null }> {
  const db = reportsDb(client);
  if (input.storagePathMd && input.mdBody != null) {
    const { error } = await db.storage.from(PRODUCT_REPORTS_BUCKET).upload(
      input.storagePathMd,
      input.mdBody,
      { contentType: input.contentTypeMd ?? "text/markdown", upsert: true }
    );
    if (error) return { id: null, error: `md upload: ${error.message}` };
  }
  if (input.storagePathPdf && input.pdfBody != null) {
    const { error } = await db.storage.from(PRODUCT_REPORTS_BUCKET).upload(
      input.storagePathPdf,
      input.pdfBody,
      { contentType: "application/pdf", upsert: true }
    );
    if (error) return { id: null, error: `pdf upload: ${error.message}` };
  }

  const row = {
    kind: input.kind,
    title: input.title,
    season_id: input.seasonId ?? null,
    competition_name: input.competitionName ?? null,
    summary: input.summary ?? null,
    storage_path_md: input.storagePathMd ?? null,
    storage_path_pdf: input.storagePathPdf ?? null,
  };
  const { data, error } = await (
    client as unknown as {
      from: (t: string) => {
        insert: (r: Record<string, unknown>) => {
          select: (cols: string) => Promise<{
            data: Array<{ id: string }> | null;
            error: { message: string } | null;
          }>;
        };
      };
    }
  )
    .from("product_reports")
    .insert(row)
    .select("id");
  if (error) return { id: null, error: error.message };
  const id = data?.[0]?.id ?? null;
  return { id, error: null };
}
