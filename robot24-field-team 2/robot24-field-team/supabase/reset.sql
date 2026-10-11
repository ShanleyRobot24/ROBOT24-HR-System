-- ONLY run this if you ran an older version of schema.sql before.
-- It deletes all app tables and data so the new schema.sql can be run cleanly.
-- Login accounts in Authentication > Users are kept.

drop trigger if exists on_auth_user_created on auth.users;

drop table if exists public.payroll_runs cascade;
drop table if exists public.staff_documents cascade;
drop table if exists public.staff cascade;
drop sequence if exists public.staff_no_seq;
drop table if exists public.fx_rates cascade;
drop table if exists public.audit_log cascade;
drop table if exists public.direct_costs cascade;
drop table if exists public.assignments cascade;
drop table if exists public.payments cascade;
drop table if exists public.inbound_emails cascade;
drop table if exists public.invoice_uploads cascade;
drop table if exists public.contracts cascade;
drop table if exists public.documents cascade;
drop table if exists public.contractors cascade;
drop table if exists public.profiles cascade;

drop function if exists public.directory() cascade;
drop function if exists public.match_contractor(text) cascade;
drop function if exists public.approval_queue(text, date) cascade;
drop function if exists public.decide_payments(uuid[], text, text) cascade;
drop function if exists public.is_finance() cascade;
drop function if exists public.is_admin() cascade;
drop function if exists public.is_approver() cascade;
drop function if exists public.is_assignments() cascade;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.audit_row() cascade;
drop function if exists public.audit_fx() cascade;
drop function if exists public.touch_updated_at() cascade;
drop function if exists public.assign_ref_code() cascade;
drop function if exists public.make_ref(text) cascade;
drop function if exists public.region_code(text) cascade;
drop function if exists public.contractors_guard() cascade;
drop function if exists public.payments_guard() cascade;
drop function if exists public.documents_after_insert() cascade;
drop sequence if exists public.contractor_ref_seq;
