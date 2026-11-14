-- Items on a visit note, lines that remember their visit, and invoice branding (phase 9).
--
-- 1. visit_items: copies of price list items chosen while writing a note. When the
--    visit goes on an invoice, the apps copy them onto it as lines. They can change
--    only while the visit is not on an invoice; after that, change the lines on the
--    invoice instead. The lock applies to the apps' own requests (a signed-in
--    practitioner), so an admin removing a practice's data still works, the same
--    exception as visits_corrections.
-- 2. invoice_lines.visit_id: which visit a line was copied from (null for lines added
--    on the invoice itself). Cleared if that visit is deleted.
-- 3. invoice_styles: an optional footer logo (same rules as the header logo) and the
--    "Made with Kineō" switch, on by default.

-- Lets other tables point at a visit and its owner together (id is already unique).
alter table public.visits add constraint visits_id_owner_id_key unique (id, owner_id);

-- Visit items ------------------------------------------------------------------

create table public.visit_items (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null check (btrim(owner_id) <> ''),
  visit_id uuid not null,
  -- Cleared if that price list item is deleted; the copied name and price stay.
  price_item_id uuid references public.price_items (id) on delete set null,
  name text not null check (btrim(name) <> ''),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  quantity integer not null check (quantity >= 1),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  constraint visit_items_visit_same_owner
    foreign key (visit_id, owner_id) references public.visits (id, owner_id) on delete cascade
);

create index visit_items_visit_id_idx on public.visit_items (visit_id);

-- Row-level security, as in 20261111222421_row_level_security.sql ------------------

alter table public.visit_items enable row level security;
alter table public.visit_items alter column owner_id set default public.requesting_owner_id();
revoke all on public.visit_items from anon;

create policy visit_items_select_own on public.visit_items for select to authenticated
  using (owner_id = (select public.requesting_owner_id()));
create policy visit_items_insert_own on public.visit_items for insert to authenticated
  with check (owner_id = (select public.requesting_owner_id()));
create policy visit_items_update_own on public.visit_items for update to authenticated
  using (owner_id = (select public.requesting_owner_id()))
  with check (owner_id = (select public.requesting_owner_id()));
create policy visit_items_delete_own on public.visit_items for delete to authenticated
  using (owner_id = (select public.requesting_owner_id()));

-- Offline copies on every device (infra/powersync/sync-config.yaml lists it too).
alter publication powersync add table public.visit_items;

-- Items are locked while the visit is on an invoice -------------------------------

create function public.visit_items_only_while_uninvoiced()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Only the apps' requests (a signed-in practitioner): an admin removing a whole
  -- practice deletes items too.
  if public.requesting_owner_id() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- A visit that doesn't exist (or isn't visible) isn't this lock's to report: it's
  -- being deleted (its items go with it), or the foreign key or row-level security
  -- refuses the row.
  if (tg_op <> 'DELETE' and exists (
        select 1 from public.visits where id = new.visit_id and invoice_id is not null))
    or (tg_op <> 'INSERT' and exists (
        select 1 from public.visits where id = old.visit_id and invoice_id is not null)) then
    raise exception 'This visit is on an invoice, so its items can''t be changed. Change the lines on the invoice instead.'
      using errcode = 'check_violation';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger visit_items_only_while_uninvoiced
  before insert or update or delete on public.visit_items
  for each row execute function public.visit_items_only_while_uninvoiced();

-- Lines remember their visit -------------------------------------------------------

alter table public.invoice_lines add column visit_id uuid;
alter table public.invoice_lines add constraint invoice_lines_visit_same_owner
  foreign key (visit_id, owner_id) references public.visits (id, owner_id)
  on delete set null (visit_id);
create index invoice_lines_visit_id_idx on public.invoice_lines (visit_id);

-- Deleting a visit clears visit_id on lines copied from it (on delete set null).
-- Like clearing price_item_id, that's bookkeeping, not an edit, so it's allowed on
-- any invoice. Otherwise the same as 20261113090000_invoice_locks.sql.
create or replace function public.invoice_lines_only_on_draft()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target uuid := case when tg_op = 'DELETE' then old.invoice_id else new.invoice_id end;
  invoice_status text;
begin
  if tg_op = 'UPDATE'
    and (to_jsonb(new) - 'price_item_id' - 'visit_id')
      = (to_jsonb(old) - 'price_item_id' - 'visit_id') then
    return new;
  end if;

  select status into invoice_status from public.invoices where id = target;

  -- No invoice visible: it's being deleted (its lines go with it), it doesn't exist
  -- (the foreign key refuses), or it's someone else's (row-level security refuses).
  -- None of those are this lock's to report.
  if invoice_status is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if invoice_status is distinct from 'draft'
    or (tg_op = 'UPDATE' and new.invoice_id is distinct from old.invoice_id
        and (select status from public.invoices where id = old.invoice_id) is distinct from 'draft') then
    raise exception 'Line items can''t be changed once an invoice is sent.'
      using errcode = 'check_violation';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- Invoice branding -----------------------------------------------------------------

alter table public.invoice_styles
  add column footer_logo_path text check (footer_logo_path is null or btrim(footer_logo_path) <> ''),
  add column show_made_with boolean not null default true;
