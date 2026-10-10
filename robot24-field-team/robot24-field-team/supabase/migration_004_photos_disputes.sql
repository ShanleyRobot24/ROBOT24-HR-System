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
