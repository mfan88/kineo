-- Cancelling a sent invoice (U17).
--
-- A sent invoice that was a mistake can be cancelled. It keeps its number (the
-- number is never reused: the row stays), stays as a read-only record, and its
-- visits go back to "Ready to invoice". Since the visits are released, the
-- invoice keeps its own copy of their dates in cancelled_visit_dates.
--
--   status moves draft → sent → paid, paid → sent (undo), and sent → cancelled.
--   Nothing moves out of cancelled. A paid invoice can't be cancelled (undo the
--   payment first) and a draft doesn't need it.

alter table public.invoices add column cancelled_at timestamptz;
alter table public.invoices add column cancelled_visit_dates jsonb;

alter table public.invoices drop constraint invoices_status_check;
alter table public.invoices
  add constraint invoices_status_check
  check (status in ('draft', 'sent', 'paid', 'cancelled'));

alter table public.invoices drop constraint invoices_dates_match_status;
alter table public.invoices
  add constraint invoices_dates_match_status check (
    (status = 'draft'
      and sent_at is null and paid_at is null and cancelled_at is null
      and cancelled_visit_dates is null)
    or (status = 'sent'
      and sent_at is not null and paid_at is null and cancelled_at is null
      and cancelled_visit_dates is null)
    or (status = 'paid'
      and sent_at is not null and paid_at is not null and cancelled_at is null
      and cancelled_visit_dates is null)
    or (status = 'cancelled'
      and sent_at is not null and paid_at is null and cancelled_at is not null
      and jsonb_typeof(cancelled_visit_dates) = 'array')
  );

-- Status and tax rules, now including sent → cancelled. The copy of the visit
-- dates is written once, with the status change, and never changes after.
create or replace function public.invoices_status_and_tax()
returns trigger
language plpgsql
set search_path = ''
as $$
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

-- A visit can be put on or taken off an invoice only while that invoice is a
-- draft. The one exception: a cancelled invoice lets go of its visits (and only
-- lets go: nothing is ever added to it).
create or replace function public.visits_invoice_change_only_on_draft()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  old_status text;
  new_status text;
begin
  if new.invoice_id is not distinct from old.invoice_id then
    return new;
  end if;

  if old.invoice_id is not null then
    select status into old_status from public.invoices where id = old.invoice_id;
    if old_status is distinct from 'draft'
      and not (old_status = 'cancelled' and new.invoice_id is null) then
      raise exception 'Visits can''t be removed once an invoice is sent.'
        using errcode = 'check_violation';
    end if;
  end if;

  if new.invoice_id is not null then
    select status into new_status from public.invoices where id = new.invoice_id;
    if new_status is distinct from 'draft' then
      raise exception 'Visits can''t be added once an invoice is sent.'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;
