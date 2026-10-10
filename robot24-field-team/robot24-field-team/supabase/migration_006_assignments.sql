-- Update 6: assignment team, assignments, travel linked to assignments.
-- Run once in Supabase > SQL Editor. Safe to run more than once. Existing data is kept.

-- New access level: assignment team
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('production','assignments','hr_finance','admin'));

create or replace function public.is_assignments() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('assignments','hr_finance','admin'));
$$;

-- Assignments: who was booked for which job
create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractors(id) on delete restrict,
  title text not null,
  event_reference text,
  city text,
  country text,
  start_date date not null,
  end_date date not null,
  status text not null default 'confirmed' check (status in ('planned','confirmed','completed','cancelled')),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists assignments_dates_idx on public.assignments (start_date, end_date);
create index if not exists assignments_contractor_idx on public.assignments (contractor_id);

drop trigger if exists assignments_touch on public.assignments;
create trigger assignments_touch before update on public.assignments
for each row execute function public.touch_updated_at();

alter table public.assignments enable row level security;
drop policy if exists "assignments team" on public.assignments;
create policy "assignments team" on public.assignments for all to authenticated
  using (public.is_assignments()) with check (public.is_assignments());

-- Travel bookings can belong to an assignment, and the assignment team can manage them
alter table public.direct_costs add column if not exists assignment_id uuid references public.assignments(id) on delete set null;
drop policy if exists "direct costs finance" on public.direct_costs;
drop policy if exists "direct costs team" on public.direct_costs;
create policy "direct costs team" on public.direct_costs for all to authenticated
  using (public.is_assignments()) with check (public.is_assignments());

-- Ticket and receipt files for bookings live under invoices/direct/
drop policy if exists "r24 travel files read" on storage.objects;
drop policy if exists "r24 travel files upload" on storage.objects;
drop policy if exists "r24 travel files delete" on storage.objects;
create policy "r24 travel files read" on storage.objects for select to authenticated
  using (bucket_id = 'invoices' and name like 'direct/%' and public.is_assignments());
create policy "r24 travel files upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'invoices' and name like 'direct/%' and public.is_assignments());
create policy "r24 travel files delete" on storage.objects for delete to authenticated
  using (bucket_id = 'invoices' and name like 'direct/%' and public.is_assignments());

-- Directory now also returns the invoice reference (used by the assignment team's pickers)
drop function if exists public.directory();
create function public.directory()
returns table (
  id uuid, ref_code text, full_name text, designation text, region text, city text,
  email text, phone text, wechat_id text,
  tshirt_status text, mic_sponge_status text, contract_signed boolean, photo_path text
)
language sql stable security definer set search_path = public as $$
  select id, ref_code, full_name, designation, region, city, email, phone, wechat_id,
         tshirt_status, mic_sponge_status, contract_signed, photo_path
  from public.contractors
  where active and auth.uid() is not null
  order by region, full_name;
$$;
revoke execute on function public.directory() from public, anon;
grant execute on function public.directory() to authenticated;

do $$
begin
  begin alter publication supabase_realtime add table public.assignments; exception when others then null; end;
end $$;
