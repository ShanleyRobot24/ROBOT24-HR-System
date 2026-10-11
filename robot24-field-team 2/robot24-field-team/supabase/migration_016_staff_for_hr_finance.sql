-- Update 16: the Staff portal is HR and finance's tool. HR and finance (and admins) get Staff access automatically.
-- The Staff access tick still gives it to anyone else who needs it, for example a manager who approves salaries.
-- Employees themselves do not sign in to it. Run once in Supabase > SQL Editor. Safe to run more than once.

create or replace function public.is_staff_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and (role in ('admin','hr_finance') or staff_access));
$$;

create or replace function public.is_payroll_approver() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_approver and (role in ('admin','hr_finance') or staff_access));
$$;

notify pgrst, 'reload schema';
