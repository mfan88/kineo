-- Invoice copy of shown patient details (MAR-67).
--
-- Invoices snapshot the patient's shown details (parent names, email, phone, and
-- custom details marked show_on_invoice) when created so historical invoices stay
-- unchanged if the patient record is edited later.
--
-- Shapes (snake_case keys):
--   invoices.patient_details  [{"id", "label", "value"}] (up to 23 entries)
--
-- As with other jsonb columns, apps keep jsonb locally as JSON text and upload it
-- as a JSON string, so `invoices_patient_details_from_text` parses string payloads
-- back into real jsonb before `invoices_status_and_tax` and CHECK constraints run.

-- Validation ------------------------------------------------------------------

-- An invoice's copied patient details: up to 23 entries (parents, email, phone
-- plus up to 20 custom details), each with a non-blank id, a non-blank label of
-- at most 80 characters, and a string value of at most 500 characters.
create function public.invoice_patient_details_valid(d jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when d is null or jsonb_typeof(d) <> 'array' then false
    when jsonb_array_length(d) = 0 then true
    when jsonb_array_length(d) > 23 then false
    else coalesce((
      select bool_and(
               coalesce(
                 jsonb_typeof(e) = 'object'
                 and jsonb_typeof(e -> 'id') = 'string'
                 and btrim(e ->> 'id') <> ''
                 and jsonb_typeof(e -> 'label') = 'string'
                 and btrim(e ->> 'label') <> ''
                 and char_length(e ->> 'label') <= 80
                 and jsonb_typeof(e -> 'value') = 'string'
                 and char_length(e ->> 'value') <= 500,
                 false
               )
             )
        from jsonb_array_elements(d) as e
    ), false)
  end;
$$;

-- Column and constraint -------------------------------------------------------

alter table public.invoices
  add column patient_details jsonb not null default '[]'::jsonb;

alter table public.invoices
  add constraint invoices_patient_details_valid
    check (public.invoice_patient_details_valid(patient_details));

-- jsonb uploaded as a JSON string ---------------------------------------------

create function public.invoices_patient_details_from_text()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if jsonb_typeof(new.patient_details) = 'string' then
    new.patient_details := (new.patient_details #>> '{}')::jsonb;
  end if;
  return new;
end;
$$;

create trigger invoices_patient_details_from_text
  before insert or update on public.invoices
  for each row execute function public.invoices_patient_details_from_text();

-- Locks -----------------------------------------------------------------------

-- Status, tax, Bill to, cancellation rules as in 20261114100000_funding_locks.sql,
-- plus locking patient_details once an invoice is sent.
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

  if old.status <> 'draft'
    and new.patient_details is distinct from old.patient_details then
    raise exception 'Patient details can''t be changed once an invoice is sent.'
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

-- create_invoice --------------------------------------------------------------

-- create_invoice as in 20261115090000_invoice_numbers.sql, plus copying
-- optional billing -> 'patient_details' onto the created draft invoice.
create or replace function public.create_invoice(
  p_id uuid,
  p_patient_id uuid,
  p_number integer,
  p_tax_rate_basis_points integer,
  p_visit_ids uuid[],
  p_created_at timestamptz,
  p_billing jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner text := public.requesting_owner_id();
  invoice_number integer;
  start_number integer;
  matched integer;
  billing jsonb := coalesce(p_billing, '{}'::jsonb);
  details jsonb;
  copied_patient_details jsonb;
  funding_id uuid;
begin
  if owner is null then
    raise exception 'Sign in to create invoices.' using errcode = 'insufficient_privilege';
  end if;

  -- One invoice creation at a time per practitioner, so two calls can't pick the
  -- same number.
  perform pg_advisory_xact_lock(hashtextextended('kineo.create_invoice:' || owner, 0));

  -- Already created (a retry after the first call's reply was lost): nothing to do.
  select number into invoice_number from public.invoices where id = p_id;
  if found then
    return invoice_number;
  end if;

  if coalesce(cardinality(p_visit_ids), 0) = 0 then
    raise exception 'Choose at least one visit to invoice.' using errcode = 'check_violation';
  end if;

  start_number := coalesce(
    (select invoice_number_start from public.practice_settings where owner_id = owner), 1
  );
  invoice_number := p_number;
  if invoice_number is null or invoice_number < start_number
    or exists (select 1 from public.invoices where owner_id = owner and number = invoice_number) then
    -- The next free number: one more than the highest, and at least the starting number.
    select greatest(coalesce(max(number), 0) + 1, start_number) into invoice_number
      from public.invoices where owner_id = owner;
  end if;

  details := case
    when jsonb_typeof(billing -> 'bill_to_details') = 'string'
      then (billing ->> 'bill_to_details')::jsonb
    when jsonb_typeof(billing -> 'bill_to_details') = 'array'
      then billing -> 'bill_to_details'
    -- Missing or JSON null (an app with nothing to send).
    else '[]'::jsonb
  end;
  copied_patient_details := case
    when jsonb_typeof(billing -> 'patient_details') = 'string'
      then (billing ->> 'patient_details')::jsonb
    when jsonb_typeof(billing -> 'patient_details') = 'array'
      then billing -> 'patient_details'
    -- Missing or JSON null (an app with nothing to send).
    else '[]'::jsonb
  end;
  -- Keep the link only to one of this patient's own fundings (another device may
  -- have removed it meanwhile); the copied details stay either way.
  funding_id := nullif(billing ->> 'patient_funding_id', '')::uuid;
  if funding_id is not null and not exists (
    select 1 from public.patient_fundings
     where id = funding_id and owner_id = owner and patient_id = p_patient_id
  ) then
    funding_id := null;
  end if;

  insert into public.invoices
    (id, owner_id, patient_id, number, status, tax_enabled, tax_rate_basis_points,
     bill_to_kind, bill_to_name, bill_to_address, bill_to_funding_name,
     patient_funding_id, bill_to_details, patient_details, created_at, updated_at)
  values
    (p_id, owner, p_patient_id, invoice_number, 'draft', false, p_tax_rate_basis_points,
     coalesce(billing ->> 'bill_to_kind', 'patient'),
     coalesce(
       billing ->> 'bill_to_name',
       (select full_name from public.patients where id = p_patient_id and owner_id = owner),
       ''
     ),
     coalesce(billing ->> 'bill_to_address', ''),
     coalesce(billing ->> 'bill_to_funding_name', ''),
     funding_id,
     details,
     copied_patient_details,
     p_created_at, p_created_at);

  -- Every visit must be this practitioner's, for this patient, and not on another
  -- invoice; otherwise nothing is saved.
  update public.visits
     set invoice_id = p_id, updated_at = p_created_at
   where id = any(p_visit_ids)
     and owner_id = owner
     and patient_id = p_patient_id
     and invoice_id is null;
  get diagnostics matched = row_count;

  if matched <> (select count(distinct v) from unnest(p_visit_ids) as v) then
    raise exception 'One of these visits is already on another invoice, or no longer exists.'
      using errcode = 'check_violation';
  end if;

  return invoice_number;
end;
$$;
