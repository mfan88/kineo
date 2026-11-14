-- Narrow the reference exemption on locked invoices:
-- Deleting a visit or price item clears visit_id or price_item_id on lines copied
-- from it (on delete set null). That bookkeeping is allowed on any invoice, but on
-- a locked (sent, paid, or cancelled) invoice, visit_id and price_item_id may only
-- stay the same or be cleared to null, never repointed to a different visit or price item.
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
      = (to_jsonb(old) - 'price_item_id' - 'visit_id')
    and (new.price_item_id is not distinct from old.price_item_id or new.price_item_id is null)
    and (new.visit_id is not distinct from old.visit_id or new.visit_id is null) then
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
