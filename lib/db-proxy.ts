// Shared by the browser shim (lib/supabase.ts) and the server replay (app/api/db/route.ts).
// Finance tables have RLS with no policies, so the browser can't read them directly;
// it sends the query here and the server replays it with the service role.

export const READABLE_TABLES = new Set([
  "plaid_accounts",
  "transactions",
  "categorized_transactions",
  "net_worth_snapshots",
  "properties",
  "goals",
  "investment_accounts",
  "income_streams",
  "ai_insights",
  "context_store",
]);

// Read-only builder methods only. No insert/update/delete/rpc.
export const ALLOWED_OPS = new Set([
  "select", "eq", "neq", "gt", "gte", "lt", "lte", "in", "is", "not", "ilike",
  "order", "limit", "range", "single", "maybeSingle",
]);

export type Op = { op: string; args: unknown[] };
export type DbQuery = { table: string; ops: Op[] };
