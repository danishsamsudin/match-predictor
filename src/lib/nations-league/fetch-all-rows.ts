import type { SupabaseClient } from "@supabase/supabase-js";

const PAGE = 1000;

/** Paginate a Supabase select so we do not silently stop at the default 1000-row cap. */
export async function fetchAllRows<T extends Record<string, unknown>>(input: {
  supabase: SupabaseClient;
  table: string;
  select: string;
  filter?: (query: any) => any;
}): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = input.supabase
      .from(input.table)
      .select(input.select)
      .range(from, from + PAGE - 1);
    if (input.filter) query = input.filter(query);
    const { data, error } = await query;
    if (error) throw new Error(`${input.table}: ${error.message}`);
    const batch = (data ?? []) as unknown as T[];
    out.push(...batch);
    if (batch.length < PAGE) break;
  }
  return out;
}
