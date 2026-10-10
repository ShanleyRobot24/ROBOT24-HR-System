-- Update 9: exchange rates for reporting in USD and AED.
-- One rate per currency per month: how many US dollars one unit is worth (e.g. GBP 1.27).
-- USD is always 1 and AED is pegged at 3.6725 per USD, so neither needs a rate here.
-- Run once in Supabase > SQL Editor. Safe to run more than once.

create table if not exists public.fx_rates (
  currency text not null check (currency ~ '^[A-Z]{3}$' and currency not in ('USD','AED')),
  period date not null,
  usd_per_unit numeric not null check (usd_per_unit > 0),
  source text not null default 'manual',
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (currency, period)
);

alter table public.fx_rates enable row level security;
drop policy if exists "fx finance" on public.fx_rates;
create policy "fx finance" on public.fx_rates for all to authenticated
  using (public.is_finance()) with check (public.is_finance());

-- Rate changes appear in the audit trail
create or replace function public.audit_fx() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record := coalesce(new, old);
begin
  insert into public.audit_log (user_id, user_email, via, action, area, summary, changes)
  values (auth.uid(), (select email from public.profiles where id = auth.uid()), case when auth.uid() is null then 'system' else 'app' end,
    case tg_op when 'INSERT' then 'added' when 'UPDATE' then 'changed' else 'deleted' end,
    'Exchange rates', r.currency || ' ' || to_char(r.period, 'Mon YYYY'),
    case tg_op when 'UPDATE' then jsonb_build_object('usd_per_unit', jsonb_build_array(old.usd_per_unit, new.usd_per_unit))
               else jsonb_build_object('usd_per_unit', r.usd_per_unit, 'source', r.source) end);
  return null;
end $$;
drop trigger if exists audit_fx_rates on public.fx_rates;
create trigger audit_fx_rates after insert or update or delete on public.fx_rates
for each row execute function public.audit_fx();

notify pgrst, 'reload schema';
