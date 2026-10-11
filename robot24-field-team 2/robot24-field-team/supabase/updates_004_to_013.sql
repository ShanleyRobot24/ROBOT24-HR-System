-- Database updates 004 to 013, combined into one file.
-- You only need this if your database has not had these updates yet. Every part is safe to run again.
-- Run it once in Supabase > SQL Editor, then run migration_014 and migration_015.

-- ======================= migration_004_photos_disputes.sql =======================
-- Update 4: field team photos, invoice replacement for disputes.
-- Run once in Supabase > SQL Editor. Safe to run more than once. Existing data is kept.

-- Photo per field team member
alter table public.contractors add column if not exists photo_path text;

-- HR and finance may change the address and the photo. Everything else stays admin only.
create or replace function public.contractors_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  allowed text[] := array['address_line1','address_line2','address_city','address_state','address_postcode','address_country','photo_path','updated_at'];
begin
  if auth.uid() is null or public.is_admin() or coalesce(current_setting('r24.system', true), '') = 'on' then
    return new;
  end if;
  if (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) then
    raise exception 'Only an admin can change these details. HR and finance can edit the address, photo and documents.';
  end if;
  return new;
end $$;

-- Directory now includes the photo
drop function if exists public.directory();
create function public.directory()
returns table (
  id uuid, full_name text, designation text, region text, city text,
  email text, phone text, wechat_id text,
  tshirt_status text, mic_sponge_status text, contract_signed boolean, photo_path text
)
language sql stable security definer set search_path = public as $$
  select id, full_name, designation, region, city, email, phone, wechat_id,
         tshirt_status, mic_sponge_status, contract_signed, photo_path
  from public.contractors
  where active and auth.uid() is not null
  order by region, full_name;
$$;
revoke execute on function public.directory() from public, anon;
grant execute on function public.directory() to authenticated;

-- Replaced invoices are kept for the record
alter table public.invoice_uploads add column if not exists replaced_by uuid references public.invoice_uploads(id) on delete set null;
alter table public.invoice_uploads add column if not exists note text;
alter table public.invoice_uploads drop constraint if exists invoice_uploads_status_check;
alter table public.invoice_uploads add constraint invoice_uploads_status_check
  check (status in ('processing','processed','unmatched','needs_attention','duplicate','error','dismissed','replaced'));

-- Photos: everyone signed in can see them, HR and finance can change them
insert into storage.buckets (id, name, public) values ('photos', 'photos', false) on conflict (id) do nothing;

drop policy if exists "r24 read photos" on storage.objects;
drop policy if exists "r24 upload photos" on storage.objects;
drop policy if exists "r24 update photos" on storage.objects;
drop policy if exists "r24 delete photos" on storage.objects;
create policy "r24 read photos" on storage.objects for select to authenticated using (bucket_id = 'photos');
create policy "r24 upload photos" on storage.objects for insert to authenticated with check (bucket_id = 'photos' and public.is_finance());
create policy "r24 update photos" on storage.objects for update to authenticated using (bucket_id = 'photos' and public.is_finance());
create policy "r24 delete photos" on storage.objects for delete to authenticated using (bucket_id = 'photos' and public.is_finance());

-- ======================= migration_005_direct_costs.sql =======================
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

-- ======================= migration_006_assignments.sql =======================
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

-- ======================= migration_007_production_assignments.sql =======================
-- Update 7: production and the assignment team get the same access.
-- Both can see the directory, add assignments and record travel. Neither sees rates, bills or bank details.
-- Run once in Supabase > SQL Editor. Safe to run more than once.

create or replace function public.is_assignments() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('production','assignments','hr_finance','admin'));
$$;

-- One level from now on: anyone set to "assignments" becomes "production"
update public.profiles set role = 'production' where role = 'assignments';

-- ======================= migration_008_audit_trail.sql =======================
-- Update 8: audit trail. Records who added, changed or deleted what, and when.
-- Written by the database itself, so it cannot be skipped. Entries can never be edited or deleted.
-- Only admins can read it. Run once in Supabase > SQL Editor. Safe to run more than once.

create table if not exists public.audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  user_id uuid,
  user_email text,
  via text not null default 'app',
  action text not null check (action in ('added','changed','deleted')),
  area text not null,
  record_id uuid,
  summary text,
  changes jsonb
);
create index if not exists audit_log_at_idx on public.audit_log (at desc);
create index if not exists audit_log_user_idx on public.audit_log (user_id);
create index if not exists audit_log_area_idx on public.audit_log (area);
create index if not exists audit_log_record_idx on public.audit_log (record_id);

alter table public.audit_log enable row level security;
drop policy if exists "audit admin read" on public.audit_log;
create policy "audit admin read" on public.audit_log for select to authenticated using (public.is_admin());
-- No insert, update or delete policies: only the trigger below writes, and nothing can change or remove an entry.
revoke update, delete, truncate on public.audit_log from authenticated, anon;

create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_via text := 'app';
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_row jsonb;
  v_changes jsonb := '{}'::jsonb;
  v_skip text[] := array['updated_at','created_at','extracted','payment_ids','id'];
  v_secret text[] := array['bank_details'];
  v_name text;
  v_summary text;
  v_area text;
  k text;
begin
  v_row := coalesce(v_new, v_old);

  -- Who did it. With no signed-in user, the change came from the AI reader or from Supabase itself.
  if v_user is null then
    if tg_table_name = 'invoice_uploads' then
      if tg_op = 'UPDATE' then return null; end if;          -- the AI updating its own reading status
      v_user := nullif(v_row->>'uploaded_by', '')::uuid; v_via := 'AI reader';
    elsif tg_table_name = 'payments' and (v_row->>'upload_id') is not null then
      select uploaded_by into v_user from public.invoice_uploads where id = (v_row->>'upload_id')::uuid;
      v_via := 'AI reader';
    else
      v_via := 'system';
    end if;
  end if;

  -- What changed
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(v_new) loop
      continue when k = any(v_skip);
      if (v_new->k) is distinct from (v_old->k) then
        if k = any(v_secret) then
          v_changes := v_changes || jsonb_build_object(k, jsonb_build_array('(hidden)', '(hidden)'));
        else
          v_changes := v_changes || jsonb_build_object(k, jsonb_build_array(v_old->k, v_new->k));
        end if;
      end if;
    end loop;
    if v_changes = '{}'::jsonb then return null; end if;
  else
    v_changes := (v_row - v_skip) - v_secret;
    if v_row ? 'bank_details' and coalesce(v_row->>'bank_details', '') <> '' then
      v_changes := v_changes || jsonb_build_object('bank_details', '(hidden)');
    end if;
  end if;

  -- A readable line
  if v_row ? 'contractor_id' then
    select full_name into v_name from public.contractors where id = (v_row->>'contractor_id')::uuid;
  end if;
  v_area := case tg_table_name
    when 'contractors' then 'Field team' when 'payments' then 'Bills' when 'invoice_uploads' then 'Invoices'
    when 'direct_costs' then 'Booked by Robot24' when 'assignments' then 'Assignments'
    when 'documents' then 'Documents' when 'profiles' then 'Users' else tg_table_name end;
  v_summary := case tg_table_name
    when 'contractors' then concat_ws(' ', v_row->>'full_name', '(' || (v_row->>'ref_code') || ')')
    when 'payments' then concat_ws(' ', coalesce(v_name, 'Unknown'), '·', case v_row->>'kind' when 'expense' then 'Expenses' else 'Fee' end,
                                   (v_row->>'currency') || ' ' || (v_row->>'amount'), nullif('· ' || coalesce(v_row->>'invoice_number', ''), '· '))
    when 'invoice_uploads' then v_row->>'file_name'
    when 'direct_costs' then concat_ws(' ', coalesce(v_name, 'Unknown'), '·', coalesce(v_row->>'description', v_row->>'category'),
                                       (v_row->>'currency') || ' ' || (v_row->>'amount'))
    when 'assignments' then concat_ws(' ', coalesce(v_name, 'Unknown'), '·', v_row->>'title', '(' || (v_row->>'start_date') || ' to ' || (v_row->>'end_date') || ')')
    when 'documents' then concat_ws(' ', coalesce(v_name, 'Unknown'), '·', v_row->>'doc_type', v_row->>'file_name')
    when 'profiles' then concat_ws(' ', v_row->>'email', '·', v_row->>'role')
    else null end;

  insert into public.audit_log (user_id, user_email, via, action, area, record_id, summary, changes)
  values (
    v_user,
    (select email from public.profiles where id = v_user),
    v_via,
    case tg_op when 'INSERT' then 'added' when 'UPDATE' then 'changed' else 'deleted' end,
    v_area,
    nullif(v_row->>'id', '')::uuid,
    v_summary,
    v_changes
  );
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['contractors','payments','invoice_uploads','direct_costs','assignments','documents','profiles'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists audit_%1$s on public.%1$I', t);
      execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I for each row execute function public.audit_row()', t);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';

-- ======================= migration_009_exchange_rates.sql =======================
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

-- ======================= migration_010_clean_currencies.sql =======================
-- Update 10: tidy currency codes. Removes stray spaces and lower-case letters (e.g. "USD " or "usd"),
-- then makes sure every currency is exactly three capital letters from now on.
-- Run once in Supabase > SQL Editor. Safe to run more than once.

update public.contractors   set currency = upper(regexp_replace(currency, '[^A-Za-z]', '', 'g')) where currency !~ '^[A-Z]{3}$';
update public.payments      set currency = upper(regexp_replace(currency, '[^A-Za-z]', '', 'g')) where currency !~ '^[A-Z]{3}$';
update public.direct_costs  set currency = upper(regexp_replace(currency, '[^A-Za-z]', '', 'g')) where currency !~ '^[A-Z]{3}$';
update public.contractors   set currency = 'USD' where currency is null or currency !~ '^[A-Z]{3}$';
update public.payments      set currency = 'USD' where currency is null or currency !~ '^[A-Z]{3}$';
update public.direct_costs  set currency = 'USD' where currency is null or currency !~ '^[A-Z]{3}$';

alter table public.contractors  drop constraint if exists contractors_currency_format;
alter table public.contractors  add constraint contractors_currency_format check (currency ~ '^[A-Z]{3}$');
alter table public.payments     drop constraint if exists payments_currency_format;
alter table public.payments     add constraint payments_currency_format check (currency ~ '^[A-Z]{3}$');
alter table public.direct_costs drop constraint if exists direct_costs_currency_format;
alter table public.direct_costs add constraint direct_costs_currency_format check (currency ~ '^[A-Z]{3}$');

notify pgrst, 'reload schema';

-- Check: every row should now show a clean three-letter code
select full_name, currency, length(currency) as letters from public.contractors where full_name ilike '%test%';

-- ======================= migration_011_booking_end_date.sql =======================
-- Update 11: hotel check-out and return flight dates on bookings made by Robot24.
-- Run once in Supabase > SQL Editor. Safe to run more than once.

alter table public.direct_costs add column if not exists end_date date;
alter table public.direct_costs drop constraint if exists direct_costs_end_after_start;
alter table public.direct_costs add constraint direct_costs_end_after_start
  check (end_date is null or travel_date is null or end_date >= travel_date);

notify pgrst, 'reload schema';

-- ======================= migration_012_bills_to_jobs.sql =======================
-- Update 12: link each bill to the assignment it was for, and show that to approvers.
-- Run once in Supabase > SQL Editor. Safe to run more than once. Existing data is kept.

alter table public.payments add column if not exists assignment_id uuid references public.assignments(id) on delete set null;
create index if not exists payments_assignment_idx on public.payments (assignment_id);

-- Approvers also see which job a bill is for, and how many days were booked
drop function if exists public.approval_queue(text, date);
create function public.approval_queue(p_status text default 'pending_approval', p_period date default null)
returns table (
  id uuid, period date, kind text, doc_type text, invoice_number text, description text, event_reference text,
  days_worked numeric, amount numeric, currency text, expected_amount numeric, flag text, line_items jsonb,
  invoice_date date, due_date date, status text, invoice_file_path text, submitted_at timestamptz,
  approved_by_email text, approved_at timestamptz, approval_note text,
  contractor_id uuid, full_name text, ref_code text, region text, designation text,
  day_rate numeric, ten_day_rate numeric, fifteen_day_rate numeric, rate_currency text,
  assignment_id uuid, assignment_title text, assignment_ref text, assignment_start date, assignment_end date
)
language sql stable security definer set search_path = public as $$
  select p.id, p.period, p.kind, p.doc_type, p.invoice_number, p.description, p.event_reference,
         p.days_worked, p.amount, p.currency, p.expected_amount, p.flag, p.line_items,
         p.invoice_date, p.due_date, p.status, p.invoice_file_path, p.submitted_at,
         p.approved_by_email, p.approved_at, p.approval_note,
         c.id, c.full_name, c.ref_code, c.region, c.designation,
         c.day_rate, c.ten_day_rate, c.fifteen_day_rate, c.currency,
         a.id, a.title, a.event_reference, a.start_date, a.end_date
  from public.payments p
  join public.contractors c on c.id = p.contractor_id
  left join public.assignments a on a.id = p.assignment_id
  where (public.is_approver() or public.is_finance())
    and p.status = p_status
    and (p_period is null or p.period = p_period)
  order by p.period desc, c.region, c.full_name
  limit 1000;
$$;
revoke execute on function public.approval_queue(text, date) from public, anon;
grant execute on function public.approval_queue(text, date) to authenticated;

notify pgrst, 'reload schema';

-- ======================= migration_013_shared_receipts.sql =======================
-- Update 13: shared receipts. One receipt split across several people is saved as one row per person,
-- tied together so reports count each share once and the full receipt total is still visible.
-- Run once in Supabase > SQL Editor. Safe to run more than once.

alter table public.direct_costs add column if not exists split_group uuid;
alter table public.direct_costs add column if not exists split_of int check (split_of is null or split_of >= 2);
alter table public.direct_costs add column if not exists split_total numeric check (split_total is null or split_total > 0);
create index if not exists direct_costs_split_idx on public.direct_costs (split_group);
create index if not exists direct_costs_booking_ref_idx on public.direct_costs (lower(booking_ref));

notify pgrst, 'reload schema';
