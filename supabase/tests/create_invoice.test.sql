-- create_invoice tests: an invoice and its visits are saved together or not at all,
-- and a number another device already used is replaced with the next free one.
-- pgTAP, run by `pnpm test:db`. One transaction, rolled back. Made-up data only.

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(26);

-- User A: two patients, four visits (three for patient 1, one for patient 2), and
-- invoice 1 already on the server. User B: one patient with one visit.
insert into public.patients (id, owner_id, full_name) values
  ('00000000-0000-4000-8000-0000000000a1', 'user_test_a', 'Test Patient One'),
  ('00000000-0000-4000-8000-0000000000a2', 'user_test_a', 'Test Patient Two'),
  ('00000000-0000-4000-8000-0000000000b1', 'user_test_b', 'Test Patient B');
insert into public.visits (id, owner_id, patient_id, visit_date) values
  ('00000000-0000-4000-8000-0000000001a1', 'user_test_a', '00000000-0000-4000-8000-0000000000a1', '2026-11-01'),
  ('00000000-0000-4000-8000-0000000001a2', 'user_test_a', '00000000-0000-4000-8000-0000000000a1', '2026-11-02'),
  ('00000000-0000-4000-8000-0000000001a3', 'user_test_a', '00000000-0000-4000-8000-0000000000a1', '2026-11-03'),
  ('00000000-0000-4000-8000-0000000001a4', 'user_test_a', '00000000-0000-4000-8000-0000000000a2', '2026-11-04'),
  ('00000000-0000-4000-8000-0000000001b1', 'user_test_b', '00000000-0000-4000-8000-0000000000b1', '2026-11-01');
insert into public.invoices (id, owner_id, patient_id, number) values
  ('00000000-0000-4000-8000-0000000002a0', 'user_test_a', '00000000-0000-4000-8000-0000000000a1', 1);

-- Runs a query as `authenticated` with the given Clerk user ID and returns its
-- single value as text, or the SQLSTATE and message if it failed.
create function pg_temp.call_as(sub text, sql text)
returns text
language plpgsql
as $$
declare
  result text;
begin
  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    case when sub is null then '{"role":"authenticated"}'
         else json_build_object('sub', sub, 'role', 'authenticated')::text end,
    true
  );
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

-- Creates invoice `id` for patient One with the given proposed number and visits.
create function pg_temp.create(id text, proposed int, visits text)
returns text
language sql
as $$
  select pg_temp.call_as('user_test_a', format(
    'select public.create_invoice(%L, %L, %s, 500, %L::uuid[], %L)',
    id, '00000000-0000-4000-8000-0000000000a1', proposed, visits, '2026-11-13T10:00:00Z'));
$$;

-- The usual case ----------------------------------------------------------------

select is(
  pg_temp.create('00000000-0000-4000-8000-0000000002a2', 2,
    '{00000000-0000-4000-8000-0000000001a1,00000000-0000-4000-8000-0000000001a2}'),
  '2', 'keeps the proposed number when it''s free'
);
select is(
  (select status || ' ' || tax_enabled || ' ' || tax_rate_basis_points from public.invoices
    where id = '00000000-0000-4000-8000-0000000002a2'),
  'draft false 500', 'creates a draft with tax off and the given rate'
);
select is(
  (select count(*)::int from public.visits where invoice_id = '00000000-0000-4000-8000-0000000002a2'),
  2, 'puts the visits on it'
);
select is(
  (select bill_to_kind || ' ' || bill_to_name || ' ' || bill_to_details::text from public.invoices
    where id = '00000000-0000-4000-8000-0000000002a2'),
  'patient Test Patient One []', 'the 6-argument call bills the patient by name'
);

-- A retry after a lost reply --------------------------------------------------------

select is(
  pg_temp.create('00000000-0000-4000-8000-0000000002a2', 2,
    '{00000000-0000-4000-8000-0000000001a1,00000000-0000-4000-8000-0000000001a2}'),
  '2', 'calling again for the same invoice changes nothing and returns its number'
);
select is(
  (select count(*)::int from public.invoices where owner_id = 'user_test_a'), 2,
  'no second invoice is made'
);

-- A number another device already used -----------------------------------------

select is(
  pg_temp.create('00000000-0000-4000-8000-0000000002a3', 2,
    '{00000000-0000-4000-8000-0000000001a3}'),
  '3', 'a number already in use is replaced with the next free one'
);
select is(
  (select number from public.invoices where id = '00000000-0000-4000-8000-0000000002a3'), 3,
  'and saved with that number'
);

-- Nothing is saved when a visit can't go on it -----------------------------------------

select is(
  pg_temp.create('00000000-0000-4000-8000-0000000002a4', 4,
    '{00000000-0000-4000-8000-0000000001a4}'),
  '23514: One of these visits is already on another invoice, or no longer exists.',
  'refuses another patient''s visit'
);
select is(
  pg_temp.create('00000000-0000-4000-8000-0000000002a5', 4,
    '{00000000-0000-4000-8000-0000000001a1}'),
  '23514: One of these visits is already on another invoice, or no longer exists.',
  'refuses a visit already on another invoice'
);
select is(
  pg_temp.create('00000000-0000-4000-8000-0000000002a6', 4,
    '{00000000-0000-4000-8000-0000000001b1}'),
  '23514: One of these visits is already on another invoice, or no longer exists.',
  'refuses another practitioner''s visit'
);
select is(
  pg_temp.create('00000000-0000-4000-8000-0000000002a7', 4, '{}'),
  '23514: Choose at least one visit to invoice.',
  'refuses an invoice with no visits'
);
select is(
  (select count(*)::int from public.invoices
    where id in ('00000000-0000-4000-8000-0000000002a4', '00000000-0000-4000-8000-0000000002a5',
                 '00000000-0000-4000-8000-0000000002a6', '00000000-0000-4000-8000-0000000002a7')),
  0, 'none of the refused invoices were saved'
);
select is(
  (select invoice_id::text from public.visits where id = '00000000-0000-4000-8000-0000000001a4'),
  null, 'and their visits were left alone'
);

-- Bill to (F3) -----------------------------------------------------------------------

-- More visits for patient One, and an Autism-style funding for patient One and one
-- for patient Two. …3xx funding types and fundings, …6xx detail ids.
insert into public.visits (id, owner_id, patient_id, visit_date) values
  ('00000000-0000-4000-8000-0000000001a5', 'user_test_a', '00000000-0000-4000-8000-0000000000a1', '2026-11-05'),
  ('00000000-0000-4000-8000-0000000001a6', 'user_test_a', '00000000-0000-4000-8000-0000000000a1', '2026-11-06'),
  ('00000000-0000-4000-8000-0000000001a7', 'user_test_a', '00000000-0000-4000-8000-0000000000a1', '2026-11-07'),
  ('00000000-0000-4000-8000-0000000001a8', 'user_test_a', '00000000-0000-4000-8000-0000000000a1', '2026-11-08');
insert into public.funding_types (id, owner_id, name) values
  ('00000000-0000-4000-8000-0000000003a0', 'user_test_a', 'Test Funding');
insert into public.patient_fundings (id, owner_id, patient_id, funding_type_id) values
  ('00000000-0000-4000-8000-0000000003a1', 'user_test_a', '00000000-0000-4000-8000-0000000000a1',
   '00000000-0000-4000-8000-0000000003a0'),
  ('00000000-0000-4000-8000-0000000003a2', 'user_test_a', '00000000-0000-4000-8000-0000000000a2',
   '00000000-0000-4000-8000-0000000003a0');

-- Creates invoice `id` for patient One with one visit and the given p_billing.
create function pg_temp.create_billed(id text, visit text, billing text)
returns text
language sql
as $$
  select pg_temp.call_as('user_test_a', format(
    'select public.create_invoice(%L, %L, null, 0, %L::uuid[], %L, %L::jsonb)',
    id, '00000000-0000-4000-8000-0000000000a1', '{' || visit || '}', '2026-11-13T10:00:00Z', billing));
$$;

-- Bill to as one invoice's columns, for comparing.
create function pg_temp.bill_to(invoice text)
returns text
language sql
as $$
  select concat_ws(' | ', bill_to_kind, bill_to_name, bill_to_address, bill_to_funding_name,
                   coalesce(patient_funding_id::text, 'no funding'), bill_to_details::text)
    from public.invoices where id = invoice::uuid;
$$;

select is(
  pg_temp.create_billed('00000000-0000-4000-8000-0000000002c1', '00000000-0000-4000-8000-0000000001a5',
    '{"bill_to_kind": "funding", "bill_to_name": "Test Funding Branch",
      "bill_to_address": "PO Box 1\nTestville BC V0V 0V0", "bill_to_funding_name": "Test Funding",
      "patient_funding_id": "00000000-0000-4000-8000-0000000003a1",
      "bill_to_details": [{"id": "00000000-0000-4000-8000-0000000006a1", "label": "Billing number", "value": "4821"}]}'),
  '4', 'creates a funded invoice'
);
select is(
  pg_temp.bill_to('00000000-0000-4000-8000-0000000002c1'),
  E'funding | Test Funding Branch | PO Box 1\nTestville BC V0V 0V0 | Test Funding | 00000000-0000-4000-8000-0000000003a1 | [{"id": "00000000-0000-4000-8000-0000000006a1", "label": "Billing number", "value": "4821"}]',
  'and saves every Bill to column'
);

select is(
  pg_temp.create_billed('00000000-0000-4000-8000-0000000002c2', '00000000-0000-4000-8000-0000000001a6',
    '{"bill_to_kind": "funding", "bill_to_name": "Test Funding Branch", "bill_to_address": "PO Box 1",
      "bill_to_funding_name": "Test Funding", "patient_funding_id": "00000000-0000-4000-8000-0000000003a1",
      "bill_to_details": "[{\"id\": \"00000000-0000-4000-8000-0000000006a1\", \"label\": \"Billing number\", \"value\": \"4821\"}]"}'),
  '5', 'accepts details sent as a JSON string'
);
select is(
  (select jsonb_typeof(bill_to_details) || ':' || (bill_to_details -> 0 ->> 'value')
     from public.invoices where id = '00000000-0000-4000-8000-0000000002c2'),
  'array:4821', 'and stores them as an array'
);

-- What an app with nothing to send uploads: every key null.
select is(
  pg_temp.create_billed('00000000-0000-4000-8000-0000000002c3', '00000000-0000-4000-8000-0000000001a7',
    '{"bill_to_kind": null, "bill_to_name": null, "bill_to_address": null,
      "bill_to_funding_name": null, "patient_funding_id": null, "bill_to_details": null}'),
  '6', 'creates an invoice when every Bill to key is null'
);
select is(
  pg_temp.bill_to('00000000-0000-4000-8000-0000000002c3'),
  'patient | Test Patient One |  |  | no funding | []',
  'and bills the patient by name'
);

-- A funding that isn't this patient's loses its link, keeping the copy.
select is(
  pg_temp.create_billed('00000000-0000-4000-8000-0000000002c4', '00000000-0000-4000-8000-0000000001a8',
    '{"bill_to_kind": "funding", "bill_to_name": "Test Funding Branch", "bill_to_address": "PO Box 1",
      "bill_to_funding_name": "Test Funding", "patient_funding_id": "00000000-0000-4000-8000-0000000003a2",
      "bill_to_details": []}'),
  '7', 'creates an invoice naming another patient''s funding'
);
select is(
  pg_temp.bill_to('00000000-0000-4000-8000-0000000002c4'),
  'funding | Test Funding Branch | PO Box 1 | Test Funding | no funding | []',
  'without linking to that funding'
);

-- Access ---------------------------------------------------------------------------

select is(
  pg_temp.call_as(null, $$select public.create_invoice('00000000-0000-4000-8000-0000000002a8',
    '00000000-0000-4000-8000-0000000000a1', 9, 0, '{00000000-0000-4000-8000-0000000001a3}', now())$$),
  '42501: Sign in to create invoices.', 'refuses a caller without a user ID'
);
select is(
  (select has_function_privilege('anon', 'public.create_invoice(uuid, uuid, integer, integer, uuid[], timestamptz)', 'execute')),
  false, 'anonymous callers can''t run it'
);
select is(
  (select has_function_privilege('anon', 'public.create_invoice(uuid, uuid, integer, integer, uuid[], timestamptz, jsonb)', 'execute')),
  false, 'anonymous callers can''t run the Bill to version either'
);
select is(
  pg_temp.call_as('user_test_b', $$select public.create_invoice('00000000-0000-4000-8000-0000000002b2',
    '00000000-0000-4000-8000-0000000000b1', 1, 0, '{00000000-0000-4000-8000-0000000001b1}', now())$$),
  '1', 'another practitioner counts from their own numbers'
);

select * from finish();
rollback;
