-- Row-level security tests: user A can never read or change user B's data.
--
-- pgTAP. Runs with `supabase test db` on a full stack, or locally with
-- `pnpm test:db` (a throwaway Supabase Postgres container).
-- Everything runs in one transaction and is rolled back. Made-up data only.

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(62);

-- Test data, inserted as the admin role (which bypasses RLS). Two practitioners,
-- each with one row in every table. UUID last digits: a = user A, b = user B.
insert into public.profiles (id, owner_id, full_name, full_name_on_invoice) values
  ('00000000-0000-4000-8000-0000000001a0', 'user_test_a', 'Alex Example', true),
  ('00000000-0000-4000-8000-0000000001b0', 'user_test_b', 'Blair Example', true);
insert into public.practice_settings (id, owner_id, default_tax_rate_basis_points) values
  ('00000000-0000-4000-8000-0000000002a0', 'user_test_a', 500),
  ('00000000-0000-4000-8000-0000000002b0', 'user_test_b', 0);
insert into public.invoice_styles (id, owner_id) values
  ('00000000-0000-4000-8000-0000000003a0', 'user_test_a'),
  ('00000000-0000-4000-8000-0000000003b0', 'user_test_b');
insert into public.patients (id, owner_id, full_name) values
  ('00000000-0000-4000-8000-0000000004a0', 'user_test_a', 'Test Patient A'),
  ('00000000-0000-4000-8000-0000000004b0', 'user_test_b', 'Test Patient B');
insert into public.price_items (id, owner_id, name, unit_price_cents) values
  ('00000000-0000-4000-8000-0000000005a0', 'user_test_a', 'Assessment', 12000),
  ('00000000-0000-4000-8000-0000000005b0', 'user_test_b', 'Assessment', 11000);
insert into public.invoices (id, owner_id, patient_id, number) values
  ('00000000-0000-4000-8000-0000000006a0', 'user_test_a', '00000000-0000-4000-8000-0000000004a0', 1),
  ('00000000-0000-4000-8000-0000000006b0', 'user_test_b', '00000000-0000-4000-8000-0000000004b0', 1);
insert into public.visits (id, owner_id, patient_id, visit_date, note, invoice_id) values
  ('00000000-0000-4000-8000-0000000007a0', 'user_test_a', '00000000-0000-4000-8000-0000000004a0',
   '2026-11-01', 'Made-up note A.', '00000000-0000-4000-8000-0000000006a0'),
  ('00000000-0000-4000-8000-0000000007b0', 'user_test_b', '00000000-0000-4000-8000-0000000004b0',
   '2026-11-01', 'Made-up note B.', '00000000-0000-4000-8000-0000000006b0');
insert into public.invoice_lines (id, owner_id, invoice_id, price_item_id, name, unit_price_cents, quantity) values
  ('00000000-0000-4000-8000-0000000008a0', 'user_test_a', '00000000-0000-4000-8000-0000000006a0',
   '00000000-0000-4000-8000-0000000005a0', 'Assessment', 12000, 1),
  ('00000000-0000-4000-8000-0000000008b0', 'user_test_b', '00000000-0000-4000-8000-0000000006b0',
   '00000000-0000-4000-8000-0000000005b0', 'Assessment', 11000, 1);

-- Runs `sql` as a role (and Clerk user ID, if given) and returns how many rows it
-- returned or changed, or the SQLSTATE if it failed. The role is reset afterwards so
-- the pgTAP assertions themselves run as admin.
create function pg_temp.run_as(role_name text, sub text, sql text)
returns text
language plpgsql
as $$
declare
  affected bigint;
  outcome text;
begin
  execute format('set local role %I', role_name);
  perform set_config(
    'request.jwt.claims',
    case when sub is null then '{"role":"' || role_name || '"}'
         else json_build_object('sub', sub, 'role', role_name)::text end,
    true
  );
  begin
    execute sql;
    get diagnostics affected = row_count;
    outcome := affected::text;
  exception when others then
    outcome := sqlstate;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return outcome;
end;
$$;

-- The same checks for every table. `b_id` is user B's row, `a_id` user A's row, and
-- `insert_as_b` an insert that tries to create a row owned by user B.
create function pg_temp.check_table(tbl text, a_id uuid, b_id uuid, insert_as_b text)
returns setof text
language plpgsql
as $$
begin
  return next is(
    pg_temp.run_as('authenticated', 'user_test_a', format('select 1 from public.%I', tbl)),
    '1',
    tbl || ': user A sees exactly one row (their own)'
  );
  return next is(
    pg_temp.run_as('authenticated', 'user_test_a',
      format('select 1 from public.%I where id = %L', tbl, b_id)),
    '0',
    tbl || ': user A can''t read user B''s row'
  );
  return next is(
    pg_temp.run_as('authenticated', 'user_test_a',
      format('update public.%I set owner_id = owner_id where id = %L', tbl, b_id)),
    '0',
    tbl || ': user A can''t update user B''s row'
  );
  return next is(
    pg_temp.run_as('authenticated', 'user_test_a',
      format('delete from public.%I where id = %L', tbl, b_id)),
    '0',
    tbl || ': user A can''t delete user B''s row'
  );
  return next is(
    pg_temp.run_as('authenticated', 'user_test_a', insert_as_b),
    '42501',
    tbl || ': user A can''t add a row owned by user B'
  );
  return next is(
    pg_temp.run_as('authenticated', 'user_test_a',
      format('update public.%I set owner_id = %L where id = %L', tbl, 'user_test_b', a_id)),
    '42501',
    tbl || ': user A can''t hand their row to user B'
  );
  return next is(
    pg_temp.run_as('anon', null, format('select 1 from public.%I', tbl)),
    '42501',
    tbl || ': signed-out requests are refused'
  );
end;
$$;

select * from pg_temp.check_table('profiles',
  '00000000-0000-4000-8000-0000000001a0', '00000000-0000-4000-8000-0000000001b0',
  $$insert into public.profiles (owner_id) values ('user_test_b')$$);
select * from pg_temp.check_table('practice_settings',
  '00000000-0000-4000-8000-0000000002a0', '00000000-0000-4000-8000-0000000002b0',
  $$insert into public.practice_settings (owner_id) values ('user_test_b')$$);
select * from pg_temp.check_table('invoice_styles',
  '00000000-0000-4000-8000-0000000003a0', '00000000-0000-4000-8000-0000000003b0',
  $$insert into public.invoice_styles (owner_id) values ('user_test_b')$$);
select * from pg_temp.check_table('patients',
  '00000000-0000-4000-8000-0000000004a0', '00000000-0000-4000-8000-0000000004b0',
  $$insert into public.patients (owner_id, full_name) values ('user_test_b', 'Planted')$$);
select * from pg_temp.check_table('price_items',
  '00000000-0000-4000-8000-0000000005a0', '00000000-0000-4000-8000-0000000005b0',
  $$insert into public.price_items (owner_id, name, unit_price_cents) values ('user_test_b', 'Planted', 1)$$);
select * from pg_temp.check_table('invoices',
  '00000000-0000-4000-8000-0000000006a0', '00000000-0000-4000-8000-0000000006b0',
  $$insert into public.invoices (owner_id, patient_id, number)
    values ('user_test_b', '00000000-0000-4000-8000-0000000004b0', 99)$$);
select * from pg_temp.check_table('visits',
  '00000000-0000-4000-8000-0000000007a0', '00000000-0000-4000-8000-0000000007b0',
  $$insert into public.visits (owner_id, patient_id, visit_date)
    values ('user_test_b', '00000000-0000-4000-8000-0000000004b0', '2026-11-02')$$);
select * from pg_temp.check_table('invoice_lines',
  '00000000-0000-4000-8000-0000000008a0', '00000000-0000-4000-8000-0000000008b0',
  $$insert into public.invoice_lines (owner_id, invoice_id, name, unit_price_cents, quantity)
    values ('user_test_b', '00000000-0000-4000-8000-0000000006b0', 'Planted', 1, 1)$$);

-- User B's data is untouched after all of user A's attempts.
select is(
  (select count(*)::int from public.patients where owner_id = 'user_test_b' and full_name = 'Test Patient B'),
  1,
  'user B''s patient is unchanged'
);
select is(
  (select note from public.visits where id = '00000000-0000-4000-8000-0000000007b0'),
  'Made-up note B.',
  'user B''s visit note is unchanged'
);

-- A signed-in token with no user ID sees nothing.
select is(
  pg_temp.run_as('authenticated', null, 'select 1 from public.patients'),
  '0',
  'a token without a user ID sees no rows'
);

-- User A can still work with their own data, and new rows default to their ID.
select is(
  pg_temp.run_as('authenticated', 'user_test_a',
    $$insert into public.patients (full_name) values ('Test Patient A2')$$),
  '1',
  'user A can add a patient without setting owner_id'
);
select is(
  (select owner_id from public.patients where full_name = 'Test Patient A2'),
  'user_test_a',
  'the new patient belongs to user A'
);
select is(
  pg_temp.run_as('authenticated', 'user_test_a',
    $$update public.visits set note = 'Updated made-up note A.'
      where id = '00000000-0000-4000-8000-0000000007a0'$$),
  '1',
  'user A can update their own visit'
);

select * from finish();
rollback;
