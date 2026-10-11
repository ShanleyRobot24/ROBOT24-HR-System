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
