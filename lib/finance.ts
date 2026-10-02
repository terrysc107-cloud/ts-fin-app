import "server-only";
import { createServerClient } from "@/lib/supabase";
import { computeMoneyView, duplicateAccountIds, easternToday } from "@/lib/money";
import { BUSINESS_MASKS, DEFAULT_BUDGET, computeBudget, iso, type BudgetLineRow, type Txn } from "@/lib/budget";

export type { MoneyView } from "@/lib/money";

export const getMoneyView = (now = new Date()) => computeMoneyView(createServerClient(), now);

export type BudgetView = Awaited<ReturnType<typeof getBudgetView>>;

/** Business masks from public.account_entities, falling back to the hardcoded mirror. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function businessMasks(sb: ReturnType<typeof createServerClient>) {
  const { data } = await sb.from("account_entities").select("mask");
  return data && data.length > 0 ? new Set<string>(data.map((r) => r.mask)) : BUSINESS_MASKS;
}

/** Budget lines from public.budget_lines, falling back to the seed. */
export async function budgetRows(sb: ReturnType<typeof createServerClient>): Promise<BudgetLineRow[]> {
  const { data } = await sb.from("budget_lines").select("key,label,monthly,lumpy,watch,sort,prefixes,merchant_regex").order("sort");
  return data && data.length > 0 ? data : DEFAULT_BUDGET;
}

/** This month's personal spending against the budget lines, honoring Terry's tags. */
export async function getBudgetView(now = new Date()) {
  const sb = createServerClient();
  const today = easternToday(now);
  const monthStart = iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)));
  const [accRes, txRes, masks, rows] = await Promise.all([
    sb.from("plaid_accounts").select("account_id,account_name,mask,account_type,account_subtype,current_balance,limit_balance,last_updated"),
    sb
      .from("transactions_tagged")
      .select("account_id,date,merchant_name,name,amount,pending,category_primary,category_detailed,entity,budget_key")
      .gte("date", monthStart)
      .limit(5000),
    businessMasks(sb),
    budgetRows(sb),
  ]);
  if (accRes.error) throw new Error(accRes.error.message);
  // Until the tagging migration is applied, the view doesn't exist: read raw transactions instead.
  const tx = txRes.error
    ? await sb.from("transactions").select("account_id,date,merchant_name,name,amount,pending,category_primary,category_detailed").gte("date", monthStart).limit(5000)
    : txRes;
  if (tx.error) throw new Error(tx.error.message);

  const dup = duplicateAccountIds(accRes.data);
  const personal = new Set<string>(accRes.data.filter((a) => !dup.has(a.account_id) && !masks.has(a.mask ?? "")).map((a) => a.account_id));
  const txns = (tx.data as Txn[]).filter((t) => !dup.has(t.account_id));
  return { ...computeBudget(txns, personal, today, rows), through: txns.map((t) => t.date).sort().pop() ?? null };
}
