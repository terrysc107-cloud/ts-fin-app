import "server-only";
import { createServerClient, CLIENT_ID } from "@/lib/supabase";

// Port of Founder OS scripts/finance_summary.py so the dashboard and the 06:05
// Money Brief agree to the dollar. If you change the rules here, change them there.

type Account = {
  account_id: string;
  account_name: string | null;
  mask: string | null;
  account_type: string | null;
  account_subtype: string | null;
  current_balance: number | string | null;
  limit_balance: number | string | null;
  last_updated: string | null;
};

type SpendRow = {
  public_transaction_id: string;
  date: string;
  merchant_name: string | null;
  amount: number | string;
  domain_tag: string | null;
  flags: { direction?: string } | null;
};

const num = (v: unknown) => Number(v ?? 0) || 0;

/** Account ids that mirror another account (same bank linked twice in Plaid). */
export function duplicateAccountIds(accounts: Account[]): Set<string> {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const a of [...accounts].sort((x, y) => x.account_id.localeCompare(y.account_id))) {
    const key = [a.account_name, a.mask, a.account_subtype, String(a.current_balance)].join("|");
    if (seen.has(key)) dupes.add(a.account_id);
    else seen.add(key);
  }
  return dupes;
}

export function summarizeAccounts(accounts: Account[]) {
  let cash = 0, invest = 0, cardBalance = 0, cardLimitedBalance = 0, cardLimit = 0;
  let locBalance = 0, locLimit = 0, loans = 0;
  const cards: { name: string; mask: string | null; balance: number; limit: number | null }[] = [];

  for (const a of accounts) {
    const type = (a.account_type ?? "").toLowerCase();
    const sub = (a.account_subtype ?? "").toLowerCase();
    const bal = num(a.current_balance);
    const limit = num(a.limit_balance);
    if (type === "depository" && (sub === "checking" || sub === "savings")) cash += bal;
    else if (type === "investment") invest += bal;
    else if (type === "credit") {
      cardBalance += bal;
      // Charge cards (Gold, Platinum) and no-limit cards don't count toward utilization.
      if (sub === "credit card" && limit > 0) {
        cardLimit += limit;
        cardLimitedBalance += bal;
      }
      cards.push({ name: a.account_name ?? "Card", mask: a.mask, balance: bal, limit: limit > 0 ? limit : null });
    } else if (type === "loan" && sub === "line of credit") {
      locBalance += bal;
      locLimit += limit;
    } else if (type === "loan") loans += bal;
  }

  return {
    cash,
    invest,
    cards: cards.sort((x, y) => y.balance - x.balance),
    cardBalance,
    cardUtilization: cardLimit > 0 ? (cardLimitedBalance / cardLimit) * 100 : null,
    cardLimitedBalance,
    cardLimit,
    locBalance,
    locLimit,
    locUtilization: locLimit > 0 ? (locBalance / locLimit) * 100 : null,
    loans,
  };
}

export function isSpend(r: SpendRow) {
  return (
    r.flags?.direction === "outflow" &&
    r.domain_tag !== "internal_transfer" &&
    r.domain_tag !== "debt_service" &&
    num(r.amount) > 0
  );
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const monthName = (d: Date) => d.toLocaleString("en-US", { month: "long", timeZone: "UTC" });

/** Today's date in Terry's timezone, as a UTC-midnight Date for plain date math. */
export function easternToday(now = new Date()): Date {
  const s = now.toLocaleDateString("en-CA", { timeZone: "America/New_York" }); // YYYY-MM-DD
  return new Date(`${s}T00:00:00Z`);
}

/** Yesterday's spend, and month-to-date through yesterday vs the same days last month. */
export function spendPace(rows: SpendRow[], today: Date) {
  const yesterday = addDays(today, -1);
  const monthStart = new Date(Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), 1));
  const priorStart = new Date(Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth() - 1, 1));
  const priorEnd = new Date(Math.min(addDays(priorStart, yesterday.getUTCDate() - 1).getTime(), addDays(monthStart, -1).getTime()));

  const spend = rows.filter(isSpend);
  const total = (lo: Date, hi: Date) =>
    spend.filter((r) => r.date >= iso(lo) && r.date <= iso(hi)).reduce((s, r) => s + num(r.amount), 0);
  const yRows = spend.filter((r) => r.date === iso(yesterday)).sort((a, b) => num(b.amount) - num(a.amount));

  return {
    yesterday: iso(yesterday),
    yesterdaySpend: total(yesterday, yesterday),
    yesterdayTop: yRows.slice(0, 3).map((r) => ({ merchant: r.merchant_name ?? "Unknown", amount: num(r.amount) })),
    monthLabel: monthName(monthStart),
    priorMonthLabel: monthName(priorStart),
    throughDay: yesterday.getUTCDate(),
    mtdSpend: total(monthStart, yesterday),
    priorSamePointSpend: total(priorStart, priorEnd),
  };
}

export type MoneyView = Awaited<ReturnType<typeof getMoneyView>>;

export async function getMoneyView(now = new Date()) {
  const sb = createServerClient();
  const today = easternToday(now);
  const yesterday = addDays(today, -1);
  const fetchFrom = iso(new Date(Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth() - 1, 1)));

  const [accountsRes, propsRes, manualRes, snapsRes, latestTxRes] = await Promise.all([
    sb.from("plaid_accounts").select("account_id,account_name,mask,account_type,account_subtype,current_balance,limit_balance,last_updated"),
    sb.from("properties").select("address,current_value,debt_balance,last_updated").eq("client_id", CLIENT_ID),
    sb.from("investment_accounts").select("account_name,current_balance,in_plaid").eq("client_id", CLIENT_ID),
    sb.from("net_worth_snapshots").select("snapshot_date,net_worth").eq("client_id", CLIENT_ID).order("snapshot_date"),
    sb.from("transactions").select("date").order("date", { ascending: false }).limit(1),
  ]);
  for (const r of [accountsRes, propsRes, manualRes, snapsRes, latestTxRes]) if (r.error) throw new Error(r.error.message);

  // Spend rows: page past PostgREST's 1000-row cap.
  const rows: SpendRow[] = [];
  for (;;) {
    const { data, error } = await sb
      .from("categorized_transactions")
      .select("public_transaction_id,date,merchant_name,amount,domain_tag,flags")
      .gte("date", fetchFrom)
      .order("date", { ascending: false })
      .order("id")
      .range(rows.length, rows.length + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data as SpendRow[]));
    if (data.length < 1000) break;
  }

  const all = accountsRes.data as Account[];
  const dupIds = duplicateAccountIds(all);
  const accounts = all.filter((a) => !dupIds.has(a.account_id));
  const s = summarizeAccounts(accounts);

  const properties = propsRes.data ?? [];
  const realEstateValue = properties.reduce((t, p) => t + num(p.current_value), 0);
  const mortgages = properties.reduce((t, p) => t + num(p.debt_balance), 0);
  const manualInvest = (manualRes.data ?? []).filter((m) => !m.in_plaid).reduce((t, m) => t + num(m.current_balance), 0);
  const investments = s.invest + manualInvest;

  const grossAssets = s.cash + investments + realEstateValue;
  const totalDebt = s.cardBalance + s.locBalance + s.loans + mortgages;
  const netWorth = grossAssets - totalDebt;

  const balancesAsOf = accounts.map((a) => a.last_updated).filter(Boolean).sort().pop() ?? null;
  const propertyValuesAsOf = properties.map((p) => p.last_updated).filter(Boolean).sort()[0] ?? null;

  return {
    asOf: iso(today),
    netWorth,
    grossAssets,
    totalDebt,
    cash: s.cash,
    investments,
    realEstateValue,
    mortgages,
    cards: s.cards,
    cardBalance: s.cardBalance,
    cardUtilization: s.cardUtilization,
    cardLimitedBalance: s.cardLimitedBalance,
    cardLimit: s.cardLimit,
    locBalance: s.locBalance,
    locLimit: s.locLimit,
    locUtilization: s.locUtilization,
    loans: s.loans,
    ...spendPace(rows, today),
    snapshots: (snapsRes.data ?? []).map((r) => ({ date: r.snapshot_date as string, netWorth: num(r.net_worth) })),
    freshness: {
      balancesAsOf,
      transactionsThrough: (latestTxRes.data?.[0]?.date as string) ?? null,
      propertyValuesAsOf,
    },
    duplicateAccountsHidden: dupIds.size,
  };
}
