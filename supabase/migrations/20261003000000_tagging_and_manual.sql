-- Terry HQ finance app, phase 0: tagging overrides, rules, editable budgets, manual accounts.
-- Additive only. RLS on with no policies: service role only, like the other finance tables.
-- Target project: acouuzccqkcpyrckrgwg (verify before applying).

-- Which Plaid mask belongs to which business. Mirrors founder-os config.yaml finance.account_entities.
create table if not exists public.account_entities (
  mask text primary key,
  entity text not null check (entity in ('ats', 'lts', 'sag')),
  label text
);
insert into public.account_entities (mask, entity, label) values
  ('1000', 'ats', 'Amex Business Gold'),
  ('0955', 'ats', 'PFCU ATS'),
  ('1110', 'lts', 'Chase LTS'),
  ('6450', 'lts', 'PFCU LTS'),
  ('2196', 'sag', 'Chase SAG')
on conflict (mask) do nothing;

-- Terry's corrections. A null column means "keep the computed value".
create table if not exists public.transaction_overrides (
  public_transaction_id uuid primary key references public.transactions(id) on delete cascade,
  entity text check (entity in ('personal', 'ats', 'lts', 'sag')),
  domain_tag text,
  budget_key text,
  property_id uuid references public.properties(id) on delete set null,
  note text,
  source text not null default 'manual', -- 'manual' | 'rule:<tag_rules.id>'
  updated_at timestamptz not null default now()
);
create index if not exists transaction_overrides_source_idx on public.transaction_overrides (source);

-- "Always tag this merchant like this". Materialized into transaction_overrides; never evaluated at read time.
create table if not exists public.tag_rules (
  id uuid primary key default gen_random_uuid(),
  pattern text not null, -- case-insensitive substring of merchant_name, then name
  entity text check (entity in ('personal', 'ats', 'lts', 'sag')),
  domain_tag text,
  budget_key text,
  property_id uuid references public.properties(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Budget lines, editable from the phone. Seeded from lib/budget.ts DEFAULT_BUDGET (2026-10-02).
create table if not exists public.budget_lines (
  key text primary key,
  label text not null,
  monthly numeric not null default 0,
  lumpy boolean not null default false,
  watch text,
  sort int not null,
  prefixes text[] not null default '{}', -- Plaid category_detailed prefixes; empty = catch-all
  merchant_regex text
);
insert into public.budget_lines (key, label, monthly, lumpy, watch, sort, prefixes, merchant_regex) values
  ('coffee', 'Coffee', 150, false, null, 10, '{FOOD_AND_DRINK_COFFEE}', null),
  ('groceries', 'Groceries', 450, false, null, 20, '{FOOD_AND_DRINK_GROCERIES}', 'instacart'),
  ('dining', 'Eating out & delivery', 800, false, null, 30, '{FOOD_AND_DRINK_}', null),
  ('rides', 'Uber & Lyft', 350, false, null, 40, '{TRANSPORTATION_TAXIS}', null),
  ('gas', 'Gas, tolls & parking', 450, false, null, 50, '{TRANSPORTATION_}', null),
  ('clothes', 'Clothes', 200, false, null, 60, '{GENERAL_MERCHANDISE_CLOTHING}', null),
  ('shopping', 'Shopping (Amazon, Walmart, Target)', 1000, false, null, 70, '{GENERAL_MERCHANDISE_}', null),
  ('fun', 'Fun & entertainment', 300, false, null, 80, '{ENTERTAINMENT_}', null),
  ('bills', 'Bills (utilities, phone, insurance, gym)', 1150, true, null, 90, '{RENT_AND_UTILITIES_,GENERAL_SERVICES_INSURANCE,PERSONAL_CARE_GYMS}', null),
  ('care', 'Health & personal care', 175, false, null, 100, '{PERSONAL_CARE_,MEDICAL_}', null),
  ('travel', 'Travel', 300, true, null, 110, '{TRAVEL_}', null),
  ('car', 'Car upkeep', 250, true, null, 120, '{GENERAL_SERVICES_AUTOMOTIVE}', null),
  ('interest', 'Interest & card fees', 0, false, 'Interest means a card carried a balance.', 130, '{BANK_FEES_}', null),
  ('rental', 'Rental costs on personal cards', 0, false, 'Put renovation buys on the LTS Chase card.', 140, '{HOME_IMPROVEMENT_}', null),
  ('other', 'Everything else', 250, false, null, 999, '{}', null)
on conflict (key) do nothing;

-- Accounts Plaid can't see (Citi, Apple Card, PFCU 6450). Balance typed by hand.
-- Once Plaid links the same account, set plaid_account_id and the row drops out of totals.
create table if not exists public.manual_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('credit', 'loan', 'cash', 'crypto', 'other')),
  entity text not null default 'personal' check (entity in ('personal', 'ats', 'lts', 'sag')),
  balance numeric not null default 0,
  limit_balance numeric,
  plaid_account_id text,
  notes text,
  updated_at timestamptz not null default now()
);

alter table public.account_entities enable row level security;
alter table public.transaction_overrides enable row level security;
alter table public.tag_rules enable row level security;
alter table public.budget_lines enable row level security;
alter table public.manual_accounts enable row level security;

-- One resolved row per transaction: overrides win, then founder-os categorization, then account default.
-- categorized_transactions.public_transaction_id is text; transactions.id is uuid.
create or replace view public.transactions_tagged with (security_invoker = true) as
select
  t.id,
  t.account_id,
  t.date,
  t.pending,
  t.name,
  t.merchant_name,
  t.amount,
  t.category_primary,
  t.category_detailed,
  pa.account_name,
  pa.mask,
  coalesce(ae.entity, 'personal') as account_entity,
  coalesce(o.entity, ae.entity, 'personal') as entity,
  coalesce(o.domain_tag, c.domain_tag, 'uncategorized') as domain_tag,
  o.budget_key,
  o.property_id,
  o.note,
  c.flags,
  (o.public_transaction_id is not null) as overridden
from public.transactions t
left join public.categorized_transactions c on c.public_transaction_id = t.id::text
left join public.transaction_overrides o on o.public_transaction_id = t.id
left join public.plaid_accounts pa on pa.account_id = t.account_id
left join public.account_entities ae on ae.mask = pa.mask;
