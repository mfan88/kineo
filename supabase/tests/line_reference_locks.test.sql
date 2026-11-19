-- Line reference lock tests (MAR-42): on sent, paid, or cancelled invoices,
-- lines cannot be repointed to a different visit or price item, but clearing
-- to null (including on delete set null cascades) is allowed. On draft invoices,
-- repointing is freely allowed.
-- pgTAP, run by `pnpm test:db`. One transaction, rolled back. Made-up data only.

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(15);

-- One practitioner, one patient, three price items, four invoices (draft, sent,
-- paid, cancelled), five visits, and invoice lines.
-- UUID groups:
--   ...0xx patient
--   ...1xx price items
--   ...2xx invoices
--   ...3xx invoice lines
--   ...4xx visits

insert into public.patients (id, owner_id, full_name, email, phone) values
  ('00000000-0000-4000-8000-000000000001', 'user_test_a', 'Jordan Example', 'test@example.com', '604-555-0100');

insert into public.price_items (id, owner_id, name, unit_price_cents) values
  ('00000000-0000-4000-8000-000000000101', 'user_test_a', 'Initial assessment', 12000),
  ('00000000-0000-4000-8000-000000000102', 'user_test_a', 'Subsequent treatment', 9000),
  ('00000000-0000-4000-8000-000000000103', 'user_test_a', 'Acupuncture', 6000);

insert into public.invoices (id, owner_id, patient_id, number) values
  ('00000000-0000-4000-8000-000000000201', 'user_test_a', '00000000-0000-4000-8000-000000000001', 1),
  ('00000000-0000-4000-8000-000000000202', 'user_test_a', '00000000-0000-4000-8000-000000000001', 2),
  ('00000000-0000-4000-8000-000000000203', 'user_test_a', '00000000-0000-4000-8000-000000000001', 3),
  ('00000000-0000-4000-8000-000000000204', 'user_test_a', '00000000-0000-4000-8000-000000000001', 4);

insert into public.visits (id, owner_id, patient_id, visit_date, note, invoice_id) values
  ('00000000-0000-4000-8000-000000000401', 'user_test_a', '00000000-0000-4000-8000-000000000001',
   '2026-11-01', 'Draft visit note.', '00000000-0000-4000-8000-000000000201'),
  ('00000000-0000-4000-8000-000000000402', 'user_test_a', '00000000-0000-4000-8000-000000000001',
   '2026-11-02', 'Sent visit note.', '00000000-0000-4000-8000-000000000202'),
  ('00000000-0000-4000-8000-000000000403', 'user_test_a', '00000000-0000-4000-8000-000000000001',
   '2026-11-03', 'Paid visit note.', '00000000-0000-4000-8000-000000000203'),
  ('00000000-0000-4000-8000-000000000404', 'user_test_a', '00000000-0000-4000-8000-000000000001',
   '2026-11-04', 'Ready to invoice visit.', null),
  ('00000000-0000-4000-8000-000000000405', 'user_test_a', '00000000-0000-4000-8000-000000000001',
   '2026-11-05', 'Cancelled visit note.', '00000000-0000-4000-8000-000000000204');

insert into public.invoice_lines (id, owner_id, invoice_id, price_item_id, visit_id, name, unit_price_cents, quantity) values
  ('00000000-0000-4000-8000-000000000301', 'user_test_a', '00000000-0000-4000-8000-000000000201',
   '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000401', 'Initial assessment', 12000, 1),
  ('00000000-0000-4000-8000-000000000302', 'user_test_a', '00000000-0000-4000-8000-000000000202',
   '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000402', 'Initial assessment', 12000, 1),
  ('00000000-0000-4000-8000-000000000303', 'user_test_a', '00000000-0000-4000-8000-000000000202',
   '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000402', 'Initial assessment', 12000, 1),
  ('00000000-0000-4000-8000-000000000304', 'user_test_a', '00000000-0000-4000-8000-000000000202',
   '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000402', 'Initial assessment', 12000, 1),
  ('00000000-0000-4000-8000-000000000305', 'user_test_a', '00000000-0000-4000-8000-000000000202',
   '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000402', 'Initial assessment', 12000, 1),
  ('00000000-0000-4000-8000-000000000306', 'user_test_a', '00000000-0000-4000-8000-000000000202',
   '00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000402', 'Acupuncture', 6000, 1),
  ('00000000-0000-4000-8000-000000000307', 'user_test_a', '00000000-0000-4000-8000-000000000202',
   '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000402', 'Initial assessment', 12000, 1),
  ('00000000-0000-4000-8000-000000000308', 'user_test_a', '00000000-0000-4000-8000-000000000203',
   '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000403', 'Initial assessment', 12000, 1),
  ('00000000-0000-4000-8000-000000000309', 'user_test_a', '00000000-0000-4000-8000-000000000204',
   '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000405', 'Initial assessment', 12000, 1);

-- Move invoice 2 to sent, invoice 3 to paid, and invoice 4 to cancelled.
update public.invoices set status = 'sent', sent_at = now()
  where id in ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000204');
update public.invoices set status = 'paid', paid_at = now()
  where id = '00000000-0000-4000-8000-000000000203';
update public.invoices set status = 'cancelled', cancelled_at = now(), cancelled_visit_dates = '["2026-11-05"]'::jsonb
  where id = '00000000-0000-4000-8000-000000000204';

-- Release visit 5 from cancelled invoice 4 so it is back in Ready to invoice (invoice_id is null),
-- while line 309 on invoice 4 still has visit_id pointing at visit 5.
update public.visits set invoice_id = null where id = '00000000-0000-4000-8000-000000000405';

-- Run assertions as authenticated user A
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_test_a","role":"authenticated"}', true);

-- 1. Sent invoice — repoint visit_id throws
select throws_ok(
  $$update public.invoice_lines set visit_id = '00000000-0000-4000-8000-000000000404'
    where id = '00000000-0000-4000-8000-000000000302'$$,
  '23514', 'Line items can''t be changed once an invoice is sent.',
  'repointing visit_id on a sent invoice throws'
);

-- 2. Sent invoice — repoint price_item_id throws
select throws_ok(
  $$update public.invoice_lines set price_item_id = '00000000-0000-4000-8000-000000000102'
    where id = '00000000-0000-4000-8000-000000000303'$$,
  '23514', 'Line items can''t be changed once an invoice is sent.',
  'repointing price_item_id on a sent invoice throws'
);

-- 3. Paid invoice — repoint visit_id throws
select throws_ok(
  $$update public.invoice_lines set visit_id = '00000000-0000-4000-8000-000000000404'
    where id = '00000000-0000-4000-8000-000000000308'$$,
  '23514', 'Line items can''t be changed once an invoice is sent.',
  'repointing visit_id on a paid invoice throws'
);

-- 4. Sent invoice — clearing to null succeeds
select lives_ok(
  $$update public.invoice_lines set visit_id = null where id = '00000000-0000-4000-8000-000000000304'$$,
  'clearing visit_id to null on a sent invoice line succeeds'
);
select is(
  (select visit_id from public.invoice_lines where id = '00000000-0000-4000-8000-000000000304'),
  null,
  'visit_id on sent invoice line is now null'
);
select lives_ok(
  $$update public.invoice_lines set price_item_id = null where id = '00000000-0000-4000-8000-000000000305'$$,
  'clearing price_item_id to null on a sent invoice line succeeds'
);
select is(
  (select price_item_id from public.invoice_lines where id = '00000000-0000-4000-8000-000000000305'),
  null,
  'price_item_id on sent invoice line is now null'
);

-- 5. Cancelled / sent invoice — cascading on delete set null succeeds
-- 5a. Cancelled invoice: deleting released visit sets line's visit_id to null
select lives_ok(
  $$delete from public.visits where id = '00000000-0000-4000-8000-000000000405'$$,
  'deleting a released visit whose line is on a cancelled invoice succeeds'
);
select is(
  (select visit_id from public.invoice_lines where id = '00000000-0000-4000-8000-000000000309'),
  null,
  'visit_id on cancelled invoice line cascaded to null'
);

-- 5b. Sent invoice: deleting price item sets line's price_item_id to null
select lives_ok(
  $$delete from public.price_items where id = '00000000-0000-4000-8000-000000000103'$$,
  'deleting a price item referenced by a sent invoice line succeeds'
);
select is(
  (select price_item_id from public.invoice_lines where id = '00000000-0000-4000-8000-000000000306'),
  null,
  'price_item_id on sent invoice line cascaded to null'
);

-- 6. Sent invoice — clearing visit_id while also changing name throws
select throws_ok(
  $$update public.invoice_lines set visit_id = null, name = 'Changed'
    where id = '00000000-0000-4000-8000-000000000307'$$,
  '23514', 'Line items can''t be changed once an invoice is sent.',
  'clearing visit_id while modifying name on a sent invoice line throws'
);

-- 7. Draft invoice — repointing visit_id and price_item_id still succeeds
select lives_ok(
  $$update public.invoice_lines
       set visit_id = '00000000-0000-4000-8000-000000000404',
           price_item_id = '00000000-0000-4000-8000-000000000102'
     where id = '00000000-0000-4000-8000-000000000301'$$,
  'repointing visit_id and price_item_id on a draft invoice line succeeds'
);
select is(
  (select visit_id from public.invoice_lines where id = '00000000-0000-4000-8000-000000000301'),
  '00000000-0000-4000-8000-000000000404'::uuid,
  'new visit_id is stored on draft invoice line'
);
select is(
  (select price_item_id from public.invoice_lines where id = '00000000-0000-4000-8000-000000000301'),
  '00000000-0000-4000-8000-000000000102'::uuid,
  'new price_item_id is stored on draft invoice line'
);

reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
