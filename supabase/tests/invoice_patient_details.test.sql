-- Invoice patient_details tests (MAR-67): draft editing, send/pay transitions,
-- immutability locks across sent/paid/cancelled, JSON-text uploads, shape
-- validation, and create_invoice RPC handling. pgTAP, run by `pnpm test:db`.
-- One transaction, rolled back. Made-up data only.

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(31);

-- UUID groups: …1xx patient, …2xx invoices, …4xx visits, …5xx custom detail ids.
insert into public.patients (id, owner_id, full_name, email, phone) values
  ('00000000-0000-4000-8000-000000000101', 'user_test_a', 'Jordan Example', 'jordan@example.com', '604-555-0100');

insert into public.visits (id, owner_id, patient_id, visit_date) values
  ('00000000-0000-4000-8000-000000000401', 'user_test_a', '00000000-0000-4000-8000-000000000101', '2026-11-01'),
  ('00000000-0000-4000-8000-000000000402', 'user_test_a', '00000000-0000-4000-8000-000000000101', '2026-11-02'),
  ('00000000-0000-4000-8000-000000000403', 'user_test_a', '00000000-0000-4000-8000-000000000101', '2026-11-03'),
  ('00000000-0000-4000-8000-000000000404', 'user_test_a', '00000000-0000-4000-8000-000000000101', '2026-11-04');

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

-- Draft invoices can set and change patient_details ----------------------------

select lives_ok(
  $$insert into public.invoices (id, owner_id, patient_id, number, patient_details)
    values (
      '00000000-0000-4000-8000-000000000201',
      'user_test_a',
      '00000000-0000-4000-8000-000000000101',
      1,
      jsonb_build_array(
        jsonb_build_object('id', 'parents', 'label', 'Parents', 'value', 'Alex Example'),
        jsonb_build_object('id', 'email', 'label', 'Email', 'value', 'jordan@example.com'),
        jsonb_build_object('id', 'phone', 'label', 'Phone', 'value', '604-555-0100'),
        jsonb_build_object('id', '00000000-0000-4000-8000-000000000501', 'label', 'Notes on file', 'value', repeat('x', 500))
      )
    )$$,
  'a draft invoice can be created with fixed ids, custom uuid ids, and a 500-char value'
);

select is(
  (select jsonb_array_length(patient_details) || ':' || char_length(patient_details -> 3 ->> 'value')
     from public.invoices where id = '00000000-0000-4000-8000-000000000201'),
  '4:500',
  'all four patient_details entries including the 500-char value are stored'
);

select lives_ok(
  $$update public.invoices
       set patient_details = '[{"id": "email", "label": "Email", "value": "updated@example.com"}]'::jsonb
     where id = '00000000-0000-4000-8000-000000000201'$$,
  'patient_details can be changed while the invoice is a draft'
);

select is(
  (select patient_details -> 0 ->> 'value'
     from public.invoices where id = '00000000-0000-4000-8000-000000000201'),
  'updated@example.com',
  'the updated patient_details value is stored on the draft'
);

-- Sending and marking paid -----------------------------------------------------

select lives_ok(
  $$update public.invoices
       set status = 'sent', sent_at = now()
     where id = '00000000-0000-4000-8000-000000000201'$$,
  'sending a draft invoice succeeds with patient_details present'
);

select lives_ok(
  $$update public.invoices
       set status = 'paid',
           paid_at = now(),
           patient_details = to_jsonb('[{"id":"email","label":"Email","value":"updated@example.com"}]'::text)
     where id = '00000000-0000-4000-8000-000000000201'$$,
  'marking a sent invoice paid works when unchanged patient_details is uploaded as matching JSON text'
);

select is(
  (select status || ':' || jsonb_typeof(patient_details)
     from public.invoices where id = '00000000-0000-4000-8000-000000000201'),
  'paid:array',
  'the paid invoice keeps patient_details as a jsonb array'
);

insert into public.invoices (id, owner_id, patient_id, number, patient_details)
values ('00000000-0000-4000-8000-000000000202', 'user_test_a', '00000000-0000-4000-8000-000000000101', 2, '[]'::jsonb);

select lives_ok(
  $$update public.invoices
       set status = 'sent', sent_at = now()
     where id = '00000000-0000-4000-8000-000000000202'$$,
  'sending a draft invoice succeeds even when patient_details is empty'
);

select lives_ok(
  $$update public.invoices
       set status = 'paid', paid_at = now()
     where id = '00000000-0000-4000-8000-000000000202'$$,
  'marking an invoice paid works when empty patient_details is unchanged'
);

-- Locked once sent, paid, or cancelled -----------------------------------------

insert into public.invoices (id, owner_id, patient_id, number, patient_details)
values
  ('00000000-0000-4000-8000-000000000203', 'user_test_a', '00000000-0000-4000-8000-000000000101', 3,
   '[{"id": "email", "label": "Email", "value": "jordan@example.com"}]'::jsonb),
  ('00000000-0000-4000-8000-000000000204', 'user_test_a', '00000000-0000-4000-8000-000000000101', 4,
   '[{"id": "phone", "label": "Phone", "value": "604-555-0100"}]'::jsonb);

update public.invoices
   set status = 'sent', sent_at = now()
 where id in ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000204');

update public.invoices
   set status = 'cancelled', cancelled_at = now(), cancelled_visit_dates = '[]'::jsonb
 where id = '00000000-0000-4000-8000-000000000204';

select throws_ok(
  $$update public.invoices
       set patient_details = '[]'::jsonb
     where id = '00000000-0000-4000-8000-000000000203'$$,
  '23514',
  null,
  'patient_details cannot be changed on a sent invoice'
);

select throws_ok(
  $$update public.invoices
       set patient_details = '[]'::jsonb
     where id = '00000000-0000-4000-8000-000000000201'$$,
  '23514',
  null,
  'patient_details cannot be changed on a paid invoice'
);

select throws_ok(
  $$update public.invoices
       set patient_details = '[]'::jsonb
     where id = '00000000-0000-4000-8000-000000000204'$$,
  '23514',
  null,
  'patient_details cannot be changed on a cancelled invoice'
);

-- JSON-text upload on insert and update ----------------------------------------

select lives_ok(
  $$insert into public.invoices (id, owner_id, patient_id, number, patient_details)
    values (
      '00000000-0000-4000-8000-000000000205',
      'user_test_a',
      '00000000-0000-4000-8000-000000000101',
      5,
      to_jsonb('[{"id":"email","label":"Email","value":"patient@example.com"}]'::text)
    )$$,
  'patient_details uploaded as JSON text succeeds on insert'
);

select is(
  (select jsonb_typeof(patient_details) || ':' || (patient_details -> 0 ->> 'value')
     from public.invoices where id = '00000000-0000-4000-8000-000000000205'),
  'array:patient@example.com',
  'patient_details inserted as JSON text is stored as a real jsonb array'
);

select lives_ok(
  $$update public.invoices
       set patient_details = to_jsonb('[{"id":"phone","label":"Phone","value":"604-555-0199"}]'::text)
     where id = '00000000-0000-4000-8000-000000000205'$$,
  'patient_details uploaded as JSON text succeeds on update'
);

select is(
  (select jsonb_typeof(patient_details) || ':' || (patient_details -> 0 ->> 'value')
     from public.invoices where id = '00000000-0000-4000-8000-000000000205'),
  'array:604-555-0199',
  'patient_details updated as JSON text is stored as a real jsonb array'
);

-- Shape validation -------------------------------------------------------------

select lives_ok(
  $$insert into public.invoices (id, owner_id, patient_id, number, patient_details)
    select '00000000-0000-4000-8000-000000000206',
           'user_test_a',
           '00000000-0000-4000-8000-000000000101',
           6,
           jsonb_agg(jsonb_build_object(
             'id', '00000000-0000-4000-8000-0000000005' || lpad(i::text, 2, '0'),
             'label', 'Detail ' || i,
             'value', 'Value ' || i
           ))
      from generate_series(1, 23) as i$$,
  'up to 23 patient_details entries are accepted'
);

select throws_ok(
  $$insert into public.invoices (owner_id, patient_id, number, patient_details)
    values ('user_test_a', '00000000-0000-4000-8000-000000000101', 901, '{}'::jsonb)$$,
  '23514',
  null,
  'non-array patient_details jsonb is refused'
);

select throws_ok(
  $$insert into public.invoices (owner_id, patient_id, number, patient_details)
    values ('user_test_a', '00000000-0000-4000-8000-000000000101', 902,
            '[{"id": "email", "label": "   ", "value": "jordan@example.com"}]'::jsonb)$$,
  '23514',
  null,
  'patient_details entry with a blank label is refused'
);

select throws_ok(
  $$insert into public.invoices (owner_id, patient_id, number, patient_details)
    values ('user_test_a', '00000000-0000-4000-8000-000000000101', 903,
            jsonb_build_array(jsonb_build_object('id', 'email', 'label', repeat('a', 81), 'value', 'jordan@example.com')))$$,
  '23514',
  null,
  'patient_details entry with a label longer than 80 characters is refused'
);

select throws_ok(
  $$insert into public.invoices (owner_id, patient_id, number, patient_details)
    values ('user_test_a', '00000000-0000-4000-8000-000000000101', 904,
            jsonb_build_array(jsonb_build_object('id', 'email', 'label', 'Email', 'value', repeat('a', 501))))$$,
  '23514',
  null,
  'patient_details entry with a value longer than 500 characters is refused'
);

select throws_ok(
  $$insert into public.invoices (owner_id, patient_id, number, patient_details)
    values ('user_test_a', '00000000-0000-4000-8000-000000000101', 905,
            '[{"id": "email", "label": "Email", "value": 123}]'::jsonb)$$,
  '23514',
  null,
  'patient_details entry with a non-string value is refused'
);

select throws_ok(
  $$insert into public.invoices (owner_id, patient_id, number, patient_details)
    select 'user_test_a',
           '00000000-0000-4000-8000-000000000101',
           906,
           jsonb_agg(jsonb_build_object(
             'id', '00000000-0000-4000-8000-0000000005' || lpad(i::text, 2, '0'),
             'label', 'Detail ' || i,
             'value', 'Value ' || i
           ))
      from generate_series(1, 24) as i$$,
  '23514',
  null,
  'more than 23 patient_details entries is refused'
);

-- create_invoice RPC -----------------------------------------------------------

select is(
  pg_temp.call_as('user_test_a', $$
    select public.create_invoice(
      '00000000-0000-4000-8000-000000000207',
      '00000000-0000-4000-8000-000000000101',
      7,
      500,
      '{00000000-0000-4000-8000-000000000401}'::uuid[],
      '2026-11-19T10:00:00Z',
      '{"bill_to_kind": "patient", "bill_to_name": "Jordan Example",
        "patient_details": [{"id": "email", "label": "Email", "value": "jordan@example.com"}]}'::jsonb
    )
  $$),
  '7',
  'create_invoice accepts patient_details as a jsonb array'
);

select is(
  (select jsonb_typeof(patient_details) || ':' || (patient_details -> 0 ->> 'id') || ':' || (patient_details -> 0 ->> 'value')
     from public.invoices where id = '00000000-0000-4000-8000-000000000207'),
  'array:email:jordan@example.com',
  'create_invoice stores the patient_details jsonb array on the invoice'
);

select is(
  pg_temp.call_as('user_test_a', $$
    select public.create_invoice(
      '00000000-0000-4000-8000-000000000208',
      '00000000-0000-4000-8000-000000000101',
      8,
      500,
      '{00000000-0000-4000-8000-000000000402}'::uuid[],
      '2026-11-19T10:05:00Z',
      '{"bill_to_kind": "patient", "bill_to_name": "Jordan Example",
        "patient_details": "[{\"id\":\"phone\",\"label\":\"Phone\",\"value\":\"604-555-0100\"}]"}'::jsonb
    )
  $$),
  '8',
  'create_invoice accepts patient_details as a JSON string'
);

select is(
  (select jsonb_typeof(patient_details) || ':' || (patient_details -> 0 ->> 'value')
     from public.invoices where id = '00000000-0000-4000-8000-000000000208'),
  'array:604-555-0100',
  'create_invoice stores JSON-string patient_details as a real jsonb array'
);

select is(
  pg_temp.call_as('user_test_a', $$
    select public.create_invoice(
      '00000000-0000-4000-8000-000000000209',
      '00000000-0000-4000-8000-000000000101',
      9,
      500,
      '{00000000-0000-4000-8000-000000000403}'::uuid[],
      '2026-11-19T10:10:00Z',
      '{"bill_to_kind": "patient", "bill_to_name": "Jordan Example"}'::jsonb
    )
  $$),
  '9',
  'create_invoice succeeds when p_billing omits the patient_details key'
);

select is(
  (select patient_details::text
     from public.invoices where id = '00000000-0000-4000-8000-000000000209'),
  '[]',
  'create_invoice stores [] when p_billing omits patient_details'
);

select is(
  pg_temp.call_as('user_test_a', $$
    select public.create_invoice(
      '00000000-0000-4000-8000-000000000210',
      '00000000-0000-4000-8000-000000000101',
      10,
      500,
      '{00000000-0000-4000-8000-000000000404}'::uuid[],
      '2026-11-19T10:15:00Z'
    )
  $$),
  '10',
  '6-argument create_invoice succeeds'
);

select is(
  (select patient_details::text
     from public.invoices where id = '00000000-0000-4000-8000-000000000210'),
  '[]',
  '6-argument create_invoice stores [] for patient_details'
);

select * from finish();
rollback;
