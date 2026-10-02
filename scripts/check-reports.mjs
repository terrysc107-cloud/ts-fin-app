// Self-check for lib/reports.ts. Run: node scripts/check-reports.mjs
import assert from "node:assert/strict";
import { byCategory, byEntity, byMerchant, samePoint, trend } from "../lib/reports.ts";

const r = (o) => ({ date: "2026-10-05", merchant_name: "X", name: null, category_primary: "FOOD_AND_DRINK", domain_tag: "personal_lifestyle", entity: "personal", budget_key: null, flags: { direction: "outflow" }, ...o });
const rows = [
  r({ amount: 100 }),
  r({ amount: 50, budget_key: "dining" }), // budget line wins over Plaid category
  r({ amount: 900, domain_tag: "debt_service" }), // card payment: not spend
  r({ amount: -2000, flags: { direction: "inflow" } }), // income: not spend
  r({ amount: 300, entity: "lts", merchant_name: "Lowe's", category_primary: "HOME_IMPROVEMENT", domain_tag: "property_ops" }),
  r({ amount: 20, date: "2026-09-03" }),
  r({ amount: 40, date: "2026-09-20" }),
  r({ amount: 7, flags: null, pending: true }), // pending row has no flags: positive = outflow
];

assert.deepEqual(byCategory(rows), [{ key: "Home improvement", total: 300 }, { key: "Food and drink", total: 167 }, { key: "dining", total: 50 }]);
assert.deepEqual(byEntity(rows), [{ key: "lts", total: 300 }, { key: "personal", total: 217 }]);
assert.equal(byMerchant(rows)[0].key, "Lowe's");
assert.deepEqual(trend(rows, "2026-10", 3).map((t) => t.total), [0, 60, 457]); // 100 + 50 + 300 + 7
assert.deepEqual(samePoint(rows, "2026-10", 10), { current: 457, prior: 20, priorKey: "2026-09" });
console.log("check-reports: ok");
