-- Invoice numbers built from parts (N2).
--
-- A practitioner's invoice numbers are built from four parts in an order they
-- choose: prefix (text), year, month and number. Prefix, year and month can each be
-- turned off; the number is always shown, padded to 1–6 digits. One separator goes
-- between the parts. Counting never restarts (the year is only shown), and a
-- starting number lets a practice carry on from invoices made before Kineō.
-- The same rules are in @kineo/shared (invoices/number.ts); public.build_invoice_number
-- below must give the same result (tests in both check the same cases).
--
-- A sent invoice keeps the number it was sent with (display_number), whatever the
-- settings say later. The apps work it out when sending, from the invoice's date in
-- the practitioner's time zone; the server fills it in (from the UTC date) only for
-- an app build that doesn't send it. Once sent it never changes.

-- Whether `order_text` is the four parts, each once, comma-separated.
create function public.is_invoice_number_order(order_text text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    (select array_agg(part order by part) from unnest(string_to_array(order_text, ',')) as part)
      = array['month', 'number', 'prefix', 'year'],
    false
  );
$$;

alter table public.practice_settings add column invoice_number_order text not null
  default 'prefix,year,month,number' check (public.is_invoice_number_order(invoice_number_order));
alter table public.practice_settings add column invoice_number_show_prefix boolean not null
  default true;
alter table public.practice_settings add column invoice_number_show_year boolean not null
  default false;
alter table public.practice_settings add column invoice_number_show_month boolean not null
  default false;
alter table public.practice_settings add column invoice_number_separator text not null
  default '-' check (invoice_number_separator in ('-', '/', '.', ''));
alter table public.practice_settings add column invoice_number_digits integer not null
  default 4 check (invoice_number_digits between 1 and 6);
alter table public.practice_settings add column invoice_number_start integer not null
  default 1 check (invoice_number_start between 1 and 99999999);

alter table public.invoices
  add column display_number text
    check (display_number is null or (btrim(display_number) <> '' and char_length(display_number) <= 60));

-- Invoices already sent keep the number they show today: the prefix, then the
-- number padded to four digits (longer numbers in full). Done before the prefix is
-- split below, and before the lock that follows.
update public.invoices invoice
   set display_number = btrim(coalesce(
         (select settings.invoice_number_prefix from public.practice_settings settings
           where settings.owner_id = invoice.owner_id),
         ''
       ))
       || case when char_length(invoice.number::text) < 4
               then lpad(invoice.number::text, 4, '0')
               else invoice.number::text end
 where invoice.status <> 'draft';

-- "INV-" becomes prefix "INV" with "-" between the parts, so INV-0004 still reads
-- INV-0004. A prefix without one of the separators at its end keeps it all and has
-- none between the parts ("INV" + "0004" = INV0004, as today).
-- (One statement, so both columns are worked out from the prefix as it was.)
update public.practice_settings
   set invoice_number_separator = case
         when right(btrim(invoice_number_prefix), 1) in ('-', '/', '.')
           then right(btrim(invoice_number_prefix), 1)
         when btrim(invoice_number_prefix) <> '' then ''
         else invoice_number_separator
       end,
       invoice_number_prefix = case
         when right(btrim(invoice_number_prefix), 1) in ('-', '/', '.')
           then btrim(left(btrim(invoice_number_prefix), -1))
         else btrim(invoice_number_prefix)
       end;

-- The number shown on an invoice, e.g. INV-2026-0042, from a practice's settings,
-- the invoice's number and its date. Same as buildInvoiceNumber in @kineo/shared.
create function public.build_invoice_number(
  settings public.practice_settings,
  invoice_number integer,
  issued_on date
)
returns text
language sql
stable
set search_path = ''
as $$
  select string_agg(value, coalesce(settings.invoice_number_separator, '-') order by position)
    from (
      select position,
             case part
               when 'prefix' then
                 case when coalesce(settings.invoice_number_show_prefix, true)
                      then btrim(coalesce(settings.invoice_number_prefix, '')) else '' end
               when 'year' then
                 case when coalesce(settings.invoice_number_show_year, false)
                      then to_char(issued_on, 'YYYY') else '' end
               when 'month' then
                 case when coalesce(settings.invoice_number_show_month, false)
                      then to_char(issued_on, 'MM') else '' end
               else
                 case when char_length(invoice_number::text) < coalesce(settings.invoice_number_digits, 4)
                      then lpad(invoice_number::text, coalesce(settings.invoice_number_digits, 4), '0')
                      else invoice_number::text end
             end as value
        from unnest(string_to_array(
               coalesce(settings.invoice_number_order, 'prefix,year,month,number'), ','
             )) with ordinality as parts(part, position)
    ) as built
   where value <> '';
$$;

-- A draft has no fixed number yet; sending fixes it; after that it's locked.
create function public.invoices_display_number()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  settings public.practice_settings;
begin
  if new.status = 'draft' then
    if tg_op = 'UPDATE' and old.status <> 'draft' then
      -- Refused by invoices_status_and_tax (never back to draft); leave it be.
      return new;
    end if;
    new.display_number := null;
  elsif tg_op = 'INSERT' or old.status = 'draft' then
    if new.display_number is null or btrim(new.display_number) = '' then
      -- An app build that doesn't send the number: work it out here.
      select * into settings from public.practice_settings where owner_id = new.owner_id;
      new.display_number := public.build_invoice_number(
        settings, new.number, (coalesce(new.sent_at, now()) at time zone 'UTC')::date
      );
    end if;
  elsif new.display_number is distinct from old.display_number then
    raise exception 'An invoice''s number can''t be changed once it''s sent.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger invoices_display_number
  before insert or update on public.invoices
  for each row execute function public.invoices_display_number();

-- create_invoice as in 20261114110000_create_invoice_billing.sql, except that a new
-- invoice's number is never below the practice's starting number.
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
