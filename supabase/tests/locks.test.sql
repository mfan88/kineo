-- Invoice lock tests: the server refuses changes the rules don't allow, whichever
-- app (or person) makes them. pgTAP, run by `pnpm test:db`. One transaction,
-- rolled back. Made-up data only.

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(24);

-- One practitioner, one patient, a price item, and three invoices (draft, sent,
-- paid), each with a line and a visit. UUID groups: …1xx patient/items,
-- …2xx invoices, …3xx lines, …4xx visits.
insert into public.patients (id, owner_id, full_name) values
  ('00000000-0000-4000-8000-000000000101', 'user_test_a', 'Test Patient');
insert into public.price_items (id, owner_id, name, unit_price_cents) values
  ('00000000-0000-4000-8000-000000000102', 'user_test_a', 'Assessment', 12000);
insert into public.invoices (id, owner_id, patient_id, number) values
  ('00000000-0000-4000-8000-000000000201', 'user_test_a', '00000000-0000-4000-8000-000000000101', 1),
  ('00000000-0000-4000-8000-000000000202', 'user_test_a', '00000000-0000-4000-8000-000000000101', 2),
  ('00000000-0000-4000-8000-000000000203', 'user_test_a', '00000000-0000-4000-8000-000000000101', 3);
insert into public.invoice_lines (id, owner_id, invoice_id, price_item_id, name, unit_price_cents, quantity) values
  ('00000000-0000-4000-8000-000000000301', 'user_test_a', '00000000-0000-4000-8000-000000000201',
   '00000000-0000-4000-8000-000000000102', 'Assessment', 12000, 1),
  ('00000000-0000-4000-8000-000000000302', 'user_test_a', '00000000-0000-4000-8000-000000000202',
   '00000000-0000-4000-8000-000000000102', 'Assessment', 12000, 1),
  ('00000000-0000-4000-8000-000000000303', 'user_test_a', '00000000-0000-4000-8000-000000000203',
   '00000000-0000-4000-8000-000000000102', 'Assessment', 12000, 1);
insert into public.visits (id, owner_id, patient_id, visit_date, note, invoice_id) values
  ('00000000-0000-4000-8000-000000000401', 'user_test_a', '00000000-0000-4000-8000-000000000101',
   '2026-11-01', 'Made-up note.', '00000000-0000-4000-8000-000000000201'),
  ('00000000-0000-4000-8000-000000000402', 'user_test_a', '00000000-0000-4000-8000-000000000101',
   '2026-11-02', 'Made-up note.', '00000000-0000-4000-8000-000000000202'),
  ('00000000-0000-4000-8000-000000000403', 'user_test_a', '00000000-0000-4000-8000-000000000101',
   '2026-11-03', 'Made-up note.', '00000000-0000-4000-8000-000000000203');
-- Move invoice 2 to sent and invoice 3 to paid, the allowed way.
update public.invoices set status = 'sent', sent_at = now()
  where id in ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000203');
update public.invoices set status = 'paid', paid_at = now()
  where id = '00000000-0000-4000-8000-000000000203';

-- Line items -----------------------------------------------------------------

select lives_ok(
  $$insert into public.invoice_lines (id, owner_id, invoice_id, name, unit_price_cents, quantity)
    values ('00000000-0000-4000-8000-000000000304', 'user_test_a', '00000000-0000-4000-8000-000000000201', 'Extra', 500, 1)$$,
  'a line can be added to a draft'
);
select lives_ok(
  $$update public.invoice_lines set quantity = 2 where id = '00000000-0000-4000-8000-000000000301'$$,
  'a line on a draft can be changed'
);
select lives_ok(
  $$delete from public.invoice_lines where id = '00000000-0000-4000-8000-000000000304'$$,
  'a line can be removed from a draft'
);
select throws_ok(
  $$insert into public.invoice_lines (id, owner_id, invoice_id, name, unit_price_cents, quantity)
    values ('00000000-0000-4000-8000-000000000305', 'user_test_a', '00000000-0000-4000-8000-000000000202', 'Extra', 500, 1)$$,
  '23514', 'Line items can''t be changed once an invoice is sent.',
  'no line can be added to a sent invoice'
);
select throws_ok(
  $$update public.invoice_lines set quantity = 3 where id = '00000000-0000-4000-8000-000000000302'$$,
  '23514', 'Line items can''t be changed once an invoice is sent.',
  'a line on a sent invoice can''t be changed'
);
select throws_ok(
  $$delete from public.invoice_lines where id = '00000000-0000-4000-8000-000000000303'$$,
  '23514', 'Line items can''t be changed once an invoice is sent.',
  'a line can''t be removed from a paid invoice'
);
select throws_ok(
  $$update public.invoice_lines set invoice_id = '00000000-0000-4000-8000-000000000201'
    where id = '00000000-0000-4000-8000-000000000302'$$,
  '23514', 'Line items can''t be changed once an invoice is sent.',
  'a line can''t be moved off a sent invoice onto a draft'
);
select lives_ok(
  $$delete from public.price_items where id = '00000000-0000-4000-8000-000000000102'$$,
  'deleting a price item still works when sent invoices have lines copied from it'
);
select is(
  (select count(*)::int from public.invoice_lines where price_item_id is null),
  3,
  'those lines keep their name and price, with the link cleared'
);

-- Tax ------------------------------------------------------------------------

select lives_ok(
  $$update public.invoices set tax_enabled = true, tax_rate_basis_points = 500
    where id = '00000000-0000-4000-8000-000000000201'$$,
  'tax can be turned on for a draft'
);
select throws_ok(
  $$update public.invoices set tax_enabled = true where id = '00000000-0000-4000-8000-000000000202'$$,
  '23514', 'Tax can''t be changed once an invoice is sent.',
  'tax can''t be turned on for a sent invoice'
);
select throws_ok(
  $$update public.invoices set tax_rate_basis_points = 1200 where id = '00000000-0000-4000-8000-000000000203'$$,
  '23514', 'Tax can''t be changed once an invoice is sent.',
  'the tax rate can''t be changed on a paid invoice'
);
select lives_ok(
  $$update public.invoices set updated_at = now() where id = '00000000-0000-4000-8000-000000000202'$$,
  'other changes to a sent invoice that don''t touch tax or status still work'
);

-- Status ---------------------------------------------------------------------

select throws_ok(
  $$update public.invoices set status = 'draft', sent_at = null where id = '00000000-0000-4000-8000-000000000202'$$,
  '23514', 'A sent invoice can''t go back to draft.',
  'a sent invoice can''t go back to draft'
);
select throws_ok(
  $$update public.invoices set status = 'draft', sent_at = null, paid_at = null
    where id = '00000000-0000-4000-8000-000000000203'$$,
  '23514', 'A sent invoice can''t go back to draft.',
  'a paid invoice can''t go back to draft'
);
select throws_ok(
  $$update public.invoices set status = 'paid', sent_at = now(), paid_at = now()
    where id = '00000000-0000-4000-8000-000000000201'$$,
  '23514', 'An invoice has to be sent before it can be marked paid.',
  'a draft can''t jump straight to paid'
);
select lives_ok(
  $$update public.invoices set status = 'sent', sent_at = now() where id = '00000000-0000-4000-8000-000000000201'$$,
  'a draft can be sent'
);
select lives_ok(
  $$update public.invoices set status = 'paid', paid_at = now() where id = '00000000-0000-4000-8000-000000000202'$$,
  'a sent invoice can be marked paid'
);
select lives_ok(
  $$update public.invoices set status = 'sent', paid_at = null where id = '00000000-0000-4000-8000-000000000203'$$,
  'a payment can be undone (paid back to sent)'
);

-- Notes ----------------------------------------------------------------------
-- Invoice 1 is now sent, 2 paid, 3 sent again.

select lives_ok(
  $$update public.visits set note = 'Edited.' where id = '00000000-0000-4000-8000-000000000401'$$,
  'a note on a sent invoice can still be edited'
);
select throws_ok(
  $$update public.visits set note = 'Edited.' where id = '00000000-0000-4000-8000-000000000402'$$,
  '23514', 'Notes can''t be changed once an invoice is paid.',
  'a note on a paid invoice is locked'
);
select lives_ok(
  $$update public.visits set note = 'Edited after undo.' where id = '00000000-0000-4000-8000-000000000403'$$,
  'undoing the payment unlocks the note again'
);
select lives_ok(
  $$update public.visits set updated_at = now() where id = '00000000-0000-4000-8000-000000000402'$$,
  'other changes to a visit on a paid invoice that don''t touch the note still work'
);

-- Deleting an invoice takes its lines with it, whatever its status.
select lives_ok(
  $$delete from public.visits where invoice_id = '00000000-0000-4000-8000-000000000202';
    delete from public.invoices where id = '00000000-0000-4000-8000-000000000202'$$,
  'an invoice can still be deleted outright, lines and all'
);

select * from finish();
rollback;
