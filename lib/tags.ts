// Pure logic, no imports: scripts/check-tags.mjs and scripts/hq-push.mjs import this file directly with Node.

export const ENTITIES = ["personal", "ats", "lts", "sag"] as const;
export type Entity = (typeof ENTITIES)[number];

export const ENTITY_LABEL: Record<Entity, string> = {
  personal: "Personal",
  ats: "ATS",
  lts: "LTS Properties",
  sag: "Scott Advisory",
};

// Same list founder-os scripts/finance_rules.py produces.
export const DOMAIN_TAGS = [
  "personal_lifestyle",
  "property_ops",
  "business_ops",
  "income",
  "internal_transfer",
  "debt_service",
  "medical_family",
  "tax_legal",
  "credit_risk",
  "uncategorized",
] as const;
export type DomainTag = (typeof DOMAIN_TAGS)[number];

export const DOMAIN_LABEL: Record<DomainTag, string> = {
  personal_lifestyle: "Lifestyle",
  property_ops: "Property / rental",
  business_ops: "Business",
  income: "Income",
  internal_transfer: "Transfer between accounts",
  debt_service: "Card or loan payment",
  medical_family: "Medical & family",
  tax_legal: "Tax & legal",
  credit_risk: "Interest & fees",
  uncategorized: "Uncategorized",
};

export const ENTITY_TONE: Record<string, { fg: string; bg: string }> = {
  personal: { fg: "var(--m-accent)", bg: "var(--m-accent-soft)" },
  ats: { fg: "#1d4ed8", bg: "#e0ebff" },
  lts: { fg: "#7c3aed", bg: "#ede7fe" },
  sag: { fg: "var(--m-warn)", bg: "var(--m-warn-soft)" },
};

export const isEntity =(v: unknown): v is Entity => ENTITIES.includes(v as Entity);
export const isDomainTag = (v: unknown): v is DomainTag => DOMAIN_TAGS.includes(v as DomainTag);

export type TagRule = {
  id: string;
  pattern: string;
  entity: Entity | null;
  domain_tag: string | null;
  budget_key: string | null;
  property_id: string | null;
};

export type Taggable = { id: string; merchant_name: string | null; name: string | null };

/** Case-insensitive substring match on merchant_name, then name. */
export function matchRule(rule: { pattern: string }, t: { merchant_name: string | null; name: string | null }) {
  const p = rule.pattern.trim().toLowerCase();
  if (!p) return false;
  return (t.merchant_name ?? "").toLowerCase().includes(p) || (t.name ?? "").toLowerCase().includes(p);
}

/** Override rows for every transaction a rule matches. First matching rule wins. */
export function applyRules(rules: TagRule[], txns: Taggable[]) {
  const out = [];
  for (const t of txns) {
    const r = rules.find((rule) => matchRule(rule, t));
    if (!r) continue;
    out.push({
      public_transaction_id: t.id,
      entity: r.entity,
      domain_tag: r.domain_tag,
      budget_key: r.budget_key,
      property_id: r.property_id,
      source: `rule:${r.id}`,
    });
  }
  return out;
}
