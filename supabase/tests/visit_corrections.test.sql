-- Visit correction tests (P2, P3): a visit that isn't on an invoice can be deleted and
-- re-dated; one on an invoice can't be either; no visit is dated after today.
-- pgTAP, run by `pnpm test:db`. One transaction, rolled back. Made-up data only.

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(9);

insert into public.patients (id, owner_id, full_name) values
  ('00000000-0000-4000-8000-0000000000a1', 'user_test_a', 'Test Patient One');
insert into public.invoices (id, owner_id, patient_id, number) values
  ('00000000-0000-4000-8000-0000000002a1', 'user_test_a', '00000000-0000-4000-8000-0000000000a1', 1);
insert into public.visits (id, owner_id, patient_id, visit_date, invoice_id) values
  ('00000000-0000-4000-8000-0000000001a1', 'user_test_a', '00000000-0000-4000-8000-0000000000a1', '2026-11-01', null),
  ('00000000-0000-4000-8000-0000000001a2', 'user_test_a', '00000000-0000-4000-8000-0000000000a1', '2026-11-02', null),
  ('00000000-0000-4000-8000-0000000001a3', 'user_test_a', '00000000-0000-4000-8000-0000000000a1', '2026-11-03',
   '00000000-0000-4000-8000-0000000002a1');

-- 1–2. A visit not on an invoice can be re-dated, to today at the latest.
select lives_ok(
  $$update public.visits set visit_date = '2026-10-30' where id = '00000000-0000-4000-8000-0000000001a1'$$,
  'a visit not on an invoice can change date');
select lives_ok(
  $$update public.visits set visit_date = current_date where id = '00000000-0000-4000-8000-0000000001a1'$$,
  'today is fine');

-- 3–4. Never after today, saving or changing.
select throws_ok(
  $$update public.visits set visit_date = current_date + 5 where id = '00000000-0000-4000-8000-0000000001a1'$$,
  '23514', 'A visit can''t be dated after today.', 'no changing to a day after today');
select throws_ok(
  $$insert into public.visits (id, owner_id, patient_id, visit_date) values
    ('00000000-0000-4000-8000-0000000001a9', 'user_test_a', '00000000-0000-4000-8000-0000000000a1', current_date + 5)$$,
  '23514', 'A visit can''t be dated after today.', 'no saving a visit after today');

-- 5. A visit on an invoice keeps its date.
select throws_ok(
  $$update public.visits set visit_date = '2026-10-30' where id = '00000000-0000-4000-8000-0000000001a3'$$,
  '23514', 'This visit is on an invoice, so its date can''t be changed. Take it off the invoice first.',
  'an invoiced visit keeps its date');

-- 6. Nor can a date change ride along with putting a visit on an invoice.
select throws_ok(
  $$update public.visits set visit_date = '2026-10-30', invoice_id = '00000000-0000-4000-8000-0000000002a1'
     where id = '00000000-0000-4000-8000-0000000001a2'$$,
  '23514', 'This visit is on an invoice, so its date can''t be changed. Take it off the invoice first.',
  'no re-dating while invoicing');

-- 7–8. Through the apps (a signed-in practitioner), only a visit not on an invoice can
-- be deleted.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_test_a","role":"authenticated"}', true);
select throws_ok(
  $$delete from public.visits where id = '00000000-0000-4000-8000-0000000001a3'$$,
  '23514', 'This visit is on an invoice, so it can''t be deleted. Take it off the invoice first.',
  'an invoiced visit can''t be deleted');
delete from public.visits where id = '00000000-0000-4000-8000-0000000001a2';
reset role;
select set_config('request.jwt.claims', '', true);
select is((select count(*)::int from public.visits where id = '00000000-0000-4000-8000-0000000001a2'),
  0, 'a visit not on an invoice is deleted');

-- 9. Undo: the same visit can be saved again.
insert into public.visits (id, owner_id, patient_id, visit_date) values
  ('00000000-0000-4000-8000-0000000001a2', 'user_test_a', '00000000-0000-4000-8000-0000000000a1', '2026-11-02');
select is((select count(*)::int from public.visits where id = '00000000-0000-4000-8000-0000000001a2'),
  1, 'a deleted visit can be put back');

select * from finish();
rollback;
