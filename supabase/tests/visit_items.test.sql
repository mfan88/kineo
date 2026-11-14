-- Visit item tests (phase 9): row-level security, the lock once a visit is on an
-- invoice, the cascade, lines forgetting a deleted visit, and the new style columns.
-- pgTAP, run by `pnpm test:db`. One transaction, rolled back. Made-up data only.

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(24);

-- Test data as the admin role. A = user A, B = user B.
insert into public.patients (id, owner_id, full_name) values
  ('00000000-0000-4000-8000-0000000000a1', 'user_test_a', 'Test Patient A'),
  ('00000000-0000-4000-8000-0000000000b1', 'user_test_b', 'Test Patient B');
insert into public.invoices (id, owner_id, patient_id, number) values
  ('00000000-0000-4000-8000-0000000002a1', 'user_test_a', '00000000-0000-4000-8000-0000000000a1', 1);
insert into public.visits (id, owner_id, patient_id, visit_date, invoice_id) values
  ('00000000-0000-4000-8000-0000000001a1', 'user_test_a', '00000000-0000-4000-8000-0000000000a1', '2026-11-01', null),
  ('00000000-0000-4000-8000-0000000001a2', 'user_test_a', '00000000-0000-4000-8000-0000000000a1', '2026-11-02', null),
  ('00000000-0000-4000-8000-0000000001a3', 'user_test_a', '00000000-0000-4000-8000-0000000000a1', '2026-11-03',
   '00000000-0000-4000-8000-0000000002a1'),
  ('00000000-0000-4000-8000-0000000001b1', 'user_test_b', '00000000-0000-4000-8000-0000000000b1', '2026-11-01', null);
-- Items go in as admin, which isn't bound by the lock (so one can sit on the invoiced visit).
insert into public.visit_items (id, owner_id, visit_id, name, unit_price_cents, quantity, position) values
  ('00000000-0000-4000-8000-0000000003a1', 'user_test_a', '00000000-0000-4000-8000-0000000001a1', 'Assessment', 12000, 1, 0),
  ('00000000-0000-4000-8000-0000000003a2', 'user_test_a', '00000000-0000-4000-8000-0000000001a2', 'Treatment', 9000, 2, 0),
  ('00000000-0000-4000-8000-0000000003a3', 'user_test_a', '00000000-0000-4000-8000-0000000001a3', 'Treatment', 9000, 1, 0),
  ('00000000-0000-4000-8000-0000000003b1', 'user_test_b', '00000000-0000-4000-8000-0000000001b1', 'Assessment', 11000, 1, 0);

-- 1–7. Row-level security: user A sees and changes only their own items.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_test_a","role":"authenticated"}', true);
select is((select count(*)::int from public.visit_items), 3, 'user A sees only their own items');
select is((select count(*)::int from public.visit_items where id = '00000000-0000-4000-8000-0000000003b1'),
  0, 'user A can''t read user B''s item');
with changed as (
  update public.visit_items set quantity = 9 where id = '00000000-0000-4000-8000-0000000003b1' returning 1)
select is((select count(*)::int from changed), 0, 'user A can''t update user B''s item');
with removed as (
  delete from public.visit_items where id = '00000000-0000-4000-8000-0000000003b1' returning 1)
select is((select count(*)::int from removed), 0, 'user A can''t delete user B''s item');
select throws_ok(
  $$insert into public.visit_items (owner_id, visit_id, name, unit_price_cents, quantity)
    values ('user_test_b', '00000000-0000-4000-8000-0000000001b1', 'Planted', 1, 1)$$,
  '42501', null, 'user A can''t add an item owned by user B');
select throws_ok(
  $$update public.visit_items set owner_id = 'user_test_b' where id = '00000000-0000-4000-8000-0000000003a1'$$,
  '42501', null, 'user A can''t hand their item to user B');
reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;
select throws_ok($$select 1 from public.visit_items$$, '42501', null, 'signed-out requests are refused');
reset role;

-- 8–10. While the visit has no invoice, items can be added, edited and deleted.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_test_a","role":"authenticated"}', true);
select lives_ok(
  $$insert into public.visit_items (id, visit_id, name, unit_price_cents, quantity, position)
    values ('00000000-0000-4000-8000-0000000003a4', '00000000-0000-4000-8000-0000000001a1', 'Taping', 1500, 1, 1)$$,
  'an item can be added to a visit with no invoice');
select lives_ok(
  $$update public.visit_items set quantity = 3 where id = '00000000-0000-4000-8000-0000000003a4'$$,
  'an item can be edited');
select lives_ok(
  $$delete from public.visit_items where id = '00000000-0000-4000-8000-0000000003a4'$$,
  'an item can be deleted');

-- 11–14. Once the visit is on an invoice, the apps' requests are refused.
select throws_ok(
  $$insert into public.visit_items (visit_id, name, unit_price_cents, quantity)
    values ('00000000-0000-4000-8000-0000000001a3', 'Late', 1, 1)$$,
  '23514', 'This visit is on an invoice, so its items can''t be changed. Change the lines on the invoice instead.',
  'no adding an item to an invoiced visit');
select throws_ok(
  $$update public.visit_items set quantity = 5 where id = '00000000-0000-4000-8000-0000000003a3'$$,
  '23514', 'This visit is on an invoice, so its items can''t be changed. Change the lines on the invoice instead.',
  'no editing an item on an invoiced visit');
select throws_ok(
  $$delete from public.visit_items where id = '00000000-0000-4000-8000-0000000003a3'$$,
  '23514', 'This visit is on an invoice, so its items can''t be changed. Change the lines on the invoice instead.',
  'no deleting an item on an invoiced visit');
select throws_ok(
  $$update public.visit_items set visit_id = '00000000-0000-4000-8000-0000000001a3'
     where id = '00000000-0000-4000-8000-0000000003a1'$$,
  '23514', 'This visit is on an invoice, so its items can''t be changed. Change the lines on the invoice instead.',
  'no moving an item onto an invoiced visit');
reset role;
select set_config('request.jwt.claims', '', true);

-- 15. An admin (no signed-in practitioner) can still delete them.
delete from public.visit_items where id = '00000000-0000-4000-8000-0000000003a3';
select is((select count(*)::int from public.visit_items where id = '00000000-0000-4000-8000-0000000003a3'),
  0, 'an admin can delete items of an invoiced visit');

-- 16–17. Deleting a visit takes its items with it, and undo can put both back.
delete from public.visits where id = '00000000-0000-4000-8000-0000000001a2';
select is((select count(*)::int from public.visit_items where visit_id = '00000000-0000-4000-8000-0000000001a2'),
  0, 'deleting a visit deletes its items');
insert into public.visits (id, owner_id, patient_id, visit_date) values
  ('00000000-0000-4000-8000-0000000001a2', 'user_test_a', '00000000-0000-4000-8000-0000000000a1', '2026-11-02');
select lives_ok(
  $$insert into public.visit_items (id, owner_id, visit_id, name, unit_price_cents, quantity)
    values ('00000000-0000-4000-8000-0000000003a2', 'user_test_a', '00000000-0000-4000-8000-0000000001a2', 'Treatment', 9000, 2)$$,
  'a deleted visit and its items can be put back');

-- 18–19. A line remembers its visit; deleting the visit clears it, on a draft or a sent invoice.
insert into public.invoice_lines (id, owner_id, invoice_id, visit_id, name, unit_price_cents, quantity) values
  ('00000000-0000-4000-8000-0000000004a1', 'user_test_a', '00000000-0000-4000-8000-0000000002a1',
   '00000000-0000-4000-8000-0000000001a3', 'Treatment', 9000, 1),
  ('00000000-0000-4000-8000-0000000004a2', 'user_test_a', '00000000-0000-4000-8000-0000000002a1',
   null, 'Added by hand', 5000, 1);
select is((select visit_id from public.invoice_lines where id = '00000000-0000-4000-8000-0000000004a1'),
  '00000000-0000-4000-8000-0000000001a3'::uuid, 'a line can point at its visit');
-- 21. (Run on the draft invoice.) A line can't point at another practitioner's visit.
select throws_ok(
  $$insert into public.invoice_lines (owner_id, invoice_id, visit_id, name, unit_price_cents, quantity)
    values ('user_test_a', '00000000-0000-4000-8000-0000000002a1', '00000000-0000-4000-8000-0000000001b1', 'Planted', 1, 1)$$,
  '23503', null, 'a line can''t point at another practitioner''s visit');

update public.invoices set status = 'sent', sent_at = now() where id = '00000000-0000-4000-8000-0000000002a1';
delete from public.visits where id = '00000000-0000-4000-8000-0000000001a3';
select is((select visit_id from public.invoice_lines where id = '00000000-0000-4000-8000-0000000004a1'),
  null, 'deleting a visit clears visit_id on its lines, even on a sent invoice');
select is((select count(*)::int from public.invoice_lines where id = '00000000-0000-4000-8000-0000000004a1'),
  1, 'the line itself stays');

-- 22–24. Style columns: footer logo is empty and the Made with switch is on by default.
insert into public.invoice_styles (id, owner_id) values
  ('00000000-0000-4000-8000-0000000005a1', 'user_test_a');
select is((select footer_logo_path from public.invoice_styles where owner_id = 'user_test_a'),
  null, 'footer_logo_path is empty by default');
select is((select show_made_with from public.invoice_styles where owner_id = 'user_test_a'),
  true, 'show_made_with is on by default');
select throws_ok(
  $$update public.invoice_styles set footer_logo_path = '  ' where owner_id = 'user_test_a'$$,
  '23514', null, 'a blank footer logo path is refused');

select * from finish();
rollback;
