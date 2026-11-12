-- The server enforces the invoice locks itself, whichever app writes (the apps
-- check the same rules in @kineo/shared before saving):
--   - line items change only while the invoice is a draft;
--   - the tax fields change only while the invoice is a draft;
--   - status moves only draft → sent → paid, and paid → sent (undoing a payment);
--   - a visit's note locks once its invoice is paid.
-- (Visits on and off an invoice are already locked by the create_tables triggers.)
-- Each refusal is a check_violation with a message meant for the practitioner.

-- Line items: insert, change or delete only on a draft invoice.
create function public.invoice_lines_only_on_draft()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target uuid := case when tg_op = 'DELETE' then old.invoice_id else new.invoice_id end;
  invoice_status text;
begin
  -- Deleting a price item clears the link on lines copied from it (on delete set
  -- null). That's bookkeeping, not an edit, so it's allowed on any invoice.
  if tg_op = 'UPDATE'
    and (to_jsonb(new) - 'price_item_id') = (to_jsonb(old) - 'price_item_id') then
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

create trigger invoice_lines_only_on_draft
  before insert or update or delete on public.invoice_lines
  for each row execute function public.invoice_lines_only_on_draft();

-- Invoices: allowed status changes, and tax fixed once sent.
create function public.invoices_status_and_tax()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
    and not (
      (old.status = 'draft' and new.status = 'sent')
      or (old.status = 'sent' and new.status = 'paid')
      or (old.status = 'paid' and new.status = 'sent')
    ) then
    raise exception '%',
      case
        when new.status = 'draft' then 'A sent invoice can''t go back to draft.'
        else 'An invoice has to be sent before it can be marked paid.'
      end
      using errcode = 'check_violation';
  end if;

  if old.status <> 'draft'
    and (new.tax_enabled is distinct from old.tax_enabled
         or new.tax_rate_basis_points is distinct from old.tax_rate_basis_points) then
    raise exception 'Tax can''t be changed once an invoice is sent.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger invoices_status_and_tax
  before update on public.invoices
  for each row execute function public.invoices_status_and_tax();

-- Visit notes: locked once the visit's invoice is paid.
create function public.visits_note_locked_once_paid()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.note is distinct from old.note
    and old.invoice_id is not null
    and (select status from public.invoices where id = old.invoice_id) = 'paid' then
    raise exception 'Notes can''t be changed once an invoice is paid.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger visits_note_locked_once_paid
  before update of note on public.visits
  for each row execute function public.visits_note_locked_once_paid();
