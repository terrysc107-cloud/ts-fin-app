-- Rebuild 2026-10-01: copy the wealth tables the dashboard needs from north_star into public.
-- north_star is not exposed to the API, so the app's reads of it fail. Additive only:
-- north_star is left untouched (never dropped). Deviation from this repo's CLAUDE.md
-- ("don't duplicate north_star into public") was approved in .ai/REBUILD-PLAN.md.
-- RLS on, no policies: only the service role (server routes) can read or write.

create table public.properties          (like north_star.properties          including all);
create table public.goals               (like north_star.goals               including all);
create table public.investment_accounts (like north_star.investment_accounts including all);
create table public.net_worth_snapshots (like north_star.net_worth_snapshots including all);
create table public.income_streams      (like north_star.income_streams      including all);
create table public.ai_insights         (like north_star.ai_insights         including all);
create table public.context_store       (like north_star.context_store       including all);

insert into public.properties          select * from north_star.properties;
insert into public.goals               select * from north_star.goals;
insert into public.investment_accounts select * from north_star.investment_accounts;
-- net_worth is generated (gross_assets - total_debt), so it can't be inserted.
insert into public.net_worth_snapshots
  (id, client_id, snapshot_date, gross_assets, total_debt, real_estate_value, real_estate_debt,
   portfolio_value, cash_available, ats_value_estimate, notes, created_at)
select id, client_id, snapshot_date, gross_assets, total_debt, real_estate_value, real_estate_debt,
       portfolio_value, cash_available, ats_value_estimate, notes, created_at
  from north_star.net_worth_snapshots;
insert into public.income_streams      select * from north_star.income_streams;
insert into public.ai_insights         select * from north_star.ai_insights;
insert into public.context_store       select * from north_star.context_store;

-- Manual investment rows that Plaid already tracks must not be counted twice in net worth.
alter table public.investment_accounts add column in_plaid boolean not null default false;
update public.investment_accounts set in_plaid = true
 where account_name in ('M1 Finance', 'ThinkorSwim Big Long Term', 'ThinkorSwim Roth IRA');

-- One automatic snapshot per day (Founder OS upserts on this).
alter table public.net_worth_snapshots
  add constraint net_worth_snapshots_client_day_key unique (client_id, snapshot_date);

alter table public.properties          enable row level security;
alter table public.goals               enable row level security;
alter table public.investment_accounts enable row level security;
alter table public.net_worth_snapshots enable row level security;
alter table public.income_streams      enable row level security;
alter table public.ai_insights         enable row level security;
alter table public.context_store       enable row level security;
