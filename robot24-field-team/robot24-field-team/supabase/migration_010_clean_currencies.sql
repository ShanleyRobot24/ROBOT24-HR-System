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
