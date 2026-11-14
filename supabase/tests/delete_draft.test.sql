-- Deleting a draft invoice: only drafts can go, other practitioners can't touch
-- them, the lines go with the invoice, the visits are released, and the number
-- is never reused (the starting number moves past the highest deleted draft).
-- pgTAP, run by `pnpm test:db`. One transaction, rolled back. Made-up data only.

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(19);

-- Runs one statement as the given practitioner; returns its first value, or
-- 'sqlstate: message' if it raised.
create function pg_temp.call_as(sub text, sql text)
returns text
language plpgsql
as $$
declare
  result text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', sub, 'role', 'authenticated')::text, true);
  begin
    execute sql into result;
  exception when others then
    result := sqlstate || ': ' || sqlerrm;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return result;
end;
$$;

-- Deletes an invoice as the practitioner and returns how many rows went.
create function pg_temp.delete_as(sub text, invoice uuid)
returns text
language sql
as $$
  select pg_temp.call_as(sub, format(
    'with d as (delete from public.invoices where id = %L returning 1) select count(*) from d', invoice));
$$;

-- Practitioner A: invoices 1 (draft), 2 (sent), 3 (paid), 4 (cancelled), 5 (draft
-- with a line and a visit, the highest number).
insert into public.patients (id, owner_id, full_name) values
  ('00000000-0000-4000-8000-000000000101', 'user_test_a', 'Jordan Example');
insert into public.invoices (id, owner_id, patient_id, number) values
  ('00000000-0000-4000-8000-000000000201', 'user_test_a', '00000000-0000-4000-8000-000000000101', 1),
  ('00000000-0000-4000-8000-000000000202', 'user_test_a', '00000000-0000-4000-8000-000000000101', 2),
  ('00000000-0000-4000-8000-000000000203', 'user_test_a', '00000000-0000-4000-8000-000000000101', 3),
  ('00000000-0000-4000-8000-000000000204', 'user_test_a', '00000000-0000-4000-8000-000000000101', 4),
  ('00000000-0000-4000-8000-000000000205', 'user_test_a', '00000000-0000-4000-8000-000000000101', 5);
insert into public.invoice_lines (id, owner_id, invoice_id, name, unit_price_cents, quantity) values
  ('00000000-0000-4000-8000-000000000301', 'user_test_a', '00000000-0000-4000-8000-000000000205', 'Sample treatment', 9000, 1);
insert into public.visits (id, owner_id, patient_id, visit_date, note, invoice_id) values
  ('00000000-0000-4000-8000-000000000401', 'user_test_a', '00000000-0000-4000-8000-000000000101',
   '2026-11-01', 'Made-up note.', '00000000-0000-4000-8000-000000000205');
update public.invoices set status = 'sent', sent_at = now()
  where id in ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000203',
               '00000000-0000-4000-8000-000000000204');
update public.invoices set status = 'paid', paid_at = now()
  where id = '00000000-0000-4000-8000-000000000203';
update public.invoices set status = 'cancelled', cancelled_at = now(), cancelled_visit_dates = '[]'
  where id = '00000000-0000-4000-8000-000000000204';

-- Only a draft can be deleted ------------------------------------------------------

select is(
  pg_temp.delete_as('user_test_a', '00000000-0000-4000-8000-000000000202'),
  '23514: Only a draft invoice can be deleted.',
  'a sent invoice can''t be deleted'
);
select is(
  pg_temp.delete_as('user_test_a', '00000000-0000-4000-8000-000000000203'),
  '23514: Only a draft invoice can be deleted.',
  'a paid invoice can''t be deleted'
);
select is(
  pg_temp.delete_as('user_test_a', '00000000-0000-4000-8000-000000000204'),
  '23514: Only a draft invoice can be deleted.',
  'a cancelled invoice can''t be deleted'
);
select is(
  (select count(*)::int from public.invoices
    where id in ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000203',
                 '00000000-0000-4000-8000-000000000204')
      and status in ('sent', 'paid', 'cancelled')),
  3,
  'the refused deletes changed nothing'
);

-- Another practitioner can't delete it --------------------------------------------

select is(
  pg_temp.delete_as('user_test_b', '00000000-0000-4000-8000-000000000201'),
  '0',
  'practitioner B deletes nothing of A''s draft'
);
select is(
  (select count(*)::int from public.invoices where id = '00000000-0000-4000-8000-000000000201'),
  1,
  'A''s draft is still there'
);

-- Deleting the highest-numbered draft ------------------------------------------------

select is(
  pg_temp.delete_as('user_test_a', '00000000-0000-4000-8000-000000000205'),
  '1',
  'a practitioner can delete their own draft'
);
select is(
  (select count(*)::int from public.invoices where id = '00000000-0000-4000-8000-000000000205'),
  0,
  'the draft is gone'
);
select is(
  (select count(*)::int from public.invoice_lines where invoice_id = '00000000-0000-4000-8000-000000000205'),
  0,
  'its lines are gone'
);
select is(
  (select invoice_id::text from public.visits where id = '00000000-0000-4000-8000-000000000401'),
  null,
  'its visit is still there, no longer on an invoice'
);
select is(
  (select invoice_number_start from public.practice_settings where owner_id = 'user_test_a'),
  6,
  'the starting number moves to one past the deleted number'
);
select is(
  (select id::text from public.practice_settings where owner_id = 'user_test_a'),
  public.own_row_id('practice_settings', 'user_test_a')::text,
  'the settings row made for it uses the practitioner''s own row id'
);
select is(
  pg_temp.call_as('user_test_a', format(
    'select public.create_invoice(%L::uuid, %L::uuid, 5, 0, %L::uuid[], %L::timestamptz, null::jsonb)',
    '00000000-0000-4000-8000-000000000206', '00000000-0000-4000-8000-000000000101',
    '{00000000-0000-4000-8000-000000000401}', '2026-11-18T10:00:00Z')),
  '6',
  'the next invoice takes 6, never the deleted 5'
);

-- A draft below the highest number leaves the starting number alone ---------------------

select is(
  pg_temp.delete_as('user_test_a', '00000000-0000-4000-8000-000000000201'),
  '1',
  'a lower-numbered draft can be deleted'
);
select is(
  (select invoice_number_start from public.practice_settings where owner_id = 'user_test_a'),
  6,
  'deleting a lower number doesn''t lower the starting number'
);

-- A starting number already above N+1 stays -------------------------------------------

insert into public.patients (id, owner_id, full_name) values
  ('00000000-0000-4000-8000-000000000102', 'user_test_c', 'Sample Person');
insert into public.practice_settings (owner_id, invoice_number_start) values ('user_test_c', 100);
insert into public.invoices (id, owner_id, patient_id, number) values
  ('00000000-0000-4000-8000-000000000211', 'user_test_c', '00000000-0000-4000-8000-000000000102', 5);
select pg_temp.delete_as('user_test_c', '00000000-0000-4000-8000-000000000211');
select is(
  (select invoice_number_start from public.practice_settings where owner_id = 'user_test_c'),
  100,
  'a starting number above N+1 stays'
);

-- A funded draft, with a starting number below N+1 ----------------------------------------

insert into public.patients (id, owner_id, full_name) values
  ('00000000-0000-4000-8000-000000000103', 'user_test_d', 'Casey Sample');
insert into public.practice_settings (owner_id, invoice_number_start) values ('user_test_d', 3);
insert into public.invoices (id, owner_id, patient_id, number, bill_to_kind, bill_to_name,
                             bill_to_address, bill_to_funding_name) values
  ('00000000-0000-4000-8000-000000000221', 'user_test_d', '00000000-0000-4000-8000-000000000103', 9,
   'funding', 'Test Funding Branch', 'PO Box 1', 'Test Funding'),
  ('00000000-0000-4000-8000-000000000222', 'user_test_d', '00000000-0000-4000-8000-000000000103', 10,
   'funding', 'Test Funding Branch', 'PO Box 1', 'Test Funding');
select is(
  pg_temp.delete_as('user_test_d', '00000000-0000-4000-8000-000000000221'),
  '1',
  'a funded draft can be deleted'
);
select is(
  (select invoice_number_start from public.practice_settings where owner_id = 'user_test_d'),
  3,
  'a funded draft below the highest leaves the starting number alone'
);
select pg_temp.delete_as('user_test_d', '00000000-0000-4000-8000-000000000222');
select is(
  (select invoice_number_start from public.practice_settings where owner_id = 'user_test_d'),
  11,
  'deleting the highest funded draft moves an existing starting number up to N+1'
);

select * from finish();
rollback;
