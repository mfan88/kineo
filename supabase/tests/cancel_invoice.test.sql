-- Cancelling a sent invoice: sent → cancelled only, nothing out of cancelled,
-- visits can be released from a cancelled invoice (and never added), the invoice
-- keeps its number and a copy of its visit dates, and the next invoice takes the
-- next number. pgTAP, run by `pnpm test:db`. One transaction, rolled back.
-- Made-up data only.

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(16);

-- One practitioner, one patient; invoice 1 draft, 2 sent, 3 paid, each with a visit.
insert into public.patients (id, owner_id, full_name) values
  ('00000000-0000-4000-8000-000000000101', 'user_test_a', 'Test Patient');
insert into public.invoices (id, owner_id, patient_id, number) values
  ('00000000-0000-4000-8000-000000000201', 'user_test_a', '00000000-0000-4000-8000-000000000101', 1),
  ('00000000-0000-4000-8000-000000000202', 'user_test_a', '00000000-0000-4000-8000-000000000101', 2),
  ('00000000-0000-4000-8000-000000000203', 'user_test_a', '00000000-0000-4000-8000-000000000101', 3);
insert into public.visits (id, owner_id, patient_id, visit_date, note, invoice_id) values
  ('00000000-0000-4000-8000-000000000401', 'user_test_a', '00000000-0000-4000-8000-000000000101',
   '2026-11-01', 'Made-up note.', '00000000-0000-4000-8000-000000000201'),
  ('00000000-0000-4000-8000-000000000402', 'user_test_a', '00000000-0000-4000-8000-000000000101',
   '2026-11-02', 'Made-up note.', '00000000-0000-4000-8000-000000000202'),
  ('00000000-0000-4000-8000-000000000403', 'user_test_a', '00000000-0000-4000-8000-000000000101',
   '2026-11-03', 'Made-up note.', '00000000-0000-4000-8000-000000000203'),
  ('00000000-0000-4000-8000-000000000404', 'user_test_a', '00000000-0000-4000-8000-000000000101',
   '2026-11-04', 'Made-up note.', null);
update public.invoices set status = 'sent', sent_at = now()
  where id in ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000203');
update public.invoices set status = 'paid', paid_at = now()
  where id = '00000000-0000-4000-8000-000000000203';

-- Which statuses can be cancelled -----------------------------------------------

select throws_ok(
  $$update public.invoices set status = 'cancelled', sent_at = now(), cancelled_at = now(),
      cancelled_visit_dates = '["2026-11-01"]'
    where id = '00000000-0000-4000-8000-000000000201'$$,
  '23514', 'Only a sent invoice can be cancelled.',
  'a draft can''t be cancelled'
);
select throws_ok(
  $$update public.invoices set status = 'cancelled', paid_at = null, cancelled_at = now(),
      cancelled_visit_dates = '["2026-11-03"]'
    where id = '00000000-0000-4000-8000-000000000203'$$,
  '23514', 'Undo the payment before cancelling this invoice.',
  'a paid invoice can''t be cancelled'
);
select throws_ok(
  $$update public.invoices set status = 'cancelled' where id = '00000000-0000-4000-8000-000000000202'$$,
  '23514', null,
  'cancelling needs its date and the copy of the visit dates'
);

-- The visits can't leave a sent invoice on their own ------------------------------

select throws_ok(
  $$update public.visits set invoice_id = null where id = '00000000-0000-4000-8000-000000000402'$$,
  '23514', 'Visits can''t be removed once an invoice is sent.',
  'a visit can''t be taken off a sent invoice that isn''t cancelled'
);

-- Cancelling a sent invoice -------------------------------------------------------

select lives_ok(
  $$update public.invoices
       set status = 'cancelled', cancelled_at = now(), cancelled_visit_dates = '["2026-11-02"]'
     where id = '00000000-0000-4000-8000-000000000202'$$,
  'a sent invoice can be cancelled'
);
select lives_ok(
  $$update public.visits set invoice_id = null where id = '00000000-0000-4000-8000-000000000402'$$,
  'a cancelled invoice lets go of its visits'
);
select is(
  (select cancelled_visit_dates::text from public.invoices where id = '00000000-0000-4000-8000-000000000202'),
  '["2026-11-02"]',
  'the cancelled invoice keeps a copy of its visit dates'
);
select throws_ok(
  $$update public.visits set invoice_id = '00000000-0000-4000-8000-000000000202'
    where id = '00000000-0000-4000-8000-000000000404'$$,
  '23514', 'Visits can''t be added once an invoice is sent.',
  'a visit can''t be put on a cancelled invoice'
);

-- Nothing moves out of cancelled ---------------------------------------------------

select throws_ok(
  $$update public.invoices set status = 'sent', cancelled_at = null, cancelled_visit_dates = null
    where id = '00000000-0000-4000-8000-000000000202'$$,
  '23514', 'A cancelled invoice can''t be changed.',
  'a cancelled invoice can''t go back to sent'
);
select throws_ok(
  $$update public.invoices set status = 'paid', paid_at = now()
    where id = '00000000-0000-4000-8000-000000000202'$$,
  '23514', 'A cancelled invoice can''t be changed.',
  'a cancelled invoice can''t be marked paid'
);
select throws_ok(
  $$update public.invoices set cancelled_visit_dates = '[]'
    where id = '00000000-0000-4000-8000-000000000202'$$,
  '23514', 'A cancelled invoice can''t be changed.',
  'the copy of the visit dates is fixed once cancelled'
);
select throws_ok(
  $$update public.invoices set tax_enabled = true where id = '00000000-0000-4000-8000-000000000202'$$,
  '23514', 'Tax can''t be changed once an invoice is sent.',
  'tax on a cancelled invoice is locked'
);
select throws_ok(
  $$insert into public.invoice_lines (id, owner_id, invoice_id, name, unit_price_cents, quantity)
    values ('00000000-0000-4000-8000-000000000301', 'user_test_a', '00000000-0000-4000-8000-000000000202', 'Extra', 500, 1)$$,
  '23514', 'Line items can''t be changed once an invoice is sent.',
  'no line can be added to a cancelled invoice'
);

-- The JSON text the apps upload is read back as the array it holds ------------------

update public.invoices set status = 'sent', sent_at = now()
  where id = '00000000-0000-4000-8000-000000000201';
select lives_ok(
  $$update public.invoices set status = 'cancelled', cancelled_at = now(),
      cancelled_visit_dates = to_jsonb('["2026-11-01"]'::text)
    where id = '00000000-0000-4000-8000-000000000201'$$,
  'a cancelled invoice can be saved with its dates as JSON text'
);
select is(
  (select jsonb_typeof(cancelled_visit_dates) from public.invoices where id = '00000000-0000-4000-8000-000000000201'),
  'array',
  'JSON text is stored as an array'
);

-- The number stays used ---------------------------------------------------------------

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

select is(
  pg_temp.call_as('user_test_a', format(
    'select public.create_invoice(%L, %L, 2, 0, %L::uuid[], %L)',
    '00000000-0000-4000-8000-000000000205', '00000000-0000-4000-8000-000000000101',
    '{00000000-0000-4000-8000-000000000404}', '2026-11-13T10:00:00Z')),
  '4',
  'a cancelled invoice''s number is never reused: asking for 2 gives the next free number'
);

select * from finish();
rollback;
