// Pure logic, no imports: scripts/check-budget.mjs runs this file directly with Node.

export const iso = (d: Date) => d.toISOString().slice(0, 10);

// ponytail: founder-os plaid_sync ignores Plaid's "removed", so old pending rows never clear.
// Only trust pending rows from the last week until the sync handles removals (phase 5C).
export function isStalePending(t: { pending: boolean; date: string }, today: Date) {
  return t.pending && t.date < iso(new Date(today.getTime() - 7 * 86_400_000));
}

/** A budget_lines row. DEFAULT_BUDGET is the seed and the fallback when the table is empty. */
export type BudgetLineRow = {
  key: string;
  label: string;
  monthly: number | string;
  /** Lumpy bills: judged only against the full month, not against day-of-month pace. */
  lumpy?: boolean | null;
  /** $0 lines that should stay empty: anything here is a red flag. */
  watch?: string | null;
  sort: number;
  /** Plaid category_detailed prefixes. Empty = catch-all. */
  prefixes: string[];
  merchant_regex?: string | null;
};

// Amounts set 2026-10-02 from Jan–Sep 2026 Plaid history (avg in the comment). Edit in the app (/budget);
// this list only seeds the table.
export const DEFAULT_BUDGET: BudgetLineRow[] = [
  { key: "coffee", label: "Coffee", monthly: 150, sort: 10, prefixes: ["FOOD_AND_DRINK_COFFEE"] }, // avg $291
  { key: "groceries", label: "Groceries", monthly: 450, sort: 20, prefixes: ["FOOD_AND_DRINK_GROCERIES"], merchant_regex: "instacart" }, // avg $374
  { key: "dining", label: "Eating out & delivery", monthly: 800, sort: 30, prefixes: ["FOOD_AND_DRINK_"] }, // avg $1,277
  { key: "rides", label: "Uber & Lyft", monthly: 350, sort: 40, prefixes: ["TRANSPORTATION_TAXIS"] }, // avg $639
  { key: "gas", label: "Gas, tolls & parking", monthly: 450, sort: 50, prefixes: ["TRANSPORTATION_"] }, // avg $630
  { key: "clothes", label: "Clothes", monthly: 200, sort: 60, prefixes: ["GENERAL_MERCHANDISE_CLOTHING"] }, // avg $688
  { key: "shopping", label: "Shopping (Amazon, Walmart, Target)", monthly: 1000, sort: 70, prefixes: ["GENERAL_MERCHANDISE_"] }, // avg $2,265
  { key: "fun", label: "Fun & entertainment", monthly: 300, sort: 80, prefixes: ["ENTERTAINMENT_"] }, // avg $464
  { key: "bills", label: "Bills (utilities, phone, insurance, gym)", monthly: 1150, lumpy: true, sort: 90, prefixes: ["RENT_AND_UTILITIES_", "GENERAL_SERVICES_INSURANCE", "PERSONAL_CARE_GYMS"] }, // avg $1,150
  { key: "care", label: "Health & personal care", monthly: 175, sort: 100, prefixes: ["PERSONAL_CARE_", "MEDICAL_"] }, // avg $166
  { key: "travel", label: "Travel", monthly: 300, lumpy: true, sort: 110, prefixes: ["TRAVEL_"] }, // avg $576
  { key: "car", label: "Car upkeep", monthly: 250, lumpy: true, sort: 120, prefixes: ["GENERAL_SERVICES_AUTOMOTIVE"] }, // avg $525
  { key: "interest", label: "Interest & card fees", monthly: 0, watch: "Interest means a card carried a balance.", sort: 130, prefixes: ["BANK_FEES_"] }, // avg $563
  { key: "rental", label: "Rental costs on personal cards", monthly: 0, watch: "Put renovation buys on the LTS Chase card.", sort: 140, prefixes: ["HOME_IMPROVEMENT_"] }, // avg $2,307
  { key: "other", label: "Everything else", monthly: 250, sort: 999, prefixes: [] },
];

type Line = BudgetLineRow & { monthly: number; match: (detailed: string, merchant: string) => boolean };

/** Rows → matchers, sorted. First match wins, so specific lines come before broad ones. */
export function compileLines(rows: BudgetLineRow[]): Line[] {
  return [...rows]
    .sort((a, b) => a.sort - b.sort)
    .map((r) => {
      const re = r.merchant_regex ? new RegExp(r.merchant_regex, "i") : null;
      const prefixes = r.prefixes ?? [];
      return {
        ...r,
        monthly: Number(r.monthly) || 0,
        match: (d, m) => (prefixes.length === 0 ? true : prefixes.some((p) => d.startsWith(p))) || (re ? re.test(m) : false),
      };
    });
}

// Not budgeted: money moving between accounts, card payments, income, rent (usually paid by
// transfer, so Plaid can't see it reliably) and tax payments.
const SKIP_PRIMARY = new Set(["TRANSFER_IN", "TRANSFER_OUT", "LOAN_PAYMENTS", "LOAN_DISBURSEMENTS", "INCOME"]);
const SKIP_DETAILED = new Set(["RENT_AND_UTILITIES_RENT", "GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT"]);

// Fallback when public.account_entities is empty (mirror of founder-os config.yaml finance.account_entities).
export const BUSINESS_MASKS = new Set(["1000", "0955", "1110", "6450", "2196"]);

export const FIXED_RENT = 2623;

export type Txn = {
  account_id: string;
  date: string;
  merchant_name: string | null;
  name: string | null;
  amount: number | string;
  pending: boolean;
  category_primary: string | null;
  category_detailed: string | null;
  /** From transactions_tagged. A business entity drops the row from the personal budget. */
  entity?: string | null;
  /** From transactions_tagged. Wins over the category match. */
  budget_key?: string | null;
};

export type BudgetLine = {
  key: string;
  label: string;
  budget: number;
  spent: number;
  left: number;
  perDayLeft: number | null;
  status: "ok" | "ahead" | "over";
  watch?: string;
  top: { merchant: string; amount: number }[];
};

/** Bucket this month's personal transactions into budget lines. Pure, so it can be tested. */
export function computeBudget(txns: Txn[], personalAccountIds: Set<string>, today: Date, rows: BudgetLineRow[] = DEFAULT_BUDGET) {
  const lines0 = compileLines(rows);
  const monthStart = iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)));
  const daysInMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)).getUTCDate();
  const day = today.getUTCDate();
  const daysLeft = daysInMonth - day + 1; // today counts

  const buckets = new Map(lines0.map((l) => [l.key, { spent: 0, items: new Map<string, number>() }]));
  for (const t of txns) {
    if (t.date < monthStart) continue;
    // Entity override wins over the account's default; without one, the account decides.
    if (t.entity ? t.entity !== "personal" : !personalAccountIds.has(t.account_id)) continue;
    if (isStalePending(t, today)) continue;
    if (SKIP_PRIMARY.has(t.category_primary ?? "") || SKIP_DETAILED.has(t.category_detailed ?? "")) continue;
    const merchant = t.merchant_name ?? t.name ?? "Unknown";
    const line = (t.budget_key && lines0.find((l) => l.key === t.budget_key)) || lines0.find((l) => l.match(t.category_detailed ?? "", merchant));
    if (!line) continue;
    const b = buckets.get(line.key)!;
    const amt = Number(t.amount) || 0;
    b.spent += amt;
    b.items.set(merchant, (b.items.get(merchant) ?? 0) + amt);
  }

  const lines: BudgetLine[] = lines0.map((l) => {
    const b = buckets.get(l.key)!;
    const spent = Math.max(0, b.spent);
    const left = l.monthly - spent;
    const pace = l.monthly * (day / daysInMonth);
    const status = spent > l.monthly + 0.5 ? "over" : !l.lumpy && spent > pace * 1.1 + 5 ? "ahead" : "ok";
    return {
      key: l.key,
      label: l.label,
      budget: l.monthly,
      spent,
      left,
      perDayLeft: l.lumpy || l.watch || left <= 0 ? null : left / daysLeft,
      status,
      watch: l.watch ?? undefined,
      top: Array.from(b.items).map(([merchant, amount]) => ({ merchant, amount })).filter((x) => x.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 3),
    };
  });

  const budgeted = lines.filter((l) => !l.watch);
  const totalBudget = budgeted.reduce((s, l) => s + l.budget, 0);
  const totalSpent = lines.reduce((s, l) => s + l.spent, 0);
  return {
    lines,
    totalBudget,
    totalSpent,
    day,
    daysInMonth,
    daysLeft,
    monthPace: totalBudget * (day / daysInMonth),
  };
}
