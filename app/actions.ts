"use server";

import { revalidatePath } from "next/cache";
import { createServerClient, CLIENT_ID } from "@/lib/supabase";
import { applyRules, isDomainTag, isEntity, type TagRule } from "@/lib/tags";

// Every write in the app goes through here. Vercel SSO fronts the deployment, so these are Terry-only.
// Reads stay on /api/db (read-only by design).

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};
const num = (fd: FormData, k: string) => {
  const v = str(fd, k);
  if (v === null) return null;
  const n = Number(v.replace(/[$,]/g, ""));
  if (!Number.isFinite(n)) throw new Error(`${k} must be a number`);
  return n;
};
const uuid = (v: string | null) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
const entity = (v: string | null) => (v === null ? null : isEntity(v) ? v : (() => { throw new Error("bad entity"); })());
const domainTag = (v: string | null) => (v === null ? null : isDomainTag(v) ? v : (() => { throw new Error("bad domain tag"); })());

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

const PAGES = ["/", "/transactions", "/reports", "/assets", "/rent", "/budget"];
const refresh = () => PAGES.forEach((p) => revalidatePath(p));

/** Tag one transaction. Empty fields keep the computed value. "Always" also saves a rule for the merchant. */
export async function setOverride(fd: FormData) {
  const sb = createServerClient();
  const id = uuid(str(fd, "id"));
  if (!id) throw new Error("missing transaction id");
  const row = {
    public_transaction_id: id,
    entity: entity(str(fd, "entity")),
    domain_tag: domainTag(str(fd, "domain_tag")),
    budget_key: str(fd, "budget_key"),
    property_id: uuid(str(fd, "property_id")),
    note: str(fd, "note"),
    source: "manual",
    updated_at: new Date().toISOString(),
  };
  const clear = !row.entity && !row.domain_tag && !row.budget_key && !row.property_id && !row.note;
  if (clear) fail((await sb.from("transaction_overrides").delete().eq("public_transaction_id", id)).error);
  else fail((await sb.from("transaction_overrides").upsert(row)).error);

  const pattern = str(fd, "always") ? str(fd, "merchant") : null;
  if (pattern && !clear) await saveRuleRow(sb, { pattern, entity: row.entity, domain_tag: row.domain_tag, budget_key: row.budget_key, property_id: row.property_id });
  refresh();
}

type Sb = ReturnType<typeof createServerClient>;

async function saveRuleRow(sb: Sb, r: Omit<TagRule, "id">) {
  const { data, error } = await sb.from("tag_rules").insert(r).select("id").single();
  fail(error);
  await applyRuleToExisting(sb, { ...r, id: data!.id });
}

/** Write override rows for existing matches. Manual tags win: duplicates are ignored. */
async function applyRuleToExisting(sb: Sb, rule: TagRule) {
  const since = new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await sb.from("transactions").select("id,merchant_name,name").gte("date", since).limit(10000);
  fail(error);
  const rows = applyRules([rule], data ?? []);
  for (let i = 0; i < rows.length; i += 500) {
    fail((await sb.from("transaction_overrides").upsert(rows.slice(i, i + 500), { onConflict: "public_transaction_id", ignoreDuplicates: true })).error);
  }
}

export async function saveRule(fd: FormData) {
  const pattern = str(fd, "pattern");
  if (!pattern) throw new Error("pattern required");
  await saveRuleRow(createServerClient(), {
    pattern,
    entity: entity(str(fd, "entity")),
    domain_tag: domainTag(str(fd, "domain_tag")),
    budget_key: str(fd, "budget_key"),
    property_id: uuid(str(fd, "property_id")),
  });
  refresh();
}

/** Delete a rule and only the override rows it wrote. Manual tags are untouched. */
export async function deleteRule(fd: FormData) {
  const sb = createServerClient();
  const id = uuid(str(fd, "id"));
  if (!id) throw new Error("missing rule id");
  fail((await sb.from("transaction_overrides").delete().eq("source", `rule:${id}`)).error);
  fail((await sb.from("tag_rules").delete().eq("id", id)).error);
  refresh();
}

export async function upsertManualAccount(fd: FormData) {
  const sb = createServerClient();
  const kind = str(fd, "kind");
  if (!kind || !["credit", "loan", "cash", "crypto", "other"].includes(kind)) throw new Error("bad kind");
  const name = str(fd, "name");
  if (!name) throw new Error("name required");
  const row = {
    ...(uuid(str(fd, "id")) ? { id: uuid(str(fd, "id")) } : {}),
    name,
    kind,
    entity: entity(str(fd, "entity")) ?? "personal",
    balance: num(fd, "balance") ?? 0,
    limit_balance: num(fd, "limit_balance"),
    plaid_account_id: str(fd, "plaid_account_id"),
    notes: str(fd, "notes"),
    updated_at: new Date().toISOString(),
  };
  fail((await sb.from("manual_accounts").upsert(row)).error);
  refresh();
}

export async function deleteManualAccount(fd: FormData) {
  const id = uuid(str(fd, "id"));
  if (!id) throw new Error("missing id");
  fail((await createServerClient().from("manual_accounts").delete().eq("id", id)).error);
  refresh();
}

export async function updateProperty(fd: FormData) {
  const id = uuid(str(fd, "id"));
  if (!id) throw new Error("missing property id");
  const patch = {
    current_value: num(fd, "current_value"),
    debt_balance: num(fd, "debt_balance"),
    mortgage_rate: num(fd, "mortgage_rate"),
    debt_in_plaid: fd.get("debt_in_plaid") === "on",
    notes: str(fd, "notes"),
    last_updated: new Date().toISOString().slice(0, 10),
  };
  fail((await createServerClient().from("properties").update(patch).eq("id", id).eq("client_id", CLIENT_ID)).error);
  refresh();
}

export async function upsertInvestment(fd: FormData) {
  const sb = createServerClient();
  const name = str(fd, "account_name");
  if (!name) throw new Error("name required");
  const row = {
    ...(uuid(str(fd, "id")) ? { id: uuid(str(fd, "id")) } : {}),
    client_id: CLIENT_ID,
    account_name: name,
    account_type: str(fd, "account_type") ?? "other",
    current_balance: num(fd, "current_balance") ?? 0,
    in_plaid: fd.get("in_plaid") === "on",
    last_updated: new Date().toISOString().slice(0, 10),
  };
  fail((await sb.from("investment_accounts").upsert(row)).error);
  refresh();
}

// ── Rent ──────────────────────────────────────────────────────────────────────

export async function upsertUnit(fd: FormData) {
  const property_id = uuid(str(fd, "property_id"));
  const name = str(fd, "name");
  if (!property_id || !name) throw new Error("property and unit name required");
  const status = str(fd, "status") ?? "vacant";
  if (!["occupied", "vacant", "renovating"].includes(status)) throw new Error("bad status");
  const row = {
    ...(uuid(str(fd, "id")) ? { id: uuid(str(fd, "id")) } : {}),
    property_id,
    name,
    tenant_name: str(fd, "tenant_name"),
    monthly_rent: num(fd, "monthly_rent") ?? 0,
    status,
    lease_end: str(fd, "lease_end"),
    notes: str(fd, "notes"),
    updated_at: new Date().toISOString(),
  };
  fail((await createServerClient().from("property_units").upsert(row)).error);
  refresh();
}

export async function deleteUnit(fd: FormData) {
  const id = uuid(str(fd, "id"));
  if (!id) throw new Error("missing id");
  fail((await createServerClient().from("property_units").delete().eq("id", id)).error);
  refresh();
}

/** Record rent for a unit and month. "Mark paid" sends received = due. */
export async function recordRent(fd: FormData) {
  const unit_id = uuid(str(fd, "unit_id"));
  const period = str(fd, "period");
  if (!unit_id || !period || !/^\d{4}-\d{2}$/.test(period)) throw new Error("unit and period required");
  const due = num(fd, "due") ?? 0;
  const received = str(fd, "paid_in_full") ? due : (num(fd, "received") ?? 0);
  const row = { unit_id, period, due, received, received_on: received > 0 ? new Date().toISOString().slice(0, 10) : null, note: str(fd, "note") };
  fail((await createServerClient().from("rent_ledger").upsert(row, { onConflict: "unit_id,period" })).error);
  refresh();
}

export async function addRenovationCost(fd: FormData) {
  const property_id = uuid(str(fd, "property_id"));
  const amount = num(fd, "amount");
  if (!property_id || amount === null) throw new Error("property and amount required");
  const row = { property_id, amount, vendor: str(fd, "vendor"), note: str(fd, "note"), date: str(fd, "date") ?? new Date().toISOString().slice(0, 10) };
  fail((await createServerClient().from("renovation_costs").insert(row)).error);
  refresh();
}

export async function deleteRenovationCost(fd: FormData) {
  const id = uuid(str(fd, "id"));
  if (!id) throw new Error("missing id");
  fail((await createServerClient().from("renovation_costs").delete().eq("id", id)).error);
  refresh();
}

export async function updateBudgetLine(fd: FormData) {
  const key = str(fd, "key");
  if (!key) throw new Error("missing key");
  const patch = { monthly: num(fd, "monthly") ?? 0, lumpy: fd.get("lumpy") === "on" };
  fail((await createServerClient().from("budget_lines").update(patch).eq("key", key)).error);
  refresh();
}
