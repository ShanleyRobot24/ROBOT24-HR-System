-- Database updates 17 to 23, combined into one file, in order. Run once in Supabase > SQL Editor.
-- Every part is safe to run again. Then run seed_staff.sql to load the employees (if you haven't yet).

-- Database updates 17 to 19, combined into one file. Run it once in Supabase > SQL Editor.
-- Every part is safe to run again. Then run seed_staff.sql to load the employees (if you haven't yet).

-- ======================= migration_017_ai_and_guardrails.sql =======================
-- Update 17: AI form filling, freelancer and staff contract details, and approver checks.
-- Run once in Supabase > SQL Editor. Safe to run more than once. Existing data is kept.

-- Freelancer details read from their passport
alter table public.contractors add column if not exists nationality text;
alter table public.contractors add column if not exists passport_no text;
alter table public.contractors add column if not exists date_of_birth date;

-- Staff contract details read from the MOHRE or employment contract
alter table public.staff add column if not exists contract_type text check (contract_type is null or contract_type in ('limited','unlimited'));
alter table public.staff add column if not exists contract_end_date date;
alter table public.staff add column if not exists basic_salary numeric check (basic_salary is null or basic_salary >= 0);
alter table public.staff add column if not exists housing_allowance numeric check (housing_allowance is null or housing_allowance >= 0);
alter table public.staff add column if not exists transport_allowance numeric check (transport_allowance is null or transport_allowance >= 0);
alter table public.staff add column if not exists other_allowance numeric check (other_allowance is null or other_allowance >= 0);

-- Checks for the approver: for each bill waiting, how it compares with the person's history and other bills
create or replace function public.approval_checks()
returns table (id uuid, prior_count int, prior_median numeric, same_invoice int, same_amount int)
language sql stable security definer set search_path = public as $$
  select p.id,
    (select count(*)::int from public.payments h where h.contractor_id = p.contractor_id and h.kind = p.kind and h.currency = p.currency and h.status in ('approved','paid') and h.id <> p.id),
    (select percentile_cont(0.5) within group (order by h.amount) from public.payments h where h.contractor_id = p.contractor_id and h.kind = p.kind and h.currency = p.currency and h.status in ('approved','paid') and h.id <> p.id),
    (select count(*)::int from public.payments d where d.contractor_id = p.contractor_id and d.id <> p.id and d.status <> 'rejected' and p.invoice_number is not null and d.invoice_number = p.invoice_number and d.kind = p.kind),
    (select count(*)::int from public.payments d where d.contractor_id = p.contractor_id and d.id <> p.id and d.status <> 'rejected' and d.kind = p.kind and d.amount = p.amount and d.period = p.period)
  from public.payments p
  where (public.is_approver() or public.is_finance()) and p.status = 'pending_approval';
$$;
revoke execute on function public.approval_checks() from public, anon;
grant execute on function public.approval_checks() to authenticated;

-- A backup download is recorded in the audit trail, so Home can remind admins when one is due
create or replace function public.record_backup(p_summary text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only admins make backups'; end if;
  insert into public.audit_log (user_id, user_email, via, action, area, summary)
  values (auth.uid(), (select email from public.profiles where id = auth.uid()), 'app', 'added', 'Backup', left(coalesce(p_summary, 'Backup downloaded'), 300));
end $$;
revoke execute on function public.record_backup(text) from public, anon;
grant execute on function public.record_backup(text) to authenticated;

notify pgrst, 'reload schema';

-- ======================= migration_018_staff_visa_insurance_wps.sql =======================
-- Update 18: who sponsors each employee's visa, who covers their medical insurance, and whether they are paid through WPS.
-- Also a "Not recorded yet" visa status, for company visas whose stage has not been entered.
-- Run once in Supabase > SQL Editor. Safe to run more than once.

alter table public.staff add column if not exists visa_sponsor text check (visa_sponsor is null or visa_sponsor in ('company','own'));
alter table public.staff add column if not exists insurance_by text check (insurance_by is null or insurance_by in ('company','own'));
alter table public.staff add column if not exists wps boolean not null default false;

alter table public.staff drop constraint if exists staff_visa_status_check;
alter table public.staff add constraint staff_visa_status_check check (visa_status in ('unknown','not_started','entry_permit_applied','entry_permit_issued','medical_and_eid','residence_issued','own_visa','cancelled'));

notify pgrst, 'reload schema';

-- ======================= migration_019_own_visa_types.sql =======================
-- Update 19: the kind of visa each employee holds, and NOC and work permit documents.
-- Visa types: company sponsored, golden visa, spouse sponsorship, family (parent) sponsorship, other own visa,
-- or own visa with the type not yet recorded. Run once in Supabase > SQL Editor. Safe to run more than once.

alter table public.staff drop constraint if exists staff_visa_sponsor_check;
alter table public.staff add constraint staff_visa_sponsor_check
  check (visa_sponsor is null or visa_sponsor in ('company','golden','spouse','family','own_other','own'));

alter table public.staff add column if not exists work_permit_no text;
alter table public.staff add column if not exists work_permit_expiry date;

alter table public.staff_documents drop constraint if exists staff_documents_doc_type_check;
alter table public.staff_documents add constraint staff_documents_doc_type_check
  check (doc_type in ('passport','emirates_id','labour_card','work_permit','noc','mohre_contract','offer_letter','employment_contract','visa','other'));

notify pgrst, 'reload schema';


-- Database updates 20 and 21, combined. Run once in Supabase > SQL Editor, after updates 17 to 19. Safe to run again.

-- ======================= Update 20 =======================
-- Update 20: the Staff portal is for HR and finance and admins only. Production never has access,
-- whatever ticks are set, and only HR and finance or admin approvers can approve payroll.
-- Run once in Supabase > SQL Editor. Safe to run more than once.

create or replace function public.is_staff_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','hr_finance'));
$$;

create or replace function public.is_payroll_approver() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_approver and role in ('admin','hr_finance'));
$$;

-- The old per-person Staff access tick no longer does anything
update public.profiles set staff_access = false where staff_access;

notify pgrst, 'reload schema';


-- ======================= Update 21 =======================
-- Update 21: leave and absence for Robot24 staff, and My Robot24, the employees' own portal.
-- Employees get a login linked to their staff record (role "employee"). They see only their own
-- details, documents, leave balances and requests: never salaries, other staff or the field team.
-- Run once in Supabase > SQL Editor. Safe to run more than once.

-- ---------- Employee logins ----------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('production','assignments','hr_finance','admin','employee'));
alter table public.profiles add column if not exists staff_id uuid references public.staff(id) on delete set null;
create unique index if not exists profiles_staff_id_key on public.profiles (staff_id) where staff_id is not null;

create or replace function public.my_staff_id() returns uuid
language sql stable security definer set search_path = public as $$
  select staff_id from public.profiles where id = auth.uid();
$$;

-- Field team data stays with field team users (employees never see it)
create or replace function public.directory()
returns table(id uuid, ref_code text, full_name text, designation text, region text, city text, email text, phone text, wechat_id text, tshirt_status text, mic_sponge_status text, contract_signed boolean, photo_path text)
language sql stable security definer set search_path = public as $$
  select id, ref_code, full_name, designation, region, city, email, phone, wechat_id,
         tshirt_status, mic_sponge_status, contract_signed, photo_path
  from public.contractors
  where active and public.is_assignments()
  order by region, full_name;
$$;
drop policy if exists "r24 read photos" on storage.objects;
create policy "r24 read photos" on storage.objects for select to authenticated using (bucket_id = 'photos' and public.is_assignments());

-- ---------- Leave settings on each staff member ----------
alter table public.staff add column if not exists probation_end date;
alter table public.staff add column if not exists annual_entitlement numeric not null default 30 check (annual_entitlement >= 0);
alter table public.staff add column if not exists opening_annual_balance numeric check (opening_annual_balance is null or opening_annual_balance > -100);
alter table public.staff add column if not exists opening_balance_date date;

-- ---------- Public holidays ----------
create table if not exists public.public_holidays (
  day date primary key,
  name text not null
);
alter table public.public_holidays enable row level security;
drop policy if exists "holidays read" on public.public_holidays;
drop policy if exists "holidays hr" on public.public_holidays;
create policy "holidays read" on public.public_holidays for select to authenticated using (true);
create policy "holidays hr" on public.public_holidays for all to authenticated using (public.is_staff_admin()) with check (public.is_staff_admin());
-- Fixed-date UAE holidays. Islamic holidays move with the moon: add them when they are announced.
insert into public.public_holidays (day, name) values
  ('2026-12-01','Commemoration Day'), ('2026-12-02','National Day'), ('2026-12-03','National Day holiday'),
  ('2027-01-01','New Year''s Day'), ('2027-12-01','Commemoration Day'), ('2027-12-02','National Day'), ('2027-12-03','National Day holiday')
on conflict (day) do nothing;

-- ---------- Leave requests ----------
create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  leave_type text not null check (leave_type in ('annual','sick','maternity','parental','bereavement','study','national_service','unpaid','hajj','toil','wfh')),
  start_date date not null,
  end_date date not null,
  half_day boolean not null default false,
  days numeric not null check (days >= 0),
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  reason text,
  attachment_path text,
  requested_by uuid references auth.users(id),
  requested_by_email text,
  by_employee boolean not null default false,
  decided_by uuid references auth.users(id),
  decided_by_email text,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (not half_day or start_date = end_date)
);
create index if not exists leave_requests_staff_idx on public.leave_requests (staff_id, start_date);

alter table public.leave_requests enable row level security;
drop policy if exists "leave hr" on public.leave_requests;
drop policy if exists "leave own read" on public.leave_requests;
drop policy if exists "leave own request" on public.leave_requests;
drop policy if exists "leave own cancel" on public.leave_requests;
create policy "leave hr" on public.leave_requests for all to authenticated using (public.is_staff_admin()) with check (public.is_staff_admin());
create policy "leave own read" on public.leave_requests for select to authenticated using (staff_id = public.my_staff_id());
create policy "leave own request" on public.leave_requests for insert to authenticated with check (staff_id = public.my_staff_id() and status = 'pending');
create policy "leave own cancel" on public.leave_requests for update to authenticated using (staff_id = public.my_staff_id() and status = 'pending') with check (staff_id = public.my_staff_id() and status = 'cancelled');

create or replace function public.leave_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare me_email text := (select email from public.profiles where id = auth.uid());
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then raise exception 'Leave starts as waiting for approval'; end if;
    new.requested_by := auth.uid(); new.requested_by_email := me_email;
    new.by_employee := not public.is_staff_admin();
    new.decided_by := null; new.decided_by_email := null; new.decided_at := null; new.decision_note := null;
    return new;
  end if;
  if new.status <> old.status then
    if old.status = 'pending' and new.status in ('approved','rejected') then
      if not public.is_payroll_approver() then raise exception 'Only an HR approver can approve or reject leave'; end if;
      if new.status = 'rejected' and coalesce(trim(new.decision_note), '') = '' then raise exception 'Give a reason for rejecting'; end if;
      new.decided_by := auth.uid(); new.decided_by_email := me_email; new.decided_at := now();
    elsif new.status = 'cancelled' and old.status in ('pending','approved') then
      if old.status = 'approved' and not public.is_staff_admin() then raise exception 'Ask HR to cancel approved leave'; end if;
    else
      raise exception 'Leave cannot go from % to %', old.status, new.status;
    end if;
  elsif old.status in ('approved','rejected','cancelled') and (new.start_date, new.end_date, new.leave_type, new.days, new.half_day) is distinct from (old.start_date, old.end_date, old.leave_type, old.days, old.half_day) then
    raise exception 'Decided leave cannot be changed; cancel it and record it again';
  end if;
  return new;
end $$;
drop trigger if exists leave_guard on public.leave_requests;
create trigger leave_guard before insert or update on public.leave_requests for each row execute function public.leave_guard();
drop trigger if exists leave_touch on public.leave_requests;
create trigger leave_touch before update on public.leave_requests for each row execute function public.touch_updated_at();

-- ---------- Balance adjustments (opening balances, time off in lieu earned, corrections) ----------
create table if not exists public.leave_adjustments (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  leave_type text not null check (leave_type in ('annual','toil')),
  days numeric not null check (days <> 0),
  reason text not null,
  on_date date not null default current_date,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.leave_adjustments enable row level security;
drop policy if exists "adjust hr" on public.leave_adjustments;
drop policy if exists "adjust own read" on public.leave_adjustments;
create policy "adjust hr" on public.leave_adjustments for all to authenticated using (public.is_staff_admin()) with check (public.is_staff_admin());
create policy "adjust own read" on public.leave_adjustments for select to authenticated using (staff_id = public.my_staff_id());

-- ---------- What an employee may see of themselves (no salaries) ----------
drop function if exists public.my_staff();
create function public.my_staff() returns table (
  id uuid, staff_no text, full_name text, job_title text, department text, location text, start_date date, work_week text,
  status text, visa_sponsor text, visa_status text, passport_expiry date, emirates_id_expiry date, labour_card_expiry date,
  work_permit_expiry date, visa_expiry date, probation_end date, annual_entitlement numeric, opening_annual_balance numeric,
  opening_balance_date date, termination_date date, email text, phone text)
language sql stable security definer set search_path = public as $$
  select id, staff_no, full_name, job_title, department, location, start_date, work_week, status, visa_sponsor, visa_status,
         passport_expiry, emirates_id_expiry, labour_card_expiry, work_permit_expiry, visa_expiry, probation_end,
         annual_entitlement, opening_annual_balance, opening_balance_date, termination_date, email, phone
  from public.staff where id = public.my_staff_id();
$$;
create or replace function public.my_documents() returns table (doc_type text, file_name text, expires_on date, is_signed boolean, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select doc_type, file_name, expires_on, is_signed, created_at from public.staff_documents where staff_id = public.my_staff_id() order by created_at desc;
$$;
revoke execute on function public.my_staff() from public, anon;
revoke execute on function public.my_documents() from public, anon;
grant execute on function public.my_staff() to authenticated;
grant execute on function public.my_documents() to authenticated;

-- Employees can upload and read their own leave attachments (e.g. a medical certificate)
drop policy if exists "leave files own upload" on storage.objects;
drop policy if exists "leave files own read" on storage.objects;
create policy "leave files own upload" on storage.objects for insert to authenticated with check (bucket_id = 'staff' and name like 'leave/' || public.my_staff_id()::text || '/%');
create policy "leave files own read" on storage.objects for select to authenticated using (bucket_id = 'staff' and name like 'leave/' || public.my_staff_id()::text || '/%');

-- ---------- Audit trail ----------
create or replace function public.audit_leave() returns trigger
language plpgsql security definer set search_path = public as $$
declare r jsonb := to_jsonb(coalesce(new, old)); v_name text; v_changes jsonb := '{}'::jsonb; k text;
begin
  if tg_table_name = 'public_holidays' then v_name := (r->>'day') || ' ' || (r->>'name');
  else select full_name into v_name from public.staff where id = (r->>'staff_id')::uuid;
       v_name := coalesce(v_name, 'Removed staff member') || ' · ' || (r->>'leave_type') || coalesce(' ' || (r->>'start_date') || ' to ' || (r->>'end_date'), ' ' || (r->>'days') || ' days');
  end if;
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(to_jsonb(new)) loop
      continue when k in ('updated_at','created_at');
      if (to_jsonb(new)->k) is distinct from (to_jsonb(old)->k) then v_changes := v_changes || jsonb_build_object(k, jsonb_build_array(to_jsonb(old)->k, to_jsonb(new)->k)); end if;
    end loop;
  else v_changes := r - 'created_at' - 'updated_at' - 'id'; end if;
  insert into public.audit_log (user_id, user_email, via, action, area, record_id, summary, changes)
  values (auth.uid(), (select email from public.profiles where id = auth.uid()), 'app',
          case tg_op when 'INSERT' then 'added' when 'UPDATE' then 'changed' else 'deleted' end,
          case tg_table_name when 'public_holidays' then 'Public holidays' else 'Leave' end,
          case when tg_table_name = 'public_holidays' then null else (r->>'id')::uuid end, v_name, v_changes);
  return null;
end $$;
drop trigger if exists audit_leave on public.leave_requests;
create trigger audit_leave after insert or update or delete on public.leave_requests for each row execute function public.audit_leave();
drop trigger if exists audit_leave_adj on public.leave_adjustments;
create trigger audit_leave_adj after insert or update or delete on public.leave_adjustments for each row execute function public.audit_leave();
drop trigger if exists audit_holidays on public.public_holidays;
create trigger audit_holidays after insert or update or delete on public.public_holidays for each row execute function public.audit_leave();

do $$ begin
  begin alter publication supabase_realtime add table public.leave_requests; exception when others then null; end;
end $$;

notify pgrst, 'reload schema';


-- ======================= Update 22 =======================
-- Update 22: reporting lines (who reports to whom) for the org chart, and leave approved by each person's manager.
-- Managers see their direct reports' names, roles and leave in My Robot24 (never salaries or documents).
-- HR approvers can still approve or reject any leave. Run once in Supabase > SQL Editor. Safe to run more than once.

alter table public.staff add column if not exists manager_id uuid references public.staff(id) on delete set null;
alter table public.staff drop constraint if exists staff_not_own_manager;
alter table public.staff add constraint staff_not_own_manager check (manager_id is null or manager_id <> id);
create index if not exists staff_manager_idx on public.staff (manager_id);

-- Nobody can report to someone below them (no loops in the chart)
create or replace function public.staff_manager_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare cur uuid := new.manager_id; steps int := 0;
begin
  while cur is not null loop
    if cur = new.id then raise exception '% cannot report to someone who reports to them', new.full_name; end if;
    select manager_id into cur from public.staff where id = cur;
    steps := steps + 1;
    if steps > 50 then exit; end if;
  end loop;
  return new;
end $$;
drop trigger if exists staff_manager_guard on public.staff;
create trigger staff_manager_guard before insert or update of manager_id on public.staff for each row execute function public.staff_manager_guard();

create or replace function public.is_manager_of(p_staff uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_staff_id() is not null and exists (select 1 from public.staff where id = p_staff and manager_id = public.my_staff_id());
$$;

-- A manager's direct reports: only what is needed to see and approve their leave
create or replace function public.my_team() returns table (
  id uuid, full_name text, job_title text, department text, work_week text, start_date date, status text,
  probation_end date, annual_entitlement numeric, opening_annual_balance numeric, opening_balance_date date, termination_date date)
language sql stable security definer set search_path = public as $$
  select id, full_name, job_title, department, work_week, start_date, status, probation_end, annual_entitlement,
         opening_annual_balance, opening_balance_date, termination_date
  from public.staff where manager_id = public.my_staff_id() and status <> 'terminated' order by full_name;
$$;
revoke execute on function public.my_team() from public, anon;
grant execute on function public.my_team() to authenticated;

-- My Robot24 also shows who you report to
drop function if exists public.my_staff();
create function public.my_staff() returns table (
  id uuid, staff_no text, full_name text, job_title text, department text, location text, start_date date, work_week text,
  status text, visa_sponsor text, visa_status text, passport_expiry date, emirates_id_expiry date, labour_card_expiry date,
  work_permit_expiry date, visa_expiry date, probation_end date, annual_entitlement numeric, opening_annual_balance numeric,
  opening_balance_date date, termination_date date, email text, phone text, manager_name text, manager_title text)
language sql stable security definer set search_path = public as $$
  select s.id, s.staff_no, s.full_name, s.job_title, s.department, s.location, s.start_date, s.work_week, s.status, s.visa_sponsor, s.visa_status,
         s.passport_expiry, s.emirates_id_expiry, s.labour_card_expiry, s.work_permit_expiry, s.visa_expiry, s.probation_end,
         s.annual_entitlement, s.opening_annual_balance, s.opening_balance_date, s.termination_date, s.email, s.phone, m.full_name, m.job_title
  from public.staff s left join public.staff m on m.id = s.manager_id where s.id = public.my_staff_id();
$$;
revoke execute on function public.my_staff() from public, anon;
grant execute on function public.my_staff() to authenticated;

-- Managers read and decide their team's leave
drop policy if exists "leave manager read" on public.leave_requests;
drop policy if exists "leave manager decide" on public.leave_requests;
create policy "leave manager read" on public.leave_requests for select to authenticated using (public.is_manager_of(staff_id));
create policy "leave manager decide" on public.leave_requests for update to authenticated using (public.is_manager_of(staff_id) and status = 'pending') with check (public.is_manager_of(staff_id) and status in ('approved','rejected'));
drop policy if exists "adjust manager read" on public.leave_adjustments;
create policy "adjust manager read" on public.leave_adjustments for select to authenticated using (public.is_manager_of(staff_id));

create or replace function public.leave_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare me_email text := (select email from public.profiles where id = auth.uid());
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then raise exception 'Leave starts as waiting for approval'; end if;
    new.requested_by := auth.uid(); new.requested_by_email := me_email;
    new.by_employee := not public.is_staff_admin();
    new.decided_by := null; new.decided_by_email := null; new.decided_at := null; new.decision_note := null;
    return new;
  end if;
  if new.status <> old.status then
    if old.status = 'pending' and new.status in ('approved','rejected') then
      -- Their manager decides; HR approvers can always step in
      if not (public.is_manager_of(new.staff_id) or public.is_payroll_approver()) then raise exception 'Only their manager or an HR approver can approve or reject this leave'; end if;
      if new.staff_id = public.my_staff_id() then raise exception 'You cannot approve your own leave'; end if;
      if new.status = 'rejected' and coalesce(trim(new.decision_note), '') = '' then raise exception 'Give a reason for rejecting'; end if;
      new.decided_by := auth.uid(); new.decided_by_email := me_email; new.decided_at := now();
    elsif new.status = 'cancelled' and old.status in ('pending','approved') then
      if old.status = 'approved' and not public.is_staff_admin() then raise exception 'Ask HR to cancel approved leave'; end if;
    else
      raise exception 'Leave cannot go from % to %', old.status, new.status;
    end if;
  elsif old.status in ('approved','rejected','cancelled') and (new.start_date, new.end_date, new.leave_type, new.days, new.half_day) is distinct from (old.start_date, old.end_date, old.leave_type, old.days, old.half_day) then
    raise exception 'Decided leave cannot be changed; cancel it and record it again';
  end if;
  return new;
end $$;

notify pgrst, 'reload schema';

-- ======================= Update 23 =======================
-- Employee logins (My Robot24) can never act as approvers or reach finance, field team or HR data,
-- whatever ticks were set before. Changing someone to Employee clears those ticks.
create or replace function public.is_approver() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_approver and role in ('production','assignments','hr_finance','admin'));
$$;

create or replace function public.profiles_employee_guard() returns trigger
language plpgsql as $$
begin
  if new.role = 'employee' then new.is_approver := false; new.staff_access := false; end if;
  return new;
end $$;
drop trigger if exists profiles_employee_guard on public.profiles;
create trigger profiles_employee_guard before insert or update on public.profiles for each row execute function public.profiles_employee_guard();
update public.profiles set is_approver = false, staff_access = false where role = 'employee' and (is_approver or staff_access);

notify pgrst, 'reload schema';

-- Accounts only get access when an admin gives it in Admin > Users. Anything created another way
-- (sign-ups switched on by mistake, or added in the Supabase dashboard) starts with no access at all.
alter table public.profiles alter column role set default 'employee';

notify pgrst, 'reload schema';
