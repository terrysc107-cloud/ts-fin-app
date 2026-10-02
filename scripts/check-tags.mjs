// Self-check for lib/tags.ts rule matching. Run: node scripts/check-tags.mjs
import assert from "node:assert/strict";
import { applyRules, matchRule } from "../lib/tags.ts";

const rules = [
  { id: "r1", pattern: "lowe's", entity: "lts", domain_tag: "property_ops", budget_key: null, property_id: "prop-1" },
  { id: "r2", pattern: "uber", entity: null, domain_tag: null, budget_key: "rides", property_id: null },
];
const txns = [
  { id: "a", merchant_name: "Lowe's", name: "LOWES #1234" },
  { id: "b", merchant_name: null, name: "UBER *TRIP" },
  { id: "c", merchant_name: "Uber Eats", name: "UBER EATS" }, // matches r2 (substring), fine: budget_key only
  { id: "d", merchant_name: "Acme Markets", name: "ACME" },
];

assert.equal(matchRule({ pattern: "LOWE" }, txns[0]), true);
assert.equal(matchRule({ pattern: "  " }, txns[0]), false); // blank pattern never matches
const out = applyRules(rules, txns);
assert.deepEqual(
  out.map((o) => o.public_transaction_id),
  ["a", "b", "c"],
);
assert.equal(out[0].source, "rule:r1");
assert.equal(out[0].entity, "lts");
assert.equal(out[0].property_id, "prop-1");
assert.equal(out[1].budget_key, "rides");
assert.equal(out[1].entity, null);
console.log("check-tags: ok");
