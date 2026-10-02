-- Phase 5C: Plaid "removed" transactions are stamped, never deleted. The view hides them.
alter table public.transactions add column if not exists removed_at timestamptz;
create index if not exists transactions_removed_at_idx on public.transactions (removed_at) where removed_at is not null;

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
left join public.account_entities ae on ae.mask = pa.mask
where t.removed_at is null;
