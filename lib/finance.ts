import "server-only";
import { createServerClient } from "@/lib/supabase";
import { computeMoneyView, duplicateAccountIds, easternToday } from "@/lib/money";
import { BUSINESS_MASKS, computeBudget, iso, type Txn } from "@/lib/budget";

export type { MoneyView } from "@/lib/money";

export const getMoneyView = (now = new Date()) => computeMoneyView(createServerClient(), now);

export type BudgetView = Awaited<ReturnType<typeof getBudgetView>>;

/** This month's personal spending against the budget in lib/budget.ts. */
export async function getBudgetView(now = new Date()) {
  const sb = createServerClient();
  const today = easternToday(now);
  const monthStart = iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)));
  const [accRes, txRes] = await Promise.all([
    sb.from("plaid_accounts").select("account_id,account_name,mask,account_type,account_subtype,current_balance,limit_balance,last_updated"),
    sb
      .from("transactions")
      .select("account_id,date,merchant_name,name,amount,pending,category_primary,category_detailed")
      .gte("date", monthStart)
      .limit(5000),
  ]);
  if (accRes.error) throw new Error(accRes.error.message);
  if (txRes.error) throw new Error(txRes.error.message);

  const dup = duplicateAccountIds(accRes.data);
  const personal = new Set<string>(
    accRes.data.filter((a) => !dup.has(a.account_id) && !BUSINESS_MASKS.has(a.mask ?? "")).map((a) => a.account_id),
  );
  const txns = txRes.data as Txn[];
  return { ...computeBudget(txns, personal, today), through: txns.map((t) => t.date).sort().pop() ?? null };
}
