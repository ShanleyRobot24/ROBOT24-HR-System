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
