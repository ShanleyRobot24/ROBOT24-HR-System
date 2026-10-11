-- Update 15: payroll approval. Each month's staff payroll is sent as a report, approved or rejected, then marked paid.
-- Only approvers who also have Staff access can approve. Approved and paid payrolls cannot be changed.
-- Run once in Supabase > SQL Editor. Safe to run more than once.

create or replace function public.is_payroll_approver() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_approver and (role = 'admin' or staff_access));
$$;

create table if not exists public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  period date not null unique,
  status text not null default 'pending_approval' check (status in ('pending_approval','approved','rejected','paid')),
  lines jsonb not null default '[]'::jsonb,
  totals jsonb not null default '{}'::jsonb,
  headcount int not null default 0,
  submitted_by uuid references auth.users(id),
  submitted_by_email text,
  submitted_at timestamptz,
  decided_by uuid references auth.users(id),
  decided_by_email text,
  decided_at timestamptz,
  decision_note text,
  paid_at date,
  paid_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.payroll_runs enable row level security;
drop policy if exists "payroll staff admins" on public.payroll_runs;
create policy "payroll staff admins" on public.payroll_runs for all to authenticated using (public.is_staff_admin()) with check (public.is_staff_admin());

create or replace function public.payroll_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare me_email text := (select email from public.profiles where id = auth.uid());
begin
  if tg_op = 'DELETE' then
    if old.status in ('approved','paid') then raise exception 'An approved or paid payroll cannot be deleted'; end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'pending_approval' then raise exception 'A payroll starts as waiting for approval'; end if;
    new.submitted_by := auth.uid(); new.submitted_by_email := me_email; new.submitted_at := now();
    new.decided_by := null; new.decided_by_email := null; new.decided_at := null; new.decision_note := null; new.paid_at := null; new.paid_reference := null;
    return new;
  end if;
  -- UPDATE
  if old.status in ('approved','paid') and (new.lines is distinct from old.lines or new.totals is distinct from old.totals or new.period is distinct from old.period) then
    raise exception 'This payroll is approved, so its lines cannot change';
  end if;
  if new.status <> old.status then
    if old.status = 'pending_approval' and new.status in ('approved','rejected') then
      if not public.is_payroll_approver() then raise exception 'Only an approver with Staff access can approve or reject payroll'; end if;
      if new.status = 'rejected' and coalesce(trim(new.decision_note), '') = '' then raise exception 'Give a reason for rejecting'; end if;
      new.decided_by := auth.uid(); new.decided_by_email := me_email; new.decided_at := now();
    elsif old.status = 'rejected' and new.status = 'pending_approval' then
      new.submitted_by := auth.uid(); new.submitted_by_email := me_email; new.submitted_at := now();
      new.decided_by := null; new.decided_by_email := null; new.decided_at := null; new.decision_note := null;
    elsif old.status = 'approved' and new.status = 'paid' then
      if new.paid_at is null then new.paid_at := current_date; end if;
    else
      raise exception 'Payroll cannot go from % to %', old.status, new.status;
    end if;
  elsif old.status = 'pending_approval' and (new.lines is distinct from old.lines) then
    -- Resent with updated figures
    new.submitted_by := auth.uid(); new.submitted_by_email := me_email; new.submitted_at := now();
  end if;
  return new;
end $$;
drop trigger if exists payroll_guard on public.payroll_runs;
create trigger payroll_guard before insert or update or delete on public.payroll_runs for each row execute function public.payroll_guard();
drop trigger if exists payroll_touch on public.payroll_runs;
create trigger payroll_touch before update on public.payroll_runs for each row execute function public.touch_updated_at();

create or replace function public.audit_payroll() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record := coalesce(new, old);
begin
  insert into public.audit_log (user_id, user_email, via, action, area, record_id, summary, changes)
  values (auth.uid(), (select email from public.profiles where id = auth.uid()), 'app',
    case tg_op when 'INSERT' then 'added' when 'UPDATE' then 'changed' else 'deleted' end, 'Payroll', r.id,
    'Payroll ' || to_char(r.period, 'Mon YYYY') || ' · ' || r.headcount || ' people · ' || coalesce((select string_agg(key || ' ' || value, ' + ') from jsonb_each_text(r.totals)), ''),
    case tg_op when 'UPDATE' then jsonb_build_object('status', jsonb_build_array(old.status, new.status)) || case when new.decision_note is distinct from old.decision_note then jsonb_build_object('decision_note', jsonb_build_array(old.decision_note, new.decision_note)) else '{}'::jsonb end || case when new.paid_reference is distinct from old.paid_reference then jsonb_build_object('paid_reference', jsonb_build_array(old.paid_reference, new.paid_reference)) else '{}'::jsonb end
      else jsonb_build_object('status', r.status) end);
  return null;
end $$;
drop trigger if exists audit_payroll on public.payroll_runs;
create trigger audit_payroll after insert or update or delete on public.payroll_runs for each row execute function public.audit_payroll();

do $$ begin
  begin alter publication supabase_realtime add table public.payroll_runs; exception when others then null; end;
end $$;

notify pgrst, 'reload schema';
