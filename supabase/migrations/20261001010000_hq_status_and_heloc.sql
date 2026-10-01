-- 2026-10-01: Terry confirmed the $75K debt on 2120 N 58th St IS the HELOC that Plaid
-- already reports as a line of credit. Flag it so net worth doesn't subtract it twice.
alter table public.properties add column debt_in_plaid boolean not null default false;
update public.properties set debt_in_plaid = true where address ilike '2120 N 58th St%';

-- Latest "Today" and "Ventures" summaries pushed hourly from the Mac (scripts/hq-push.mjs).
-- One row per section; service role only.
create table public.hq_status (
  key        text primary key,
  payload    jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.hq_status enable row level security;
