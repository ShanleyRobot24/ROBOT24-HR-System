-- Update 13: shared receipts. One receipt split across several people is saved as one row per person,
-- tied together so reports count each share once and the full receipt total is still visible.
-- Run once in Supabase > SQL Editor. Safe to run more than once.

alter table public.direct_costs add column if not exists split_group uuid;
alter table public.direct_costs add column if not exists split_of int check (split_of is null or split_of >= 2);
alter table public.direct_costs add column if not exists split_total numeric check (split_total is null or split_total > 0);
create index if not exists direct_costs_split_idx on public.direct_costs (split_group);
create index if not exists direct_costs_booking_ref_idx on public.direct_costs (lower(booking_ref));

notify pgrst, 'reload schema';
