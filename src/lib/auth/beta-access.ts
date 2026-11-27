import type { SupabaseClient } from "@supabase/supabase-js";
import { tryCreateServiceClient } from "@/lib/supabase";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

export type BetaAccessStatus = "pending" | "accepted" | "rejected";

export type BetaAccessRow = {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  status: BetaAccessStatus;
};

type QueryResult = PromiseLike<{
  data: BetaAccessRow | null;
  error: { message: string; code?: string } | null;
}>;

type UntypedTable = {
  insert: (values: Record<string, unknown>) => PromiseLike<{
    error: { message: string; code?: string } | null;
  }>;
  select: (columns: string) => {
    ilike: (column: string, value: string) => {
      maybeSingle: () => QueryResult;
    };
  };
};

function betaTable(client: SupabaseClient): UntypedTable {
  return (client as unknown as { from: (table: string) => UntypedTable }).from("beta_access");
}

export type CreateBetaAccessInput = {
  email: string;
  username: string;
  password: string;
  fullName?: string | null;
  phone?: string | null;
  country?: string | null;
  plan?: string | null;
  billing?: string | null;
  source?: string;
  marketingOptIn?: boolean;
  ageConfirmed?: boolean | null;
  acceptTerms?: boolean | null;
  acceptPrivacy?: boolean | null;
  acceptDisclaimer?: boolean | null;
};

export async function createBetaAccess(
  input: CreateBetaAccessInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const client = tryCreateServiceClient();
  if (!client) {
    return { ok: false, error: "Database is not configured." };
  }

  const row = {
    email: input.email.trim().toLowerCase(),
    username: input.username.trim(),
    full_name: input.fullName?.trim() || null,
    phone: input.phone?.trim() || null,
    country: input.country?.trim() || null,
    plan: input.plan ?? null,
    billing: input.billing ?? null,
    password_hash: hashPassword(input.password),
    status: "pending",
    marketing_opt_in: Boolean(input.marketingOptIn),
    age_confirmed: input.ageConfirmed ?? null,
    accept_terms: input.acceptTerms ?? null,
    accept_privacy: input.acceptPrivacy ?? null,
    accept_disclaimer: input.acceptDisclaimer ?? null,
    source: (input.source ?? "signup").slice(0, 40),
  };

  const { error } = await betaTable(client).insert(row);
  if (error) {
    if (error.code === "23505" || /duplicate|unique/i.test(error.message)) {
      return { ok: false, error: "An account with that email or username already exists." };
    }
    console.error("[beta_access] insert failed", error.message);
    return { ok: false, error: "Unable to create beta request. Please try again." };
  }
  return { ok: true };
}

export type BetaLoginResult =
  | { ok: true; username: string }
  | { ok: false; code: "invalid" | "pending" | "rejected" | "unavailable" };

export async function verifyBetaCredentials(
  usernameOrEmail: string,
  password: string
): Promise<BetaLoginResult> {
  const client = tryCreateServiceClient();
  if (!client) {
    return { ok: false, code: "unavailable" };
  }

  const key = usernameOrEmail.trim();
  if (!key || !password) {
    return { ok: false, code: "invalid" };
  }

  const column = key.includes("@") ? "email" : "username";
  const { data, error } = await betaTable(client)
    .select("id,email,username,password_hash,status")
    .ilike(column, key)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, code: "invalid" };
  }

  if (!verifyPassword(password, data.password_hash)) {
    return { ok: false, code: "invalid" };
  }

  if (data.status === "pending") {
    return { ok: false, code: "pending" };
  }
  if (data.status === "rejected") {
    return { ok: false, code: "rejected" };
  }
  if (data.status !== "accepted") {
    return { ok: false, code: "invalid" };
  }

  return { ok: true, username: data.username };
}
