-- Patient information tests (MAR-65): child switch, parent names, email,
-- phone, custom details, Show on invoice flags, JSON-text uploads, and the
-- details_required flag that leaves existing rows alone while requiring
-- contact details on new patients. pgTAP, run by `pnpm test:db`. One
-- transaction, rolled back. Made-up data only.

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(28);

-- UUID groups: …1xx patients, …5xx custom detail ids.
-- Simulate a pre-migration row (`details_required = false` with blank details)
-- by temporarily disabling user triggers on patients.
alter table public.patients disable trigger user;
insert into public.patients (id, owner_id, full_name, details_required) values
  ('00000000-0000-4000-8000-000000000101', 'user_test_a', 'Jordan Example', false);
alter table public.patients enable trigger user;

-- Legacy rows (`details_required = false`) -------------------------------------

select lives_ok(
  $$update public.patients
       set full_name = 'Jordan Legacy',
           email = '',
           phone = '',
           is_child = false,
           parent_names = '[]'
     where id = '00000000-0000-4000-8000-000000000101'$$,
  'an old row with blank values can still be updated'
);

select throws_ok(
  $$update public.patients
       set email = 'not-an-email'
     where id = '00000000-0000-4000-8000-000000000101'$$,
  '23514',
  null,
  'updating an old row with a non-blank invalid email is refused'
);

select lives_ok(
  $$update public.patients
       set email = ''
     where id = '00000000-0000-4000-8000-000000000101'$$,
  'updating an old row with a blank email succeeds'
);

-- Required email and phone on new patients -------------------------------------

select throws_ok(
  $$insert into public.patients (owner_id, full_name, phone)
    values ('user_test_a', 'No Email', '604-555-0100')$$,
  '23514',
  null,
  'an insert without email is refused'
);

select throws_ok(
  $$insert into public.patients (owner_id, full_name, email, phone)
    values ('user_test_a', 'Blank Email', '   ', '604-555-0100')$$,
  '23514',
  null,
  'an insert with blank email is refused'
);

select throws_ok(
  $$insert into public.patients (owner_id, full_name, email)
    values ('user_test_a', 'No Phone', 'test@example.com')$$,
  '23514',
  null,
  'an insert without phone is refused'
);

select throws_ok(
  $$insert into public.patients (owner_id, full_name, email, phone)
    values ('user_test_a', 'Blank Phone', 'test@example.com', '   ')$$,
  '23514',
  null,
  'an insert with blank phone is refused'
);

select throws_ok(
  $$insert into public.patients (owner_id, full_name, email, phone)
    values ('user_test_a', 'Bad Email', 'not-an-email', '604-555-0100')$$,
  '23514',
  null,
  'an insert with an invalid email is refused'
);

-- Valid adult and child inserts ------------------------------------------------

select lives_ok(
  $$insert into public.patients (id, owner_id, full_name, email, email_on_invoice, phone, phone_on_invoice)
    values ('00000000-0000-4000-8000-000000000102', 'user_test_a', 'Adult Example',
            'adult@example.com', true, '604-555-0101', true)$$,
  'a valid adult insert succeeds'
);

select lives_ok(
  $$insert into public.patients (id, owner_id, full_name, is_child, parent_names, parent_names_on_invoice, email, phone)
    values ('00000000-0000-4000-8000-000000000103', 'user_test_a', 'Child One Parent',
            true, '["Alex Parent"]', true, 'child1@example.com', '604-555-0102')$$,
  'a valid child insert with 1 parent name succeeds'
);

select lives_ok(
  $$insert into public.patients (id, owner_id, full_name, is_child, parent_names, parent_names_on_invoice, email, phone)
    values ('00000000-0000-4000-8000-000000000104', 'user_test_a', 'Child Four Parents',
            true, '["Parent One", "Parent Two", "Parent Three", "Parent Four"]', true,
            'child4@example.com', '604-555-0103')$$,
  'a valid child insert with 4 parent names succeeds'
);

-- Child and parent name rules --------------------------------------------------

select throws_ok(
  $$insert into public.patients (owner_id, full_name, is_child, parent_names, email, phone)
    values ('user_test_a', 'Child No Parents', true, '[]', 'noparent@example.com', '604-555-0104')$$,
  '23514',
  null,
  'a child without a parent name is refused'
);

select throws_ok(
  $$insert into public.patients (owner_id, full_name, is_child, parent_names, email, phone)
    values ('user_test_a', 'Child Blank Parent', true, '["   "]', 'blankparent@example.com', '604-555-0105')$$,
  '23514',
  null,
  'a child with only a blank parent name is refused'
);

select throws_ok(
  $$insert into public.patients (owner_id, full_name, is_child, parent_names, email, phone)
    values ('user_test_a', 'Adult With Parent', false, '["Alex Parent"]', 'adultparent@example.com', '604-555-0106')$$,
  '23514',
  null,
  'a non-child with parent names is refused'
);

select throws_ok(
  $$insert into public.patients (owner_id, full_name, is_child, parent_names, email, phone)
    values ('user_test_a', 'Too Many Parents', true,
            '["Parent One", "Parent Two", "Parent Three", "Parent Four", "Parent Five"]',
            'fiveparents@example.com', '604-555-0107')$$,
  '23514',
  null,
  'more than 4 parent names is refused'
);

-- Custom details rules ---------------------------------------------------------

select lives_ok(
  $$insert into public.patients (id, owner_id, full_name, email, phone, custom_details)
    values ('00000000-0000-4000-8000-000000000105', 'user_test_a', 'Custom Details Patient',
            'custom@example.com', '604-555-0108',
            '[{"id": "00000000-0000-4000-8000-000000000501", "label": "PHN", "value": "9000 000 001", "show_on_invoice": true},
              {"id": "00000000-0000-4000-8000-000000000502", "label": "Referral", "value": "Dr. Example", "show_on_invoice": false}]')$$,
  'valid custom details succeed'
);

select throws_ok(
  $$insert into public.patients (owner_id, full_name, email, phone, custom_details)
    values ('user_test_a', 'Blank Detail Label', 'blanklabel@example.com', '604-555-0109',
            '[{"id": "00000000-0000-4000-8000-000000000503", "label": "   ", "value": "123", "show_on_invoice": true}]')$$,
  '23514',
  null,
  'a custom detail with a blank label is refused'
);

select throws_ok(
  $$insert into public.patients (owner_id, full_name, email, phone, custom_details)
    values ('user_test_a', 'Blank Detail Value', 'blankval@example.com', '604-555-0110',
            '[{"id": "00000000-0000-4000-8000-000000000504", "label": "PHN", "value": "   ", "show_on_invoice": true}]')$$,
  '23514',
  null,
  'a custom detail with a blank value is refused'
);

select throws_ok(
  $$insert into public.patients (owner_id, full_name, email, phone, custom_details)
    values ('user_test_a', 'Dup Detail Label', 'duplabel@example.com', '604-555-0111',
            '[{"id": "00000000-0000-4000-8000-000000000505", "label": "CareCard", "value": "111", "show_on_invoice": true},
              {"id": "00000000-0000-4000-8000-000000000506", "label": " carecard ", "value": "222", "show_on_invoice": false}]')$$,
  '23514',
  null,
  'custom details with duplicate labels ignoring case and outer spaces are refused'
);

select throws_ok(
  $$insert into public.patients (owner_id, full_name, email, phone, custom_details)
    values ('user_test_a', 'Dup Detail Id', 'dupid@example.com', '604-555-0112',
            '[{"id": "00000000-0000-4000-8000-000000000507", "label": "Label A", "value": "111", "show_on_invoice": true},
              {"id": "00000000-0000-4000-8000-000000000507", "label": "Label B", "value": "222", "show_on_invoice": false}]')$$,
  '23514',
  null,
  'custom details with duplicate ids are refused'
);

select throws_ok(
  $$insert into public.patients (owner_id, full_name, email, phone, custom_details)
    values ('user_test_a', 'Missing Show Flag', 'missingflag@example.com', '604-555-0116',
            '[{"id": "00000000-0000-4000-8000-000000000508", "label": "PHN", "value": "9000 000 001"}]')$$,
  '23514',
  null,
  'a custom detail missing show_on_invoice is refused'
);

select throws_ok(
  $$insert into public.patients (owner_id, full_name, email, phone, custom_details)
    select 'user_test_a', 'Too Many Details', 'many@example.com', '604-555-0113',
           jsonb_agg(jsonb_build_object(
             'id', '00000000-0000-4000-8000-0000000005' || lpad(i::text, 2, '0'),
             'label', 'Detail ' || i,
             'value', 'Value ' || i,
             'show_on_invoice', false
           ))
      from generate_series(1, 21) as i$$,
  '23514',
  null,
  'more than 20 custom details is refused'
);

-- JSON-text uploads ------------------------------------------------------------

insert into public.patients (id, owner_id, full_name, is_child, parent_names, email, phone, custom_details)
values (
  '00000000-0000-4000-8000-000000000106',
  'user_test_a',
  'Json Text Patient',
  true,
  to_jsonb('["Parent One"]'::text),
  'jsontext@example.com',
  '604-555-0114',
  to_jsonb('[{"id": "00000000-0000-4000-8000-000000000510", "label": "PHN", "value": "9000 000 001", "show_on_invoice": true}]'::text)
);

select is(
  (select jsonb_typeof(parent_names) || ':' || (parent_names ->> 0)
     from public.patients where id = '00000000-0000-4000-8000-000000000106'),
  'array:Parent One',
  'parent_names sent as a JSON string is stored as an array'
);

select is(
  (select jsonb_typeof(custom_details) || ':' || (custom_details -> 0 ->> 'label')
     from public.patients where id = '00000000-0000-4000-8000-000000000106'),
  'array:PHN',
  'custom_details sent as a JSON string is stored as an array'
);

-- Client cannot bypass or clear details_required -------------------------------

select throws_ok(
  $$insert into public.patients (owner_id, full_name, details_required)
    values ('user_test_a', 'Sneaky Blank', false)$$,
  '23514',
  null,
  'a client cannot insert with details_required = false and blank email/phone'
);

insert into public.patients (id, owner_id, full_name, email, phone, details_required)
values ('00000000-0000-4000-8000-000000000107', 'user_test_a', 'Forced Required',
        'forced@example.com', '604-555-0115', false);

select is(
  (select details_required from public.patients where id = '00000000-0000-4000-8000-000000000107'),
  true,
  'inserting with details_required = false and valid details stores details_required = true'
);

update public.patients
   set details_required = false
 where id = '00000000-0000-4000-8000-000000000107';

select is(
  (select details_required from public.patients where id = '00000000-0000-4000-8000-000000000107'),
  true,
  'a client cannot clear details_required on update'
);

select throws_ok(
  $$update public.patients
       set details_required = false,
           email = ''
     where id = '00000000-0000-4000-8000-000000000107'$$,
  '23514',
  null,
  'updating a new patient with details_required = false and blank email is refused'
);

select * from finish();
rollback;
