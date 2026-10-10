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
