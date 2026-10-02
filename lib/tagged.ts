import "server-only";
import { createServerClient, CLIENT_ID } from "@/lib/supabase";
import { duplicateAccountIds } from "@/lib/money";
import { isStalePending } from "@/lib/budget";
import { budgetRows } from "@/lib/finance";

/** A row of public.transactions_tagged. */
export type Tagged = {
  id: string;
  account_id: string;
  date: string;
  pending: boolean;
  name: string | null;
  merchant_name: string | null;
  amount: number | string;
  category_primary: string | null;
  category_detailed: string | null;
  account_name: string | null;
  mask: string | null;
  account_entity: string;
  entity: string;
  domain_tag: string;
  budget_key: string | null;
  property_id: string | null;
  note: string | null;
  flags: { direction?: string; needs_review?: boolean } | null;
  overridden: boolean;
};

export const TAGGED_COLS =
  "id,account_id,date,pending,name,merchant_name,amount,category_primary,category_detailed,account_name,mask,account_entity,entity,domain_tag,budget_key,property_id,note,flags,overridden";

/** Tagged transactions in [from, to], newest first, with mirrored accounts and stale pending rows dropped. */
export async function fetchTagged(from: string, to: string, today: Date) {
  const sb = createServerClient();
  const accRes = await sb.from("plaid_accounts").select("account_id,account_name,mask,account_type,account_subtype,current_balance,limit_balance,last_updated");
  if (accRes.error) throw new Error(accRes.error.message);
  const dup = duplicateAccountIds(accRes.data);

  const rows: Tagged[] = [];
  for (;;) {
    const { data, error } = await sb
      .from("transactions_tagged")
      .select(TAGGED_COLS)
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: false })
      .order("id")
      .range(rows.length, rows.length + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data as Tagged[]));
    if (data.length < 1000) break;
  }
  return rows.filter((t) => !dup.has(t.account_id) && !isStalePending(t, today));
}

/** Everything the tag sheet needs to offer as choices. */
export async function tagChoices() {
  const sb = createServerClient();
  const [props, rows] = await Promise.all([
    sb.from("properties").select("id,address").eq("client_id", CLIENT_ID).order("address"),
    budgetRows(sb),
  ]);
  if (props.error) throw new Error(props.error.message);
  return {
    properties: props.data as { id: string; address: string }[],
    budgetLines: rows.map((r) => ({ key: r.key, label: r.label })),
  };
}

export async function fetchRules() {
  const sb = createServerClient();
  const [rules, counts] = await Promise.all([
    sb.from("tag_rules").select("id,pattern,entity,domain_tag,budget_key,property_id,created_at").order("created_at"),
    sb.from("transaction_overrides").select("source").like("source", "rule:%").limit(10000),
  ]);
  if (rules.error) throw new Error(rules.error.message);
  const n = new Map<string, number>();
  for (const r of counts.data ?? []) n.set(r.source, (n.get(r.source) ?? 0) + 1);
  return rules.data.map((r) => ({ ...r, matches: n.get(`rule:${r.id}`) ?? 0 }));
}

export const monthRange = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` };
};
export const shiftMonth = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
export const monthLabel = (ym: string) => new Date(`${ym}-01T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
