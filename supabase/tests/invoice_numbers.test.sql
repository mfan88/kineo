-- Invoice number tests (N2): numbers built from parts match @kineo/shared, the
-- settings refuse what the apps never offer, create_invoice honours the starting
-- number, and a sent invoice keeps the number it was sent with.
-- pgTAP, run by `pnpm test:db`. One transaction, rolled back. Made-up data only.

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(30);

-- Settings for building numbers in the parity checks, as a row value.
create function pg_temp.settings(
  prefix text,
  order_text text,
  show_prefix boolean,
  show_year boolean,
  show_month boolean,
  separator text,
  digits integer
)
returns public.practice_settings
language sql
as $$
  select jsonb_populate_record(null::public.practice_settings, jsonb_build_object(
    'owner_id', 'user_test_parity',
    'invoice_number_prefix', prefix,
    'invoice_number_order', order_text,
    'invoice_number_show_prefix', show_prefix,
    'invoice_number_show_year', show_year,
    'invoice_number_show_month', show_month,
    'invoice_number_separator', separator,
    'invoice_number_digits', digits
  ));
$$;

-- 1–9. The same cases as buildInvoiceNumber's tests in @kineo/shared.
select is(build_invoice_number(pg_temp.settings('INV', 'prefix,year,month,number', true, false, false, '-', 4), 42, '2026-11-13'),
  'INV-0042', 'prefix and number');
select is(build_invoice_number(pg_temp.settings('INV', 'prefix,year,month,number', true, true, false, '-', 4), 42, '2026-11-13'),
  'INV-2026-0042', 'prefix, year and number');
select is(build_invoice_number(pg_temp.settings('INV', 'year,month,prefix,number', true, true, true, '/', 4), 42, '2026-03-01'),
  '2026/03/INV/0042', 'parts in another order with a slash');
select is(build_invoice_number(pg_temp.settings('INV', 'prefix,year,month,number', true, false, false, '-', 3), 7, '2026-11-13'),
  'INV-007', 'three digits');
select is(build_invoice_number(pg_temp.settings('INV', 'prefix,year,month,number', true, false, false, '-', 1), 7, '2026-11-13'),
  'INV-7', 'no padding');
select is(build_invoice_number(pg_temp.settings('INV', 'prefix,year,month,number', true, false, false, '-', 3), 12345, '2026-11-13'),
  'INV-12345', 'a longer number in full');
select is(build_invoice_number(pg_temp.settings('', 'prefix,year,month,number', true, false, false, '-', 4), 1, '2026-11-13'),
  '0001', 'an empty prefix is left out with its separator');
select is(build_invoice_number(pg_temp.settings('INV', 'prefix,year,month,number', false, true, false, '-', 4), 1, '2026-11-13'),
  '2026-0001', 'a hidden prefix is left out');
select is(build_invoice_number(pg_temp.settings('INV', 'prefix,year,month,number', true, true, true, '', 4), 5, '2026-11-13'),
  'INV2026110005', 'no separator');

-- 10. With no settings row at all, the defaults apply.
select is(build_invoice_number(null::public.practice_settings, 3, '2026-11-13'),
  '0003', 'no settings: four digits');

-- User A: a patient with three visits and settings that carry on from 1250.
insert into public.patients (id, owner_id, full_name) values
  ('00000000-0000-4000-8000-0000000000a1', 'user_test_a', 'Test Patient One');
insert into public.visits (id, owner_id, patient_id, visit_date) values
  ('00000000-0000-4000-8000-0000000001a1', 'user_test_a', '00000000-0000-4000-8000-0000000000a1', '2026-11-01'),
  ('00000000-0000-4000-8000-0000000001a2', 'user_test_a', '00000000-0000-4000-8000-0000000000a1', '2026-11-02'),
  ('00000000-0000-4000-8000-0000000001a3', 'user_test_a', '00000000-0000-4000-8000-0000000000a1', '2026-11-03');
insert into public.practice_settings
  (owner_id, invoice_number_prefix, invoice_number_show_year, invoice_number_start)
values ('user_test_a', 'INV', true, 1250);

-- 11–15. The settings refuse what the apps never offer.
select throws_ok(
  $$update public.practice_settings set invoice_number_order = 'prefix,year,number' where owner_id = 'user_test_a'$$,
  '23514', null, 'the order needs all four parts');
select throws_ok(
  $$update public.practice_settings set invoice_number_order = 'prefix,year,year,number' where owner_id = 'user_test_a'$$,
  '23514', null, 'each part once');
select throws_ok(
  $$update public.practice_settings set invoice_number_separator = '#' where owner_id = 'user_test_a'$$,
  '23514', null, 'only the offered separators');
select throws_ok(
  $$update public.practice_settings set invoice_number_digits = 7 where owner_id = 'user_test_a'$$,
  '23514', null, 'at most six digits');
select throws_ok(
  $$update public.practice_settings set invoice_number_start = 0 where owner_id = 'user_test_a'$$,
  '23514', null, 'a starting number of at least 1');

-- Runs create_invoice as user A and returns the number it gave.
create function pg_temp.create_as_a(id text, proposed int, visit text)
returns integer
language plpgsql
as $$
declare
  result integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"user_test_a","role":"authenticated"}', true);
  select public.create_invoice(id::uuid, '00000000-0000-4000-8000-0000000000a1', proposed, 0,
    array[visit::uuid], now(), null::jsonb) into result;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return result;
end;
$$;

-- 16–18. A device that doesn't know the starting number yet still gets 1250; after
-- that, numbers carry on, and one below the start is moved up.
select is(pg_temp.create_as_a('00000000-0000-4000-8000-0000000002a1', 1, '00000000-0000-4000-8000-0000000001a1'),
  1250, 'the first invoice starts at the starting number');
select is(pg_temp.create_as_a('00000000-0000-4000-8000-0000000002a2', 1251, '00000000-0000-4000-8000-0000000001a2'),
  1251, 'the next free number is kept');
select is(pg_temp.create_as_a('00000000-0000-4000-8000-0000000002a3', 7, '00000000-0000-4000-8000-0000000001a3'),
  1252, 'a number below the start is replaced with the next free one');

-- 19. A draft has no fixed number, even if an app sends one.
update public.invoices set display_number = 'INV-2026-1250'
 where id = '00000000-0000-4000-8000-0000000002a1';
select is((select display_number from public.invoices where id = '00000000-0000-4000-8000-0000000002a1'),
  null, 'a draft has no saved number');

-- 20. Sending keeps the number the app worked out.
update public.invoices set status = 'sent', sent_at = '2026-11-13T18:00:00Z',
       display_number = 'INV-2026-1250'
 where id = '00000000-0000-4000-8000-0000000002a1';
select is((select display_number from public.invoices where id = '00000000-0000-4000-8000-0000000002a1'),
  'INV-2026-1250', 'sending saves the number');

-- 21. An app that doesn't send it gets one from the settings and the sent date.
update public.invoices set status = 'sent', sent_at = '2026-12-02T18:00:00Z'
 where id = '00000000-0000-4000-8000-0000000002a2';
select is((select display_number from public.invoices where id = '00000000-0000-4000-8000-0000000002a2'),
  'INV-2026-1251', 'the server fills in a missing number');

-- 22–23. Once sent, the number stays, whatever the settings say later.
select throws_ok(
  $$update public.invoices set display_number = 'INV-9999' where id = '00000000-0000-4000-8000-0000000002a1'$$,
  '23514', 'An invoice''s number can''t be changed once it''s sent.', 'a sent number is locked');
update public.practice_settings set invoice_number_prefix = 'NEW', invoice_number_digits = 6
 where owner_id = 'user_test_a';
select is((select display_number from public.invoices where id = '00000000-0000-4000-8000-0000000002a1'),
  'INV-2026-1250', 'changing the settings leaves a sent number alone');

-- 24–26. Paying, undoing the payment and cancelling keep it too.
update public.invoices set status = 'paid', paid_at = now()
 where id = '00000000-0000-4000-8000-0000000002a1';
select is((select display_number from public.invoices where id = '00000000-0000-4000-8000-0000000002a1'),
  'INV-2026-1250', 'paid keeps the number');
update public.invoices set status = 'sent', paid_at = null
 where id = '00000000-0000-4000-8000-0000000002a1';
select is((select display_number from public.invoices where id = '00000000-0000-4000-8000-0000000002a1'),
  'INV-2026-1250', 'undoing the payment keeps the number');
update public.invoices set status = 'cancelled', cancelled_at = now(), cancelled_visit_dates = '["2026-11-01"]'
 where id = '00000000-0000-4000-8000-0000000002a1';
select is((select display_number from public.invoices where id = '00000000-0000-4000-8000-0000000002a1'),
  'INV-2026-1250', 'cancelling keeps the number');

-- 27. The third invoice, sent with no number, uses the new settings.
update public.invoices set status = 'sent', sent_at = '2026-11-13T18:00:00Z'
 where id = '00000000-0000-4000-8000-0000000002a3';
select is((select display_number from public.invoices where id = '00000000-0000-4000-8000-0000000002a3'),
  'NEW-2026-001252', 'a later send uses the settings of the time');

-- 28. An invoice made already sent (as the seed does) gets a number.
insert into public.invoices (id, owner_id, patient_id, number, status, sent_at) values
  ('00000000-0000-4000-8000-0000000002a4', 'user_test_a', '00000000-0000-4000-8000-0000000000a1',
   1300, 'sent', '2026-11-13T18:00:00Z');
select is((select display_number from public.invoices where id = '00000000-0000-4000-8000-0000000002a4'),
  'NEW-2026-001300', 'an invoice saved as sent gets a number');

-- 29–30. A blank number is filled in, and a draft made with one drops it.
insert into public.invoices (id, owner_id, patient_id, number, status, sent_at, display_number) values
  ('00000000-0000-4000-8000-0000000002a5', 'user_test_a', '00000000-0000-4000-8000-0000000000a1',
   1301, 'sent', '2026-11-13T18:00:00Z', '   ');
select is((select display_number from public.invoices where id = '00000000-0000-4000-8000-0000000002a5'),
  'NEW-2026-001301', 'a blank number is filled in');
insert into public.invoices (id, owner_id, patient_id, number, display_number) values
  ('00000000-0000-4000-8000-0000000002a6', 'user_test_a', '00000000-0000-4000-8000-0000000000a1', 1302, 'X-1');
select is((select display_number from public.invoices where id = '00000000-0000-4000-8000-0000000002a6'),
  null, 'a new draft has no saved number');

select * from finish();
rollback;
