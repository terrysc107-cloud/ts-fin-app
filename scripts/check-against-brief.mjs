// Checks that the dashboard home shows the same numbers as the Founder OS Money Brief.
// Usage: node scripts/check-against-brief.mjs [baseUrl]   (default http://localhost:3000)
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";

const base = process.argv[2] ?? "http://localhost:3000";
const fos = `${homedir()}/code/founder-os`;
const { summary: s } = JSON.parse(
  execFileSync(`${fos}/.venv/bin/python`, [`${fos}/scripts/finance_summary.py`, "--json"], { encoding: "utf8" })
);
const text = (await (await fetch(base)).text()).replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");

const usd = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const expected = {
  cash: usd(s.cash_total),
  cards: usd(s.credit_card.balance),
  "limit cards": `${usd(s.credit_card.limited_balance)} of ${usd(s.credit_card.limit)}`,
  "lines of credit": `${usd(s.line_of_credit.balance)} of ${usd(s.line_of_credit.limit)}`,
  yesterday: usd(s.yesterday_spend),
  "month to date": usd(s.mtd_spend),
  "prior month same point": usd(s.prior_same_point_spend),
};

let failed = 0;
for (const [label, value] of Object.entries(expected)) {
  const ok = text.includes(value);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${value}`);
}
process.exit(failed ? 1 : 0);
