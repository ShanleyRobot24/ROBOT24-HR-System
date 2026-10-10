-- Update 5: costs Robot24 pays directly for a field team member (flights, trains, hotels booked by the company).
-- These are not owed to the freelancer, so they never enter the bills and approval flow.
-- Run once in Supabase > SQL Editor. Safe to run more than once. Existing data is kept.

create table if not exists public.direct_costs (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractors(id) on delete restrict,
  period date not null,
  category text not null default 'flights',
  description text,
  supplier text,
  booking_ref text,
  travel_date date,
  amount numeric not null check (amount >= 0),
  currency text not null default 'USD',
  receipt_path text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists direct_costs_period_idx on public.direct_costs (period);
create index if not exists direct_costs_contractor_idx on public.direct_costs (contractor_id);

drop trigger if exists direct_costs_touch on public.direct_costs;
create trigger direct_costs_touch before update on public.direct_costs
for each row execute function public.touch_updated_at();

alter table public.direct_costs enable row level security;
drop policy if exists "direct costs finance" on public.direct_costs;
create policy "direct costs finance" on public.direct_costs for all to authenticated
  using (public.is_finance()) with check (public.is_finance());

do $$
begin
  begin alter publication supabase_realtime add table public.direct_costs; exception when others then null; end;
end $$;
