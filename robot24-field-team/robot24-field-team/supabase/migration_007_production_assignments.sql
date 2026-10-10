-- Update 7: production and the assignment team get the same access.
-- Both can see the directory, add assignments and record travel. Neither sees rates, bills or bank details.
-- Run once in Supabase > SQL Editor. Safe to run more than once.

create or replace function public.is_assignments() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('production','assignments','hr_finance','admin'));
$$;

-- One level from now on: anyone set to "assignments" becomes "production"
update public.profiles set role = 'production' where role = 'assignments';
