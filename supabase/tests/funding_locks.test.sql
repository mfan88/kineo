-- Funding lock and send-rule tests (F2): Bill to is locked once sent, and a draft
-- can't be sent while its Bill to or line dates are incomplete. The messages must
-- match @kineo/shared billToProblems word for word. pgTAP, run by `pnpm test:db`.
-- One transaction, rolled back. Made-up data only.

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(18);

-- UUID groups: …1xx patient, …2xx funding type and funding, …3xx invoices,
-- …4xx visits, …5xx lines, …6xx detail ids.
insert into public.patients (id, owner_id, full_name) values
  ('00000000-0000-4000-8000-000000000101', 'user_test_a', 'Test Patient');
insert into public.funding_types (id, owner_id, name, recipient_name, recipient_address, details) values
  ('00000000-0000-4000-8000-000000000201', 'user_test_a', 'Test Funding', 'Test Funding Branch',
   E'PO Box 1\nTestville BC V0V 0V0',
   '[{"id": "00000000-0000-4000-8000-000000000601", "label": "Billing number", "kind": "text", "show_on_invoice": true}]');
insert into public.patient_fundings (id, owner_id, patient_id, funding_type_id, detail_values) values
  ('00000000-0000-4000-8000-000000000202', 'user_test_a', '00000000-0000-4000-8000-000000000101',
   '00000000-0000-4000-8000-000000000201', '{"00000000-0000-4000-8000-000000000601": "4821"}');

-- A funded draft with everything filled in except what each test removes, and a
-- self-pay draft saved without a name.
insert into public.invoices (id, owner_id, patient_id, number, bill_to_kind, bill_to_name,
                             bill_to_address, bill_to_funding_name, patient_funding_id, bill_to_details)
values ('00000000-0000-4000-8000-000000000301', 'user_test_a', '00000000-0000-4000-8000-000000000101', 1,
        'funding', 'Test Funding Branch', E'PO Box 1\nTestville BC V0V 0V0', 'Test Funding',
        '00000000-0000-4000-8000-000000000202',
        '[{"id": "00000000-0000-4000-8000-000000000601", "label": "Billing number", "value": "4821"}]');
insert into public.invoices (id, owner_id, patient_id, number) values
  ('00000000-0000-4000-8000-000000000302', 'user_test_a', '00000000-0000-4000-8000-000000000101', 2);
insert into public.visits (id, owner_id, patient_id, visit_date, note, invoice_id) values
  ('00000000-0000-4000-8000-000000000401', 'user_test_a', '00000000-0000-4000-8000-000000000101',
   '2026-11-04', 'Made-up note.', '00000000-0000-4000-8000-000000000301'),
  ('00000000-0000-4000-8000-000000000402', 'user_test_a', '00000000-0000-4000-8000-000000000101',
   '2026-11-12', 'Made-up note.', '00000000-0000-4000-8000-000000000301');
insert into public.invoice_lines (id, owner_id, invoice_id, name, unit_price_cents, quantity, position, service_date) values
  ('00000000-0000-4000-8000-000000000501', 'user_test_a', '00000000-0000-4000-8000-000000000301',
   'Physiotherapy, 60 min', 11000, 1, 0, '2026-11-04'),
  ('00000000-0000-4000-8000-000000000502', 'user_test_a', '00000000-0000-4000-8000-000000000301',
   'Physiotherapy, 60 min', 11000, 1, 1, '2026-11-12');

-- Labels in messages ----------------------------------------------------------

select is(public.sentence_label('Billing number'), 'billing number', 'a label is lower-cased in a sentence');
select is(public.sentence_label('ICBC claim number'), 'ICBC claim number', 'a label starting with an acronym is kept');
select is(public.sentence_label('A'), 'A', 'a one-letter label is kept');

-- A self-pay invoice saved without a name ----------------------------------------

select is(
  (select bill_to_name from public.invoices where id = '00000000-0000-4000-8000-000000000302'),
  'Test Patient',
  'a self-pay invoice saved without a name bills the patient by name'
);

-- Send checks, in order ------------------------------------------------------------

create function pg_temp.send_funded()
returns void
language sql
as $$
  update public.invoices set status = 'sent', sent_at = now()
   where id = '00000000-0000-4000-8000-000000000301';
$$;

update public.invoices set bill_to_name = '', bill_to_address = ' '
 where id = '00000000-0000-4000-8000-000000000301';
select throws_ok(
  'select pg_temp.send_funded()',
  '23514', 'Test Funding has no recipient name or address. Add them in Settings, then send.',
  'sending is refused without a recipient name or address'
);

update public.invoices set bill_to_address = E'PO Box 1\nTestville BC V0V 0V0'
 where id = '00000000-0000-4000-8000-000000000301';
select throws_ok(
  'select pg_temp.send_funded()',
  '23514', 'Test Funding has no recipient name. Add it in Settings, then send.',
  'sending is refused without a recipient name'
);

update public.invoices set bill_to_name = 'Test Funding Branch', bill_to_address = ''
 where id = '00000000-0000-4000-8000-000000000301';
select throws_ok(
  'select pg_temp.send_funded()',
  '23514', 'Test Funding has no recipient address. Add it in Settings, then send.',
  'sending is refused without a recipient address'
);

update public.invoices
   set bill_to_address = E'PO Box 1\nTestville BC V0V 0V0',
       bill_to_details = '[{"id": "00000000-0000-4000-8000-000000000601", "label": "Billing number", "value": "  "},
                           {"id": "00000000-0000-4000-8000-000000000602", "label": "Claim number", "value": ""}]'
 where id = '00000000-0000-4000-8000-000000000301';
select throws_ok(
  'select pg_temp.send_funded()',
  '23514', 'Add the billing number before sending.',
  'sending is refused while a shown detail is empty, naming the first one'
);

update public.invoices
   set bill_to_details = '[{"id": "00000000-0000-4000-8000-000000000601", "label": "Billing number", "value": "4821"}]'
 where id = '00000000-0000-4000-8000-000000000301';
update public.invoice_lines set service_date = null
 where id = '00000000-0000-4000-8000-000000000502';
select throws_ok(
  'select pg_temp.send_funded()',
  '23514', 'Pick a visit date for each line item before sending.',
  'sending is refused while a line has no visit date'
);

update public.invoice_lines set service_date = '2026-11-20'
 where id = '00000000-0000-4000-8000-000000000502';
select throws_ok(
  'select pg_temp.send_funded()',
  '23514', 'Pick a visit date for each line item before sending.',
  'sending is refused while a line''s date isn''t one of the invoice''s visits'
);

update public.invoices set bill_to_name = ' '
 where id = '00000000-0000-4000-8000-000000000302';
select throws_ok(
  $$update public.invoices set status = 'sent', sent_at = now()
     where id = '00000000-0000-4000-8000-000000000302'$$,
  '23514', 'Add the patient''s name before sending.',
  'a self-pay invoice without a name can''t be sent'
);

-- Complete, it sends -------------------------------------------------------------

update public.invoice_lines set service_date = '2026-11-12'
 where id = '00000000-0000-4000-8000-000000000502';
select lives_ok('select pg_temp.send_funded()', 'a complete funded draft can be sent');

-- Locked once sent ---------------------------------------------------------------

select lives_ok(
  $$update public.invoices set bill_to_name = 'Test Patient'
     where id = '00000000-0000-4000-8000-000000000302'$$,
  'Bill to can be changed on a draft'
);
select throws_ok(
  $$update public.invoices set bill_to_name = 'Someone else'
     where id = '00000000-0000-4000-8000-000000000301'$$,
  '23514', 'Bill to can''t be changed once an invoice is sent.',
  'Bill to can''t be changed once sent'
);
select throws_ok(
  $$update public.invoices set bill_to_details = '[]'::jsonb
     where id = '00000000-0000-4000-8000-000000000301'$$,
  '23514', 'Bill to can''t be changed once an invoice is sent.',
  'the details on a sent invoice can''t be changed'
);
select throws_ok(
  $$update public.invoice_lines set service_date = '2026-11-04'
     where id = '00000000-0000-4000-8000-000000000502'$$,
  '23514', 'Line items can''t be changed once an invoice is sent.',
  'a sent invoice''s line dates can''t be changed'
);

-- Deleting the funding behind a sent invoice only clears the link.
select lives_ok(
  $$delete from public.patient_fundings where id = '00000000-0000-4000-8000-000000000202'$$,
  'the funding behind a sent invoice can be deleted'
);
select is(
  (select coalesce(patient_funding_id::text, 'null') || ' · ' || (bill_to_details -> 0 ->> 'value')
     from public.invoices where id = '00000000-0000-4000-8000-000000000301'),
  'null · 4821',
  'the sent invoice keeps its copy, with the link cleared'
);

select * from finish();
rollback;
