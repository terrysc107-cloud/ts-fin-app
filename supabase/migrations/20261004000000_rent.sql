-- Terry HQ finance app, phase 4: units, rent ledger, renovation costs.
-- Additive only. RLS on with no policies: service role only.

create table if not exists public.property_units (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  name text not null,
  tenant_name text,
  monthly_rent numeric not null default 0,
  status text not null default 'vacant' check (status in ('occupied', 'vacant', 'renovating')),
  lease_end date,
  notes text,
  updated_at timestamptz not null default now()
);
create index if not exists property_units_property_idx on public.property_units (property_id);

-- One row per unit per month (period = 'YYYY-MM'). No row = nothing received yet.
create table if not exists public.rent_ledger (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.property_units(id) on delete cascade,
  period text not null check (period ~ '^\d{4}-\d{2}$'),
  due numeric not null default 0,
  received numeric not null default 0,
  received_on date,
  note text,
  unique (unit_id, period)
);

-- Hand-entered renovation spend. Card spend tagged to a property lives in transaction_overrides.property_id.
create table if not exists public.renovation_costs (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  date date not null default current_date,
  vendor text,
  amount numeric not null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists renovation_costs_property_idx on public.renovation_costs (property_id);

alter table public.property_units enable row level security;
alter table public.rent_ledger enable row level security;
alter table public.renovation_costs enable row level security;
