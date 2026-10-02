// Pure logic, no imports: scripts/check-reports.mjs runs this file directly with Node.

export type ReportRow = {
  date: string;
  merchant_name: string | null;
  name: string | null;
  amount: number | string;
  category_primary: string | null;
  domain_tag: string;
  entity: string;
  budget_key: string | null;
  flags: { direction?: string } | null;
};

const num = (v: unknown) => Number(v ?? 0) || 0;

/** Same rule as lib/money.ts isSpend, on a transactions_tagged row. Pending rows have no flags: treat + as outflow. */
export function isSpendRow(r: ReportRow) {
  const dir = r.flags?.direction ?? (num(r.amount) > 0 ? "outflow" : "inflow");
  return dir === "outflow" && r.domain_tag !== "internal_transfer" && r.domain_tag !== "debt_service" && num(r.amount) > 0;
}

/** Terry's budget line if he set one, else Plaid's primary category, prettified. */
export function categoryOf(r: ReportRow) {
  return r.budget_key ?? pretty(r.category_primary ?? "OTHER");
}

export const pretty = (s: string) => s.toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

const sumBy = <T>(rows: ReportRow[], key: (r: ReportRow) => T) => {
  const m = new Map<T, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + num(r.amount));
  return Array.from(m, ([k, total]) => ({ key: k, total })).sort((a, b) => b.total - a.total);
};

export const byCategory = (rows: ReportRow[]) => sumBy(rows.filter(isSpendRow), categoryOf);
export const byEntity = (rows: ReportRow[]) => sumBy(rows.filter(isSpendRow), (r) => r.entity);
export const byMerchant = (rows: ReportRow[]) => sumBy(rows.filter(isSpendRow), (r) => r.merchant_name ?? r.name ?? "Unknown");

/** Spend per month, oldest first, over the last `months` months ending at `ym` (YYYY-MM). */
export function trend(rows: ReportRow[], ym: string, months: number) {
  const [y, m] = ym.split("-").map(Number);
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    out.push({ key, total: rows.filter((r) => isSpendRow(r) && r.date.startsWith(key)).reduce((s, r) => s + num(r.amount), 0) });
  }
  return out;
}

/** This month through `day` vs the prior month through the same day. */
export function samePoint(rows: ReportRow[], ym: string, day: number) {
  const [y, m] = ym.split("-").map(Number);
  const prior = new Date(Date.UTC(y, m - 2, 1));
  const pym = `${prior.getUTCFullYear()}-${String(prior.getUTCMonth() + 1).padStart(2, "0")}`;
  const through = (k: string) => rows.filter((r) => isSpendRow(r) && r.date.startsWith(k) && Number(r.date.slice(8)) <= day).reduce((s, r) => s + num(r.amount), 0);
  return { current: through(ym), prior: through(pym), priorKey: pym };
}
