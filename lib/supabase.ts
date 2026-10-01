import { createClient } from "@supabase/supabase-js";
import type { DbQuery, Op } from "@/lib/db-proxy";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type Result = { data: any; error: { message: string } | null }; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Browser "client": a read-only query builder that records the chain
 * (.from().select().eq()...) and replays it server-side via /api/db.
 * The finance tables are service-role only, so the browser never queries Supabase.
 * `.schema()` is accepted and ignored: everything now lives in `public`.
 */
function browserQuery(table: string) {
  const ops: Op[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === "then") {
          return (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) =>
            fetch("/api/db", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ table, ops } satisfies DbQuery),
            })
              .then((r) => r.json() as Promise<Result>)
              .then(resolve, reject);
        }
        return (...args: unknown[]) => {
          ops.push({ op: prop, args });
          return builder;
        };
      },
    }
  );
  return builder;
}

const browserClient = {
  from: browserQuery,
  schema: () => ({ from: browserQuery }),
};

export function createBrowserClient() {
  return browserClient;
}

/**
 * Server-side Supabase client using the service role key.
 * NEVER expose this to the client — use only in API routes and server components.
 */
export function createServerClient() {
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export const CLIENT_ID = "a1000000-0000-0000-0000-000000000001";
