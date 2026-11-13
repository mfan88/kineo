-- create_invoice carries Bill to (F3).
--
-- The apps work out Bill to (self-pay, or a patient funding's recipient and the
-- details shown on invoices) when they create the invoice, and send that copy as
-- p_billing with the rest of the invoice. Same all-or-nothing behaviour and number
-- fixing as 20261113120000_create_invoice.sql.
--
-- p_billing keys are the invoice's own columns: bill_to_kind, bill_to_name,
-- bill_to_address, bill_to_funding_name, patient_funding_id, bill_to_details.
-- bill_to_details may arrive as a JSON string (the apps keep jsonb as JSON text).
-- A missing key, or a null p_billing, means self-pay with the patient's name.
--
-- The 6-argument version stays for app builds that don't send Bill to; it now
-- calls this one with no billing.

create function public.create_invoice(
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
  matched integer;
  billing jsonb := coalesce(p_billing, '{}'::jsonb);
  details jsonb;
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

  invoice_number := p_number;
  if invoice_number is null or invoice_number < 1
    or exists (select 1 from public.invoices where owner_id = owner and number = invoice_number) then
    select coalesce(max(number), 0) + 1 into invoice_number
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
     patient_funding_id, bill_to_details, created_at, updated_at)
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

revoke all on function public.create_invoice(uuid, uuid, integer, integer, uuid[], timestamptz, jsonb)
  from public, anon;
grant execute on function public.create_invoice(uuid, uuid, integer, integer, uuid[], timestamptz, jsonb)
  to authenticated;

-- Older app builds: self-pay with the patient's name.
create or replace function public.create_invoice(
  p_id uuid,
  p_patient_id uuid,
  p_number integer,
  p_tax_rate_basis_points integer,
  p_visit_ids uuid[],
  p_created_at timestamptz
)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select public.create_invoice(
    p_id, p_patient_id, p_number, p_tax_rate_basis_points, p_visit_ids, p_created_at, null::jsonb
  );
$$;
