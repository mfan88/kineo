-- Funding table tests (F1): what the server accepts in funding types, patient
-- fundings and the Bill to copy on invoices. pgTAP, run by `pnpm test:db`. One
-- transaction, rolled back. Made-up data only.

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(16);

-- UUID groups: …1xx patients, …2xx funding types, …3xx patient fundings,
-- …4xx invoices, …5xx detail ids.
insert into public.patients (id, owner_id, full_name) values
  ('00000000-0000-4000-8000-000000000101', 'user_test_a', 'Test Patient'),
  ('00000000-0000-4000-8000-000000000102', 'user_test_b', 'Other Patient');
insert into public.funding_types (id, owner_id, name) values
  ('00000000-0000-4000-8000-000000000209', 'user_test_b', 'Other type');

-- (a) A valid type.
select lives_ok(
  $$insert into public.funding_types (id, owner_id, name, recipient_name, recipient_address, details)
    values ('00000000-0000-4000-8000-000000000201', 'user_test_a', 'Test Funding',
            'Test Funding Branch', E'PO Box 1\nTestville BC V0V 0V0',
            '[{"id": "00000000-0000-4000-8000-000000000501", "label": "Billing number",
               "kind": "text", "show_on_invoice": true},
              {"id": "00000000-0000-4000-8000-000000000502", "label": "Period ends",
               "kind": "date", "show_on_invoice": false}]')$$,
  'a funding type with valid details is saved'
);

-- (b) Labels repeat, ignoring case and outer spaces.
select throws_ok(
  $$insert into public.funding_types (owner_id, name, details) values ('user_test_a', 'Dupes',
    '[{"id": "00000000-0000-4000-8000-000000000503", "label": "Billing number", "kind": "text", "show_on_invoice": true},
      {"id": "00000000-0000-4000-8000-000000000504", "label": " billing number ", "kind": "text", "show_on_invoice": false}]')$$,
  '23514',
  null,
  'two details with the same name are refused'
);

-- (c) Only text and date kinds.
select throws_ok(
  $$insert into public.funding_types (owner_id, name, details) values ('user_test_a', 'Numbers',
    '[{"id": "00000000-0000-4000-8000-000000000505", "label": "Rate", "kind": "number", "show_on_invoice": true}]')$$,
  '23514',
  null,
  'a detail kind other than text or date is refused'
);

select throws_ok(
  $$insert into public.funding_types (owner_id, name, details) values ('user_test_a', 'No label',
    '[{"id": "00000000-0000-4000-8000-000000000506", "label": "  ", "kind": "text", "show_on_invoice": true}]')$$,
  '23514',
  null,
  'a detail with a blank name is refused'
);

select throws_ok(
  $$insert into public.funding_types (owner_id, name) values ('user_test_a', '   ')$$,
  '23514',
  null,
  'a funding type needs a name'
);

-- (d) Details uploaded as a JSON string are stored as the array they hold.
insert into public.funding_types (id, owner_id, name, details) values
  ('00000000-0000-4000-8000-000000000202', 'user_test_a', 'From text',
   to_jsonb('[{"id": "00000000-0000-4000-8000-000000000507", "label": "Claim number", "kind": "text", "show_on_invoice": true}]'::text));
select is(
  (select jsonb_typeof(details) || ':' || (details -> 0 ->> 'label')
     from public.funding_types where id = '00000000-0000-4000-8000-000000000202'),
  'array:Claim number',
  'details sent as a JSON string are stored as an array'
);

-- A patient funding, with values uploaded as a JSON string.
insert into public.patient_fundings (id, owner_id, patient_id, funding_type_id, detail_values, period_start, period_end)
values ('00000000-0000-4000-8000-000000000301', 'user_test_a', '00000000-0000-4000-8000-000000000101',
        '00000000-0000-4000-8000-000000000201',
        to_jsonb('{"00000000-0000-4000-8000-000000000501": "4821"}'::text),
        '2026-04-01', '2027-03-31');
select is(
  (select detail_values ->> '00000000-0000-4000-8000-000000000501'
     from public.patient_fundings where id = '00000000-0000-4000-8000-000000000301'),
  '4821',
  'values sent as a JSON string are stored as an object'
);

select throws_ok(
  $$insert into public.patient_fundings (owner_id, patient_id, funding_type_id, detail_values)
    values ('user_test_a', '00000000-0000-4000-8000-000000000101',
            '00000000-0000-4000-8000-000000000201', '{"x": 5}')$$,
  '23514',
  null,
  'a value that isn''t text is refused'
);

-- (e) The period can't end before it starts.
select throws_ok(
  $$insert into public.patient_fundings (owner_id, patient_id, funding_type_id, period_start, period_end)
    values ('user_test_a', '00000000-0000-4000-8000-000000000101',
            '00000000-0000-4000-8000-000000000201', '2027-01-01', '2026-01-01')$$,
  '23514',
  null,
  'a period that ends before it starts is refused'
);

-- (f) A funding can only use the practitioner's own funding types.
select throws_ok(
  $$insert into public.patient_fundings (owner_id, patient_id, funding_type_id)
    values ('user_test_a', '00000000-0000-4000-8000-000000000101',
            '00000000-0000-4000-8000-000000000209')$$,
  '23503',
  null,
  'a funding with another practitioner''s type is refused'
);

-- (g) A type with an active funding can't be deleted.
select throws_ok(
  $$delete from public.funding_types where id = '00000000-0000-4000-8000-000000000201'$$,
  '23514',
  'Move this type''s patients to another type before deleting it.',
  'a type with an active funding can''t be deleted'
);

-- (h) Once its fundings have ended, it can; their link is cleared.
update public.patient_fundings set ended_on = '2026-11-13'
 where id = '00000000-0000-4000-8000-000000000301';
select lives_ok(
  $$delete from public.funding_types where id = '00000000-0000-4000-8000-000000000201'$$,
  'a type whose fundings have all ended can be deleted'
);
select is(
  (select funding_type_id from public.patient_fundings
    where id = '00000000-0000-4000-8000-000000000301'),
  null,
  'the ended funding keeps its row and loses its type'
);

-- (i) A funded invoice needs the funding type's name.
select throws_ok(
  $$insert into public.invoices (owner_id, patient_id, number, bill_to_kind, bill_to_funding_name)
    values ('user_test_a', '00000000-0000-4000-8000-000000000101', 1, 'funding', ' ')$$,
  '23514',
  null,
  'a funded invoice without the funding''s name is refused'
);

-- A funded invoice whose details arrive as a JSON string.
insert into public.invoices (id, owner_id, patient_id, number, bill_to_kind, bill_to_name,
                             bill_to_address, bill_to_funding_name, patient_funding_id, bill_to_details)
values ('00000000-0000-4000-8000-000000000401', 'user_test_a', '00000000-0000-4000-8000-000000000101', 2,
        'funding', 'Test Funding Branch', 'PO Box 1', 'Test Funding',
        '00000000-0000-4000-8000-000000000301',
        to_jsonb('[{"id": "00000000-0000-4000-8000-000000000501", "label": "Billing number", "value": "4821"}]'::text));
select is(
  (select bill_to_details -> 0 ->> 'value' from public.invoices
    where id = '00000000-0000-4000-8000-000000000401'),
  '4821',
  'invoice details sent as a JSON string are stored as an array'
);

-- A self-pay invoice can't carry funding fields.
select throws_ok(
  $$insert into public.invoices (owner_id, patient_id, number, bill_to_funding_name)
    values ('user_test_a', '00000000-0000-4000-8000-000000000101', 3, 'Test Funding')$$,
  '23514',
  null,
  'a self-pay invoice can''t name a funding'
);

select * from finish();
rollback;
