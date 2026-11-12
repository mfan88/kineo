-- Creating an invoice with its visits as one all-or-nothing step, and fixing
-- number clashes between devices.
--
-- Each device proposes the next invoice number from its own copy. Two devices
-- working offline can propose the same one; this uses the next free number
-- instead, and sync brings the change back to the device. The apps only let an
-- invoice be sent once it has reached the server, so a patient never sees a
-- number that later changes.
--
-- Runs as the caller (security invoker): row-level security applies as usual.

create function public.create_invoice(
  p_id uuid,
  p_patient_id uuid,
  p_number integer,
  p_tax_rate_basis_points integer,
  p_visit_ids uuid[],
  p_created_at timestamptz
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

  insert into public.invoices
    (id, owner_id, patient_id, number, status, tax_enabled, tax_rate_basis_points, created_at, updated_at)
  values
    (p_id, owner, p_patient_id, invoice_number, 'draft', false, p_tax_rate_basis_points,
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

revoke all on function public.create_invoice(uuid, uuid, integer, integer, uuid[], timestamptz) from public, anon;
grant execute on function public.create_invoice(uuid, uuid, integer, integer, uuid[], timestamptz) to authenticated;
