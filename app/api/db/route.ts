import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { ALLOWED_OPS, READABLE_TABLES, type DbQuery } from "@/lib/db-proxy";

export const dynamic = "force-dynamic";

const PAGE = 1000; // PostgREST row cap

export async function POST(req: NextRequest) {
  const { table, ops } = (await req.json()) as DbQuery;
  if (!READABLE_TABLES.has(table) || !Array.isArray(ops) || ops.some((o) => !ALLOWED_OPS.has(o.op))) {
    return NextResponse.json({ data: null, error: { message: "query not allowed" } }, { status: 400 });
  }

  const supabase = createServerClient();
  const build = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabase.from(table);
    if (!ops.some((o) => o.op === "select")) q = q.select("*");
    for (const { op, args } of ops) q = q[op](...args);
    return q;
  };

  // A query with its own limit/range/single gets exactly what it asked for;
  // anything else pages past the 1000-row cap so month totals aren't truncated.
  if (ops.some((o) => ["limit", "range", "single", "maybeSingle"].includes(o.op))) {
    const { data, error } = await build();
    return NextResponse.json({ data, error });
  }
  const rows: unknown[] = [];
  for (;;) {
    // id tiebreaker keeps pages stable when the caller's order has ties (every allowed table has id).
    const { data, error } = await build().order("id").range(rows.length, rows.length + PAGE - 1);
    if (error) return NextResponse.json({ data: null, error });
    rows.push(...data);
    if (data.length < PAGE) return NextResponse.json({ data: rows, error: null });
  }
}
