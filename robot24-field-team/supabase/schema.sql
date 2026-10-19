-- Robot24 Field Team: run this whole file once in Supabase > SQL Editor.
-- If you ran an older version before, run reset.sql first.

create extension if not exists pg_trgm;

-- =====================================================================
-- Users, roles and the approver flag
-- =====================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'production' check (role in ('production','hr_finance','admin')),
  is_approver boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email) on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- Users who already exist get a profile too
insert into public.profiles (id, email) select id, email from auth.users on conflict do nothing;

create or replace function public.is_finance() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('hr_finance','admin'));
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_approver() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_approver);
$$;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- =====================================================================
-- Field team
-- =====================================================================
create sequence if not exists public.contractor_ref_seq start 1;

create table if not exists public.contractors (
  id uuid primary key default gen_random_uuid(),
  ref_code text,
  full_name text not null,
  aliases text[] not null default '{}',
  designation text,
  region text not null,
  city text,
  email text,
  phone text,
  wechat_id text,
  currency text not null default 'USD',
  day_rate numeric,
  ten_day_rate numeric,
  fifteen_day_rate numeric,
  payment_terms_days int,
  tshirt_status text,
  mic_sponge_status text,
  contract_signed boolean not null default false,
  bank_details text,
  notes text,
  address_line1 text,
  address_line2 text,
  address_city text,
  address_state text,
  address_postcode text,
  address_country text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists contractors_ref_code_key on public.contractors (upper(ref_code));
create index if not exists contractors_name_trgm on public.contractors using gin (full_name gin_trgm_ops);

create or replace function public.region_code(r text) returns text
language sql immutable as $$
  select case lower(coalesce(r, ''))
    when 'china' then 'CN' when 'united kingdom' then 'UK' when 'singapore' then 'SG'
    when 'united states' then 'US' when 'south korea' then 'KR' when 'central europe' then 'EU'
    when 'turkey' then 'TR' when 'canada' then 'CA'
    else upper(left(regexp_replace(coalesce(r, 'XX'), '[^A-Za-z]', '', 'g') || 'XX', 2))
  end;
$$;

create or replace function public.make_ref(r text) returns text
language sql volatile as $$
  select 'R24-' || public.region_code(r) || '-' || lpad(nextval('public.contractor_ref_seq')::text, 3, '0');
$$;

create or replace function public.assign_ref_code() returns trigger language plpgsql as $$
begin
  if new.ref_code is null or new.ref_code = '' then new.ref_code := public.make_ref(new.region);
  else new.ref_code := upper(trim(new.ref_code)); end if;
  return new;
end $$;

drop trigger if exists contractors_ref_code on public.contractors;
create trigger contractors_ref_code before insert on public.contractors
for each row execute function public.assign_ref_code();

-- HR and finance may only change address fields. Everything else is admin only.
create or replace function public.contractors_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  allowed text[] := array['address_line1','address_line2','address_city','address_state','address_postcode','address_country','updated_at'];
begin
  if auth.uid() is null or public.is_admin() or coalesce(current_setting('r24.system', true), '') = 'on' then
    return new;
  end if;
  if (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) then
    raise exception 'Only an admin can change these details. HR and finance can edit the address and upload documents.';
  end if;
  return new;
end $$;

drop trigger if exists contractors_guard on public.contractors;
create trigger contractors_guard before update on public.contractors
for each row execute function public.contractors_guard();

drop trigger if exists contractors_touch on public.contractors;
create trigger contractors_touch before update on public.contractors
for each row execute function public.touch_updated_at();

-- =====================================================================
-- Personnel documents: contracts, passports, IDs, visas
-- =====================================================================
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractors(id) on delete cascade,
  doc_type text not null check (doc_type in ('contract','passport','id_card','visa','bank','other')),
  file_path text not null,
  file_name text not null,
  is_signed boolean not null default false,
  signed_on date,
  expires_on date,
  notes text,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Uploading a signed contract marks the person as signed (so production sees it)
create or replace function public.documents_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.doc_type = 'contract' and new.is_signed then
    perform set_config('r24.system', 'on', true);
    update public.contractors set contract_signed = true where id = new.contractor_id;
    perform set_config('r24.system', 'off', true);
  end if;
  return new;
end $$;

drop trigger if exists documents_after_insert on public.documents;
create trigger documents_after_insert after insert on public.documents
for each row execute function public.documents_after_insert();

-- =====================================================================
-- Invoice uploads (one row per file dropped in)
-- =====================================================================
create table if not exists public.invoice_uploads (
  id uuid primary key default gen_random_uuid(),
  period date not null,
  file_path text not null,
  file_name text not null,
  content_type text,
  uploaded_by uuid references auth.users(id),
  uploaded_at timestamptz not null default now(),
  status text not null default 'processing'
    check (status in ('processing','processed','unmatched','needs_attention','duplicate','error','dismissed')),
  doc_type text,
  extracted jsonb,
  matched_contractor_id uuid references public.contractors(id) on delete set null,
  match_method text,
  match_confidence numeric,
  error text,
  payment_ids uuid[] not null default '{}'
);
create index if not exists invoice_uploads_period_idx on public.invoice_uploads (period);

-- =====================================================================
-- Payments: draft -> pending_approval -> approved -> paid (or rejected)
-- =====================================================================
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractors(id) on delete restrict,
  upload_id uuid references public.invoice_uploads(id) on delete set null,
  period date not null,
  kind text not null default 'fee' check (kind in ('fee','expense')),
  doc_type text,
  line_items jsonb not null default '[]',
  invoice_number text,
  description text,
  event_reference text,
  work_start date,
  work_end date,
  days_worked numeric,
  amount numeric not null,
  currency text not null default 'USD',
  expected_amount numeric,
  flag text,
  invoice_date date,
  due_date date,
  status text not null default 'draft'
    check (status in ('draft','pending_approval','approved','rejected','paid')),
  submitted_at timestamptz,
  approved_by uuid references auth.users(id),
  approved_by_email text,
  approved_at timestamptz,
  approval_note text,
  paid_on date,
  paid_reference text,
  invoice_file_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payments_period_idx on public.payments (period);
create index if not exists payments_status_idx on public.payments (status);
create index if not exists payments_contractor_idx on public.payments (contractor_id);

-- Enforces the approval flow inside the database
create or replace function public.payments_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  admin boolean := public.is_admin();
  approver boolean := public.is_approver();
begin
  if tg_op = 'INSERT' then
    new.status := 'draft';
    new.submitted_at := null; new.approved_by := null; new.approved_by_email := null;
    new.approved_at := null; new.approval_note := null; new.paid_on := null; new.paid_reference := null;
    return new;
  end if;

  -- Amounts lock once a bill is sent for approval
  if old.status in ('pending_approval','approved','paid') and not admin and (
       new.amount is distinct from old.amount or new.currency is distinct from old.currency
    or new.contractor_id is distinct from old.contractor_id or new.kind is distinct from old.kind
    or new.period is distinct from old.period) then
    raise exception 'This bill is locked because it was sent for approval. Withdraw it to draft first.';
  end if;

  if new.status is not distinct from old.status then
    new.approved_by := old.approved_by; new.approved_by_email := old.approved_by_email;
    new.approved_at := old.approved_at; new.submitted_at := old.submitted_at;
    if not admin then new.approval_note := old.approval_note; end if;
    return new;
  end if;

  if old.status in ('draft','rejected') and new.status = 'pending_approval' then
    new.submitted_at := now();
    new.approved_by := null; new.approved_by_email := null; new.approved_at := null;
  elsif old.status in ('pending_approval','rejected') and new.status = 'draft' then
    new.submitted_at := null;
  elsif old.status = 'pending_approval' and new.status in ('approved','rejected') then
    if not approver then raise exception 'Only an approver can approve or reject bills'; end if;
    new.approved_by := auth.uid();
    new.approved_by_email := (select email from public.profiles where id = auth.uid());
    new.approved_at := now();
  elsif old.status = 'approved' and new.status = 'pending_approval' then
    if not (approver or admin) then raise exception 'Only an approver or admin can undo an approval'; end if;
    new.approved_by := null; new.approved_by_email := null; new.approved_at := null;
  elsif old.status = 'approved' and new.status = 'paid' then
    if new.paid_on is null then new.paid_on := current_date; end if;
  elsif old.status = 'paid' and new.status = 'approved' then
    if not admin then raise exception 'Only an admin can undo a payment'; end if;
    new.paid_on := null; new.paid_reference := null;
  else
    raise exception 'A bill cannot move from % to %', old.status, new.status;
  end if;
  return new;
end $$;

drop trigger if exists payments_guard on public.payments;
create trigger payments_guard before insert or update on public.payments
for each row execute function public.payments_guard();

drop trigger if exists payments_touch on public.payments;
create trigger payments_touch before update on public.payments
for each row execute function public.touch_updated_at();

-- Approvers approve or reject, one bill or many at once
create or replace function public.decide_payments(p_ids uuid[], p_decision text, p_note text default null)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_approver() then raise exception 'Only an approver can do this'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'Decision must be approved or rejected'; end if;
  update public.payments set status = p_decision, approval_note = p_note
  where id = any(p_ids) and status = 'pending_approval';
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.decide_payments(uuid[], text, text) from public, anon;
grant execute on function public.decide_payments(uuid[], text, text) to authenticated;

-- What an approver sees: the bill, who it is for and their rate card. No bank or passport details.
create or replace function public.approval_queue(p_status text default 'pending_approval', p_period date default null)
returns table (
  id uuid, period date, kind text, doc_type text, invoice_number text, description text, event_reference text,
  days_worked numeric, amount numeric, currency text, expected_amount numeric, flag text, line_items jsonb,
  invoice_date date, due_date date, status text, invoice_file_path text, submitted_at timestamptz,
  approved_by_email text, approved_at timestamptz, approval_note text,
  contractor_id uuid, full_name text, ref_code text, region text, designation text,
  day_rate numeric, ten_day_rate numeric, fifteen_day_rate numeric, rate_currency text
)
language sql stable security definer set search_path = public as $$
  select p.id, p.period, p.kind, p.doc_type, p.invoice_number, p.description, p.event_reference,
         p.days_worked, p.amount, p.currency, p.expected_amount, p.flag, p.line_items,
         p.invoice_date, p.due_date, p.status, p.invoice_file_path, p.submitted_at,
         p.approved_by_email, p.approved_at, p.approval_note,
         c.id, c.full_name, c.ref_code, c.region, c.designation,
         c.day_rate, c.ten_day_rate, c.fifteen_day_rate, c.currency
  from public.payments p join public.contractors c on c.id = p.contractor_id
  where (public.is_approver() or public.is_finance())
    and p.status = p_status
    and (p_period is null or p.period = p_period)
  order by p.period desc, c.region, c.full_name
  limit 1000;
$$;
revoke execute on function public.approval_queue(text, date) from public, anon;
grant execute on function public.approval_queue(text, date) to authenticated;

-- =====================================================================
-- Production directory: contact details, kit and contract status only
-- =====================================================================
create or replace function public.directory()
returns table (
  id uuid, full_name text, designation text, region text, city text,
  email text, phone text, wechat_id text,
  tshirt_status text, mic_sponge_status text, contract_signed boolean
)
language sql stable security definer set search_path = public as $$
  select id, full_name, designation, region, city, email, phone, wechat_id,
         tshirt_status, mic_sponge_status, contract_signed
  from public.contractors
  where active and auth.uid() is not null
  order by region, full_name;
$$;
revoke execute on function public.directory() from public, anon;
grant execute on function public.directory() to authenticated;

-- Fuzzy name match used by the invoice reader (server only)
create or replace function public.match_contractor(q text)
returns table (id uuid, full_name text, score real)
language sql stable security definer set search_path = public as $$
  select c.id, c.full_name,
    greatest(
      similarity(lower(c.full_name), lower(q)),
      word_similarity(lower(c.full_name), lower(q)),
      word_similarity(lower(q), lower(c.full_name)),
      coalesce((select max(similarity(lower(a), lower(q))) from unnest(c.aliases) a), 0)
    )::real as score
  from public.contractors c
  where c.active
  order by score desc
  limit 3;
$$;
revoke execute on function public.match_contractor(text) from public, anon, authenticated;

-- =====================================================================
-- Row level security
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.contractors enable row level security;
alter table public.documents enable row level security;
alter table public.invoice_uploads enable row level security;
alter table public.payments enable row level security;

drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_finance() or public.is_admin());
drop policy if exists "profiles admin update" on public.profiles;
create policy "profiles admin update" on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "contractors read" on public.contractors;
create policy "contractors read" on public.contractors for select to authenticated using (public.is_finance());
drop policy if exists "contractors add" on public.contractors;
create policy "contractors add" on public.contractors for insert to authenticated with check (public.is_admin());
drop policy if exists "contractors edit" on public.contractors;
create policy "contractors edit" on public.contractors for update to authenticated
  using (public.is_finance()) with check (public.is_finance());
drop policy if exists "contractors delete" on public.contractors;
create policy "contractors delete" on public.contractors for delete to authenticated using (public.is_admin());

drop policy if exists "documents finance" on public.documents;
create policy "documents finance" on public.documents for all to authenticated
  using (public.is_finance()) with check (public.is_finance());

drop policy if exists "uploads finance" on public.invoice_uploads;
create policy "uploads finance" on public.invoice_uploads for all to authenticated
  using (public.is_finance()) with check (public.is_finance());

drop policy if exists "payments read" on public.payments;
create policy "payments read" on public.payments for select to authenticated using (public.is_finance());
drop policy if exists "payments add" on public.payments;
create policy "payments add" on public.payments for insert to authenticated with check (public.is_finance());
drop policy if exists "payments edit" on public.payments;
create policy "payments edit" on public.payments for update to authenticated
  using (public.is_finance()) with check (public.is_finance());
drop policy if exists "payments delete" on public.payments;
create policy "payments delete" on public.payments for delete to authenticated
  using (public.is_admin() or (public.is_finance() and status in ('draft','rejected')));

-- =====================================================================
-- File storage
-- =====================================================================
insert into storage.buckets (id, name, public) values
  ('invoices', 'invoices', false),
  ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists "finance read files" on storage.objects;
drop policy if exists "finance upload files" on storage.objects;
drop policy if exists "finance update files" on storage.objects;
drop policy if exists "finance delete files" on storage.objects;
drop policy if exists "r24 read files" on storage.objects;
drop policy if exists "r24 upload files" on storage.objects;
drop policy if exists "r24 update files" on storage.objects;
drop policy if exists "r24 delete files" on storage.objects;

create policy "r24 read files" on storage.objects for select to authenticated using (
  (bucket_id in ('invoices','documents') and public.is_finance())
  or (bucket_id = 'invoices' and public.is_approver())
);
create policy "r24 upload files" on storage.objects for insert to authenticated
  with check (bucket_id in ('invoices','documents') and public.is_finance());
create policy "r24 update files" on storage.objects for update to authenticated
  using (bucket_id in ('invoices','documents') and public.is_finance());
create policy "r24 delete files" on storage.objects for delete to authenticated
  using (bucket_id in ('invoices','documents') and public.is_finance());

-- =====================================================================
-- Live updates on the dashboard
-- =====================================================================
do $$
begin
  begin alter publication supabase_realtime add table public.payments; exception when others then null; end;
  begin alter publication supabase_realtime add table public.invoice_uploads; exception when others then null; end;
end $$;

-- ================= Update 4 (same as migration_004_photos_disputes.sql) =================
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

-- ================= Update 5 (same as migration_005_direct_costs.sql) =================
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

-- ================= Update 6 (same as migration_006_assignments.sql) =================
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

-- ================= Update 7 (same as migration_007_production_assignments.sql) =================
-- Update 7: production and the assignment team get the same access.
-- Both can see the directory, add assignments and record travel. Neither sees rates, bills or bank details.
-- Run once in Supabase > SQL Editor. Safe to run more than once.

create or replace function public.is_assignments() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('production','assignments','hr_finance','admin'));
$$;

-- One level from now on: anyone set to "assignments" becomes "production"
update public.profiles set role = 'production' where role = 'assignments';

-- ================= Update 8 (same as migration_008_audit_trail.sql) =================
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

-- ================= Update 9 (same as migration_009_exchange_rates.sql) =================
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

-- ================= Update 10 (same as migration_010_clean_currencies.sql) =================
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


-- ================= Update 11 (same as migration_011_booking_end_date.sql) =================
-- Update 11: hotel check-out and return flight dates on bookings made by Robot24.
-- Run once in Supabase > SQL Editor. Safe to run more than once.

alter table public.direct_costs add column if not exists end_date date;
alter table public.direct_costs drop constraint if exists direct_costs_end_after_start;
alter table public.direct_costs add constraint direct_costs_end_after_start
  check (end_date is null or travel_date is null or end_date >= travel_date);

notify pgrst, 'reload schema';

-- ================= Update 12 (same as migration_012_bills_to_jobs.sql) =================
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

-- ================= Update 13 (same as migration_013_shared_receipts.sql) =================
-- Update 13: shared receipts. One receipt split across several people is saved as one row per person,
-- tied together so reports count each share once and the full receipt total is still visible.
-- Run once in Supabase > SQL Editor. Safe to run more than once.

alter table public.direct_costs add column if not exists split_group uuid;
alter table public.direct_costs add column if not exists split_of int check (split_of is null or split_of >= 2);
alter table public.direct_costs add column if not exists split_total numeric check (split_total is null or split_total > 0);
create index if not exists direct_costs_split_idx on public.direct_costs (split_group);
create index if not exists direct_costs_booking_ref_idx on public.direct_costs (lower(booking_ref));

notify pgrst, 'reload schema';

-- ================= Update 14 (same as migration_014_staff_portal.sql) =================
-- Update 14: staff portal. Robot24's own employees: details, salaries, documents, visa status, payroll.
-- Separate from the field team. Only admins and people given Staff access can see any of it.
-- Run once in Supabase > SQL Editor. Safe to run more than once.

alter table public.profiles add column if not exists staff_access boolean not null default false;

create or replace function public.is_staff_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and (role = 'admin' or staff_access));
$$;

create sequence if not exists public.staff_no_seq start 1;

create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  staff_no text unique not null default ('R24-ST-' || lpad(nextval('public.staff_no_seq')::text, 3, '0')),
  full_name text not null,
  nationality text,
  passport_no text,
  passport_expiry date,
  date_of_birth date,
  gender text,
  place_of_birth text,
  job_title text,
  department text,
  location text not null default 'Dubai, United Arab Emirates',
  monthly_salary numeric check (monthly_salary is null or monthly_salary >= 0),
  currency text not null default 'AED' check (currency ~ '^[A-Z]{3}$'),
  start_date date,
  work_week text not null default 'mon_fri' check (work_week in ('mon_fri','mon_sat')),
  status text not null default 'offer' check (status in ('offer','active','terminated')),
  visa_status text not null default 'not_started' check (visa_status in ('not_started','entry_permit_applied','entry_permit_issued','medical_and_eid','residence_issued','own_visa','cancelled')),
  visa_expiry date,
  emirates_id_no text,
  emirates_id_expiry date,
  labour_card_no text,
  labour_card_expiry date,
  email text,
  phone text,
  termination_date date,
  termination_reason text,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (termination_date is null or start_date is null or termination_date >= start_date)
);
create index if not exists staff_status_idx on public.staff (status);

drop trigger if exists staff_touch on public.staff;
create trigger staff_touch before update on public.staff for each row execute function public.touch_updated_at();

create table if not exists public.staff_documents (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  doc_type text not null check (doc_type in ('passport','emirates_id','labour_card','mohre_contract','offer_letter','employment_contract','visa','other')),
  file_path text not null,
  file_name text,
  is_signed boolean not null default false,
  expires_on date,
  notes text,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists staff_documents_staff_idx on public.staff_documents (staff_id);

alter table public.staff enable row level security;
alter table public.staff_documents enable row level security;
drop policy if exists "staff admins" on public.staff;
drop policy if exists "staff documents admins" on public.staff_documents;
create policy "staff admins" on public.staff for all to authenticated using (public.is_staff_admin()) with check (public.is_staff_admin());
create policy "staff documents admins" on public.staff_documents for all to authenticated using (public.is_staff_admin()) with check (public.is_staff_admin());

-- Private file storage for staff documents
insert into storage.buckets (id, name, public) values ('staff', 'staff', false) on conflict (id) do nothing;
drop policy if exists "staff files read" on storage.objects;
drop policy if exists "staff files upload" on storage.objects;
drop policy if exists "staff files delete" on storage.objects;
create policy "staff files read" on storage.objects for select to authenticated using (bucket_id = 'staff' and public.is_staff_admin());
create policy "staff files upload" on storage.objects for insert to authenticated with check (bucket_id = 'staff' and public.is_staff_admin());
create policy "staff files delete" on storage.objects for delete to authenticated using (bucket_id = 'staff' and public.is_staff_admin());

-- Audit trail: staff changes are recorded like everything else
create or replace function public.audit_staff() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_changes jsonb := '{}'::jsonb;
  v_skip text[] := array['updated_at','created_at','id'];
  v_name text;
  k text;
begin
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(v_new) loop
      continue when k = any(v_skip);
      if (v_new->k) is distinct from (v_old->k) then v_changes := v_changes || jsonb_build_object(k, jsonb_build_array(v_old->k, v_new->k)); end if;
    end loop;
    if v_changes = '{}'::jsonb then return null; end if;
  else
    v_changes := v_row - v_skip;
  end if;
  if tg_table_name = 'staff' then v_name := (v_row->>'full_name') || ' (' || coalesce(v_row->>'staff_no', '') || ')';
  else select full_name into v_name from public.staff where id = (v_row->>'staff_id')::uuid;
       v_name := coalesce(v_name, 'Removed staff member') || ' · ' || (v_row->>'doc_type') || ' ' || coalesce(v_row->>'file_name', '');
  end if;
  insert into public.audit_log (user_id, user_email, via, action, area, record_id, summary, changes)
  values (auth.uid(), (select email from public.profiles where id = auth.uid()), case when auth.uid() is null then 'system' else 'app' end,
          case tg_op when 'INSERT' then 'added' when 'UPDATE' then 'changed' else 'deleted' end,
          case tg_table_name when 'staff' then 'Staff' else 'Staff documents' end,
          nullif(v_row->>'id', '')::uuid, v_name, v_changes);
  return null;
end $$;
drop trigger if exists audit_staff on public.staff;
create trigger audit_staff after insert or update or delete on public.staff for each row execute function public.audit_staff();
drop trigger if exists audit_staff_documents on public.staff_documents;
create trigger audit_staff_documents after insert or update or delete on public.staff_documents for each row execute function public.audit_staff();

do $$ begin
  begin alter publication supabase_realtime add table public.staff; exception when others then null; end;
end $$;

notify pgrst, 'reload schema';

-- ================= Update 15 (same as migration_015_payroll_approval.sql) =================
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

-- ================= Update 16 (same as migration_016_staff_for_hr_finance.sql) =================
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

-- ================= Update 17 (same as migration_017_ai_and_guardrails.sql) =================
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

-- ================= Update 18 (same as migration_018_staff_visa_insurance_wps.sql) =================
-- Update 18: who sponsors each employee's visa, who covers their medical insurance, and whether they are paid through WPS.
-- Also a "Not recorded yet" visa status, for company visas whose stage has not been entered.
-- Run once in Supabase > SQL Editor. Safe to run more than once.

alter table public.staff add column if not exists visa_sponsor text check (visa_sponsor is null or visa_sponsor in ('company','own'));
alter table public.staff add column if not exists insurance_by text check (insurance_by is null or insurance_by in ('company','own'));
alter table public.staff add column if not exists wps boolean not null default false;

alter table public.staff drop constraint if exists staff_visa_status_check;
alter table public.staff add constraint staff_visa_status_check check (visa_status in ('unknown','not_started','entry_permit_applied','entry_permit_issued','medical_and_eid','residence_issued','own_visa','cancelled'));

notify pgrst, 'reload schema';

-- ================= Update 19 (same as migration_019_own_visa_types.sql) =================
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

-- ================= Update 20 (same as migration_020_staff_hr_finance_only.sql) =================
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

-- ================= Update 21 (same as migration_021_leave_and_my_robot24.sql) =================
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

-- ================= Update 22 (same as migration_022_org_chart_manager_leave.sql) =================
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

-- ================= Update 23 =================

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
