-- Kineō seed data. Made-up test data only: never put real patient information here.
--
-- Everything belongs to one practitioner. The owner is the Postgres setting
-- `app.seed_owner_id` (set by `pnpm db:seed` from SEED_OWNER_ID in supabase/.env, so
-- your Clerk user ID is never committed). Without it, rows belong to `user_seed_demo`,
-- which no real login can see.
--
-- Safe to run more than once: if the seed's price list already exists, nothing is
-- changed. Profile, settings and style use the practitioner's fixed IDs
-- (public.own_row_id), as the apps do.
--
-- What it sets up, to exercise every Home group:
--   Ready to invoice    Jordan Sample (2 visits), Riley Placeholder (1 visit)
--   Not sent yet        INV-0003, draft, Casey Fictional
--   Waiting on payment  INV-0002, sent, Morgan Testcase
--   Paid (hidden)       INV-0001, paid, Morgan Testcase

do $$
declare
  owner text := coalesce(nullif(current_setting('app.seed_owner_id', true), ''), 'user_seed_demo');
begin
  -- Already seeded: stop, so reruns never touch data you've changed since.
  if exists (select 1 from public.price_items where id = '5eed0000-0000-4000-8000-000000000101') then
    raise notice 'Seed data is already loaded; nothing changed.';
    return;
  end if;

  insert into public.profiles (
    id, owner_id,
    full_name, full_name_on_invoice,
    title, title_on_invoice,
    clinic_name, clinic_name_on_invoice,
    address, address_on_invoice,
    phone, phone_on_invoice
  ) values (
    public.own_row_id('profiles', owner), owner,
    'Alex Example', true,
    'Registered Physiotherapist', true,
    'Example Physiotherapy', true,
    '100 Sample Street, Vancouver BC V5K 0A1', true,
    '604-555-0100', false
  ) on conflict do nothing;

  insert into public.practice_settings (id, owner_id, default_tax_rate_basis_points, invoice_number_prefix)
  values (public.own_row_id('practice_settings', owner), owner, 500, 'INV-')
  on conflict do nothing;

  insert into public.invoice_styles (id, owner_id, accent_color, font, header_layout, footer_note)
  values (public.own_row_id('invoice_styles', owner), owner, 'sky', 'clean', 'logo-left',
          'Thank you. Please keep this receipt for your insurance claim.')
  on conflict do nothing;

  insert into public.price_items (id, owner_id, name, unit_price_cents) values
    ('5eed0000-0000-4000-8000-000000000101', owner, 'Initial assessment', 12000),
    ('5eed0000-0000-4000-8000-000000000102', owner, 'Follow-up treatment', 9500),
    ('5eed0000-0000-4000-8000-000000000103', owner, 'Exercise band', 1500)
  on conflict do nothing;

  insert into public.patients (id, owner_id, full_name, reason_for_visit, created_at, updated_at) values
    ('5eed0000-0000-4000-8000-000000000201', owner, 'Morgan Testcase', 'Lower back pain',
     '2026-10-01T16:00:00Z', '2026-10-01T16:00:00Z'),
    ('5eed0000-0000-4000-8000-000000000202', owner, 'Casey Fictional', 'Ankle sprain',
     '2026-10-20T17:00:00Z', '2026-10-20T17:00:00Z'),
    ('5eed0000-0000-4000-8000-000000000203', owner, 'Jordan Sample', 'Shoulder rehab',
     '2026-10-28T18:00:00Z', '2026-10-28T18:00:00Z'),
    ('5eed0000-0000-4000-8000-000000000204', owner, 'Riley Placeholder', null,
     '2026-11-06T19:00:00Z', '2026-11-06T19:00:00Z')
  on conflict do nothing;

  -- Invoices are inserted as drafts so visits can be attached, then moved on below.
  insert into public.invoices (id, owner_id, patient_id, number, tax_enabled, tax_rate_basis_points, created_at, updated_at) values
    ('5eed0000-0000-4000-8000-000000000301', owner, '5eed0000-0000-4000-8000-000000000201', 1, false, 0,
     '2026-10-08T22:00:00Z', '2026-10-08T22:00:00Z'),
    ('5eed0000-0000-4000-8000-000000000302', owner, '5eed0000-0000-4000-8000-000000000201', 2, true, 500,
     '2026-10-22T22:00:00Z', '2026-10-22T22:00:00Z'),
    ('5eed0000-0000-4000-8000-000000000303', owner, '5eed0000-0000-4000-8000-000000000202', 3, false, 0,
     '2026-11-03T22:00:00Z', '2026-11-03T22:00:00Z')
  on conflict do nothing;

  insert into public.visits (id, owner_id, patient_id, visit_date, note, note_edited_at, invoice_id, created_at, updated_at) values
    ('5eed0000-0000-4000-8000-000000000401', owner, '5eed0000-0000-4000-8000-000000000201', '2026-10-01',
     'Made-up note. Lumbar flexion limited; started core activation exercises.',
     '2026-10-01T16:45:00Z', '5eed0000-0000-4000-8000-000000000301', '2026-10-01T16:45:00Z', '2026-10-01T16:45:00Z'),
    ('5eed0000-0000-4000-8000-000000000402', owner, '5eed0000-0000-4000-8000-000000000201', '2026-10-15',
     'Made-up note. Pain down to 3/10; progressed to bridges.',
     '2026-10-15T16:45:00Z', '5eed0000-0000-4000-8000-000000000302', '2026-10-15T16:45:00Z', '2026-10-15T16:45:00Z'),
    ('5eed0000-0000-4000-8000-000000000403', owner, '5eed0000-0000-4000-8000-000000000201', '2026-10-22',
     'Made-up note. Full range of motion; home programme updated.',
     '2026-10-22T16:45:00Z', '5eed0000-0000-4000-8000-000000000302', '2026-10-22T16:45:00Z', '2026-10-22T16:45:00Z'),
    ('5eed0000-0000-4000-8000-000000000404', owner, '5eed0000-0000-4000-8000-000000000202', '2026-11-03',
     'Made-up note. Mild swelling; balance work and taping.',
     '2026-11-03T17:30:00Z', '5eed0000-0000-4000-8000-000000000303', '2026-11-03T17:30:00Z', '2026-11-03T17:30:00Z'),
    ('5eed0000-0000-4000-8000-000000000405', owner, '5eed0000-0000-4000-8000-000000000203', '2026-10-28',
     'Made-up note. Initial assessment; rotator cuff strengthening started.',
     '2026-10-28T18:30:00Z', null, '2026-10-28T18:30:00Z', '2026-10-28T18:30:00Z'),
    ('5eed0000-0000-4000-8000-000000000406', owner, '5eed0000-0000-4000-8000-000000000203', '2026-11-04',
     'Made-up note. Overhead reach improving.',
     '2026-11-04T18:30:00Z', null, '2026-11-04T18:30:00Z', '2026-11-04T18:30:00Z'),
    ('5eed0000-0000-4000-8000-000000000407', owner, '5eed0000-0000-4000-8000-000000000204', '2026-11-06',
     '', '2026-11-06T19:30:00Z', null, '2026-11-06T19:30:00Z', '2026-11-06T19:30:00Z')
  on conflict do nothing;

  insert into public.invoice_lines (id, owner_id, invoice_id, price_item_id, name, unit_price_cents, quantity, position) values
    ('5eed0000-0000-4000-8000-000000000501', owner, '5eed0000-0000-4000-8000-000000000301',
     '5eed0000-0000-4000-8000-000000000101', 'Initial assessment', 12000, 1, 0),
    ('5eed0000-0000-4000-8000-000000000502', owner, '5eed0000-0000-4000-8000-000000000302',
     '5eed0000-0000-4000-8000-000000000102', 'Follow-up treatment', 9500, 2, 0),
    ('5eed0000-0000-4000-8000-000000000503', owner, '5eed0000-0000-4000-8000-000000000302',
     '5eed0000-0000-4000-8000-000000000103', 'Exercise band', 1500, 1, 1),
    ('5eed0000-0000-4000-8000-000000000504', owner, '5eed0000-0000-4000-8000-000000000303',
     '5eed0000-0000-4000-8000-000000000101', 'Initial assessment', 12000, 1, 0)
  on conflict do nothing;

  -- Move invoices 1 and 2 on from draft (only if they're still drafts, so a rerun
  -- never changes them).
  update public.invoices
     set status = 'sent', sent_at = '2026-10-08T22:05:00Z', updated_at = '2026-10-08T22:05:00Z'
   where id = '5eed0000-0000-4000-8000-000000000301' and status = 'draft';
  update public.invoices
     set status = 'paid', paid_at = '2026-10-12T15:00:00Z', updated_at = '2026-10-12T15:00:00Z'
   where id = '5eed0000-0000-4000-8000-000000000301' and status = 'sent' and paid_at is null;
  update public.invoices
     set status = 'sent', sent_at = '2026-10-22T22:05:00Z', updated_at = '2026-10-22T22:05:00Z'
   where id = '5eed0000-0000-4000-8000-000000000302' and status = 'draft';
end;
$$;
