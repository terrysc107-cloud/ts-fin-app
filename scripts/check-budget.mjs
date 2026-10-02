// Self-check for lib/budget.ts bucketing. Run: node scripts/check-budget.mjs
import assert from "node:assert/strict";
import { computeBudget } from "../lib/budget.ts";

const today = new Date("2026-10-10T00:00:00Z"); // day 10 of 31
const t = (o) => ({ account_id: "p", date: "2026-10-05", merchant_name: "X", name: null, pending: false, category_primary: "FOOD_AND_DRINK", ...o });
const b = computeBudget(
  [
    t({ amount: 30, category_detailed: "FOOD_AND_DRINK_COFFEE", merchant_name: "Starbucks" }),
    t({ amount: 100, category_detailed: "FOOD_AND_DRINK_RESTAURANT", merchant_name: "Uber Eats" }),
    t({ amount: 80, category_detailed: "FOOD_AND_DRINK_OTHER_FOOD_AND_DRINK", merchant_name: "Instacart" }), // Instacart is groceries
    t({ amount: 500, category_detailed: "FOOD_AND_DRINK_RESTAURANT", account_id: "biz" }), // business account: ignored
    t({ amount: 2623, category_primary: "RENT_AND_UTILITIES", category_detailed: "RENT_AND_UTILITIES_RENT" }), // rent: not budgeted
    t({ amount: 900, category_primary: "TRANSFER_OUT", category_detailed: "TRANSFER_OUT_ACCOUNT_TRANSFER" }), // transfer: ignored
    t({ amount: 40, category_detailed: "FOOD_AND_DRINK_RESTAURANT", pending: true, date: "2026-10-01" }), // stale pending: ignored
    t({ amount: 25, category_detailed: "FOOD_AND_DRINK_RESTAURANT", pending: true, date: "2026-10-09" }), // fresh pending: counted
    t({ amount: 300, category_primary: "HOME_IMPROVEMENT", category_detailed: "HOME_IMPROVEMENT_HARDWARE", merchant_name: "Lowe's" }),
    t({ amount: 50, category_primary: "OTHER", category_detailed: "OTHER_OTHER" }),
    t({ amount: 20, date: "2026-09-30", category_detailed: "FOOD_AND_DRINK_COFFEE" }), // last month: ignored
  ],
  new Set(["p"]),
  today,
);
const line = (k) => b.lines.find((l) => l.key === k);

assert.equal(line("coffee").spent, 30);
assert.equal(line("groceries").spent, 80);
assert.equal(line("dining").spent, 125);
assert.equal(line("rental").status, "over"); // $0 watch line with spend
assert.equal(line("other").spent, 50);
assert.equal(line("bills").spent, 0);
assert.equal(b.daysLeft, 22);
assert.equal(line("dining").perDayLeft, (800 - 125) / 22);
assert.equal(line("coffee").status, "ok"); // $30 vs pace ~$48
assert.equal(b.totalSpent, 30 + 80 + 125 + 300 + 50);
console.log("check-budget: ok");
