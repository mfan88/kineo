-- Funding locks and send rules (F2).
--
-- Bill to follows the invoice rules: editable while a draft, locked once sent.
-- Sending a draft is refused, with a message that says what to fill in, when:
--   1–3. a funded invoice has no recipient name or address;
--   4.   a detail shown on the invoice is empty;
--   5.   a line on a funded invoice has no visit date, or a date that isn't one of
--        the invoice's visits;
--   6.   a self-pay invoice has no name to bill.
-- The apps check the same rules first (@kineo/shared billToProblems); the messages
-- here match those word for word. Each refusal is a check_violation.
--
-- Line dates need nothing new: invoice_lines_only_on_draft already locks every
-- column of a line once its invoice is sent.

-- "Billing number" → "billing number", for "Add the billing number before
-- sending." A label that starts with an acronym ("ICBC claim number") is kept.
-- Same rule as sentenceLabel in @kineo/shared.
create function public.sentence_label(label text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when char_length(label) >= 2 and substr(label, 2, 1) <> upper(substr(label, 2, 1))
      then lower(substr(label, 1, 1)) || substr(label, 2)
    else label
  end;
$$;

-- A self-pay invoice saved without a name bills the patient by name. Apps that
-- don't send Bill to yet (and the seed) get the right name this way.
create function public.invoices_bill_to_name_default()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.bill_to_kind = 'patient' and btrim(new.bill_to_name) = '' then
    new.bill_to_name := coalesce(
      (select full_name from public.patients
        where id = new.patient_id and owner_id = new.owner_id),
      ''
    );
  end if;
  return new;
end;
$$;

create trigger invoices_bill_to_name_default
  before insert on public.invoices
  for each row execute function public.invoices_bill_to_name_default();

-- Status, tax and cancellation rules as in 20261113180000_cancel_invoice.sql,
-- plus the Bill to lock and the send checks.
create or replace function public.invoices_status_and_tax()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  missing_label text;
begin
  -- The apps upload a jsonb value as the JSON text it was stored as locally, which
  -- arrives as a JSON string. Read it back as the array it holds.
  if jsonb_typeof(new.cancelled_visit_dates) = 'string' then
    new.cancelled_visit_dates := (new.cancelled_visit_dates #>> '{}')::jsonb;
  end if;

  if new.status is distinct from old.status
    and not (
      (old.status = 'draft' and new.status = 'sent')
      or (old.status = 'sent' and new.status = 'paid')
      or (old.status = 'paid' and new.status = 'sent')
      or (old.status = 'sent' and new.status = 'cancelled')
    ) then
    raise exception '%',
      case
        when old.status = 'cancelled' then 'A cancelled invoice can''t be changed.'
        when new.status = 'cancelled' and old.status = 'paid' then
          'Undo the payment before cancelling this invoice.'
        when new.status = 'cancelled' then 'Only a sent invoice can be cancelled.'
        when new.status = 'draft' then 'A sent invoice can''t go back to draft.'
        else 'An invoice has to be sent before it can be marked paid.'
      end
      using errcode = 'check_violation';
  end if;

  -- Bill to is fixed once sent. The link to the patient funding may still be
  -- cleared (deleting the funding sets it null); that's bookkeeping, not an edit.
  if old.status <> 'draft'
    and (new.bill_to_kind is distinct from old.bill_to_kind
         or new.bill_to_name is distinct from old.bill_to_name
         or new.bill_to_address is distinct from old.bill_to_address
         or new.bill_to_funding_name is distinct from old.bill_to_funding_name
         or new.bill_to_details is distinct from old.bill_to_details) then
    raise exception 'Bill to can''t be changed once an invoice is sent.'
      using errcode = 'check_violation';
  end if;

  if old.status = 'draft' and new.status = 'sent' then
    if new.bill_to_kind = 'funding' then
      if btrim(new.bill_to_name) = '' and btrim(new.bill_to_address) = '' then
        raise exception '%',
          format('%s has no recipient name or address. Add them in Settings, then send.',
                 new.bill_to_funding_name)
          using errcode = 'check_violation';
      end if;
      if btrim(new.bill_to_name) = '' then
        raise exception '%',
          format('%s has no recipient name. Add it in Settings, then send.',
                 new.bill_to_funding_name)
          using errcode = 'check_violation';
      end if;
      if btrim(new.bill_to_address) = '' then
        raise exception '%',
          format('%s has no recipient address. Add it in Settings, then send.',
                 new.bill_to_funding_name)
          using errcode = 'check_violation';
      end if;

      select detail ->> 'label' into missing_label
        from jsonb_array_elements(new.bill_to_details) with ordinality as d(detail, position)
       where btrim(coalesce(detail ->> 'value', '')) = ''
       order by position
       limit 1;
      if missing_label is not null then
        raise exception '%',
          format('Add the %s before sending.', public.sentence_label(missing_label))
          using errcode = 'check_violation';
      end if;

      if exists (
        select 1 from public.invoice_lines line
         where line.invoice_id = new.id
           and (line.service_date is null
                or not exists (
                  select 1 from public.visits visit
                   where visit.invoice_id = new.id
                     and visit.visit_date = line.service_date
                ))
      ) then
        raise exception 'Pick a visit date for each line item before sending.'
          using errcode = 'check_violation';
      end if;
    elsif btrim(new.bill_to_name) = '' then
      raise exception 'Add the patient''s name before sending.'
        using errcode = 'check_violation';
    end if;
  end if;

  if old.status = 'cancelled'
    and (new.cancelled_visit_dates is distinct from old.cancelled_visit_dates
         or new.cancelled_at is distinct from old.cancelled_at) then
    raise exception 'A cancelled invoice can''t be changed.'
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
