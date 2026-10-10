-- Update 11: hotel check-out and return flight dates on bookings made by Robot24.
-- Run once in Supabase > SQL Editor. Safe to run more than once.

alter table public.direct_costs add column if not exists end_date date;
alter table public.direct_costs drop constraint if exists direct_costs_end_after_start;
alter table public.direct_costs add constraint direct_costs_end_after_start
  check (end_date is null or travel_date is null or end_date >= travel_date);

notify pgrst, 'reload schema';
