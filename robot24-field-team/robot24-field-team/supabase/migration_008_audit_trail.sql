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
