-- Funding (F1): funding types, patient fundings, and the Bill to copy on invoices.
--
-- A funding type (desktop Settings) is the practitioner's template for a funder:
-- who gets billed (recipient name and address) and which details print on the
-- invoice. A patient funding puts one patient on one type for one period, with
-- this patient's values for the type's details. An invoice copies Bill to when it
-- is created (see docs/funding-info.md and docs/funding-tasks.md, decision 1).
--
-- Detail lists and values are jsonb. The apps keep jsonb locally as JSON text and
-- upload it as a JSON string, so each jsonb column has a trigger that reads a
-- string back as the value it holds (as cancelled_visit_dates does). BEFORE
-- triggers run before CHECK constraints, so the checks see the real value.
--
-- Shapes (snake_case keys):
--   funding_types.details          [{"id", "label", "kind": "text"|"date", "show_on_invoice"}]
--   patient_fundings.detail_values {"<detail id>": "value"}
--   invoices.bill_to_details       [{"id", "label", "value"}] (shown details only)

-- Validation ----------------------------------------------------------------

-- A type's details: up to 20, each with an id, a non-blank label of at most 80
-- characters, a kind and a Show on invoice flag. Ids and labels (ignoring case and
-- outer spaces) are unique within the type.
create function public.funding_details_valid(d jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when d is null or jsonb_typeof(d) <> 'array' then false
    when jsonb_array_length(d) > 20 then false
    else coalesce((
      select bool_and(
               jsonb_typeof(e) = 'object'
               and jsonb_typeof(e -> 'id') = 'string'
               and (e ->> 'id') ~ '^[0-9a-f-]{36}$'
               and jsonb_typeof(e -> 'label') = 'string'
               and btrim(e ->> 'label') <> ''
               and char_length(e ->> 'label') <= 80
               and jsonb_typeof(e -> 'kind') = 'string'
               and (e ->> 'kind') in ('text', 'date')
               and jsonb_typeof(e -> 'show_on_invoice') = 'boolean'
             )
             and count(distinct lower(btrim(e ->> 'label'))) = count(*)
             and count(distinct e ->> 'id') = count(*)
        from jsonb_array_elements(d) as e
    ), true)
  end;
$$;

-- A patient funding's values: an object of at most 20 strings of at most 200
-- characters each.
create function public.funding_values_valid(v jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when v is null or jsonb_typeof(v) <> 'object' then false
    else (
      select count(*) <= 20
             and coalesce(bool_and(jsonb_typeof(value) = 'string'
                                   and char_length(value #>> '{}') <= 200), true)
        from jsonb_each(v)
    )
  end;
$$;

-- An invoice's copied details: up to 20, each with an id, a non-blank label of at
-- most 80 characters and a value of at most 200.
create function public.bill_to_details_valid(d jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when d is null or jsonb_typeof(d) <> 'array' then false
    when jsonb_array_length(d) > 20 then false
    else coalesce((
      select bool_and(
               jsonb_typeof(e) = 'object'
               and jsonb_typeof(e -> 'id') = 'string'
               and jsonb_typeof(e -> 'label') = 'string'
               and btrim(e ->> 'label') <> ''
               and char_length(e ->> 'label') <= 80
               and jsonb_typeof(e -> 'value') = 'string'
               and char_length(e ->> 'value') <= 200
             )
        from jsonb_array_elements(d) as e
    ), true)
  end;
$$;

-- Tables ----------------------------------------------------------------------

-- A recipient may be blank while the practitioner fills it in; sending an invoice
-- to a type without one is refused (20261114100000_funding_locks.sql).
create table public.funding_types (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null check (btrim(owner_id) <> ''),
  name text not null check (btrim(name) <> '' and char_length(name) <= 80),
  recipient_name text not null default '' check (char_length(recipient_name) <= 200),
  recipient_address text not null default '' check (char_length(recipient_address) <= 500),
  details jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Lets patient fundings require a type with the same owner.
  unique (id, owner_id),
  constraint funding_types_details_valid check (public.funding_details_valid(details))
);

create index funding_types_owner_id_idx on public.funding_types (owner_id);

-- One patient on one funding type for one period. A new funding period is a new
-- row: end the old one (ended_on), add the new one. Deleting the type keeps the
-- row but clears its link; the apps then hide it.
create table public.patient_fundings (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null check (btrim(owner_id) <> ''),
  patient_id uuid not null,
  funding_type_id uuid,
  detail_values jsonb not null default '{}'::jsonb,
  period_start date,
  period_end date,
  ended_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint patient_fundings_patient_same_owner
    foreign key (patient_id, owner_id) references public.patients (id, owner_id),
  constraint patient_fundings_type_same_owner
    foreign key (funding_type_id, owner_id) references public.funding_types (id, owner_id)
    on delete set null (funding_type_id),
  constraint patient_fundings_values_valid check (public.funding_values_valid(detail_values)),
  constraint patient_fundings_period_order
    check (period_start is null or period_end is null or period_end >= period_start),
  -- Lets invoices require a patient funding with the same owner.
  unique (id, owner_id)
);

create index patient_fundings_patient_id_idx on public.patient_fundings (patient_id);
create index patient_fundings_funding_type_id_idx on public.patient_fundings (funding_type_id);

-- A self-pay invoice may carry the patient's address (optional).
alter table public.patients add column billing_address text not null default ''
  check (char_length(billing_address) <= 500);

-- Bill to, copied onto the invoice when it's created. 'patient' is self-pay (the
-- patient's name, address optional); 'funding' bills a funder, with the type's
-- name, the recipient and the details shown on invoices.
alter table public.invoices add column bill_to_kind text not null default 'patient'
  check (bill_to_kind in ('patient', 'funding'));
alter table public.invoices add column bill_to_name text not null default ''
  check (char_length(bill_to_name) <= 200);
alter table public.invoices add column bill_to_address text not null default ''
  check (char_length(bill_to_address) <= 500);
alter table public.invoices add column bill_to_funding_name text not null default ''
  check (char_length(bill_to_funding_name) <= 80);
alter table public.invoices add column patient_funding_id uuid;
alter table public.invoices add column bill_to_details jsonb not null default '[]'::jsonb;

alter table public.invoices
  add constraint invoices_patient_funding_same_owner
    foreign key (patient_funding_id, owner_id) references public.patient_fundings (id, owner_id)
    on delete set null (patient_funding_id);
alter table public.invoices
  add constraint invoices_bill_to_details_valid check (public.bill_to_details_valid(bill_to_details));
alter table public.invoices
  add constraint invoices_bill_to_kind_fields check (
    (bill_to_kind = 'patient'
      and bill_to_funding_name = ''
      and patient_funding_id is null
      and bill_to_details = '[]'::jsonb)
    or (bill_to_kind = 'funding' and btrim(bill_to_funding_name) <> '')
  );

-- On a funded invoice each line carries the date of the visit it bills.
alter table public.invoice_lines add column service_date date;

-- Invoices made before this bill the patient by name.
update public.invoices i
   set bill_to_name = p.full_name
  from public.patients p
 where p.id = i.patient_id
   and i.bill_to_name = '';

-- jsonb uploaded as a JSON string ----------------------------------------------

create function public.funding_types_details_from_text()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if jsonb_typeof(new.details) = 'string' then
    new.details := (new.details #>> '{}')::jsonb;
  end if;
  return new;
end;
$$;

create trigger funding_types_details_from_text
  before insert or update on public.funding_types
  for each row execute function public.funding_types_details_from_text();

create function public.patient_fundings_values_from_text()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if jsonb_typeof(new.detail_values) = 'string' then
    new.detail_values := (new.detail_values #>> '{}')::jsonb;
  end if;
  return new;
end;
$$;

create trigger patient_fundings_values_from_text
  before insert or update on public.patient_fundings
  for each row execute function public.patient_fundings_values_from_text();

create function public.invoices_bill_to_details_from_text()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if jsonb_typeof(new.bill_to_details) = 'string' then
    new.bill_to_details := (new.bill_to_details #>> '{}')::jsonb;
  end if;
  return new;
end;
$$;

create trigger invoices_bill_to_details_from_text
  before insert or update on public.invoices
  for each row execute function public.invoices_bill_to_details_from_text();

-- A funding type in use can't be deleted ------------------------------------------

-- Refused while any patient has an active funding of the type (not ended, period
-- not over). Ended fundings don't hold it back: their link is cleared instead.
create function public.funding_types_delete_unused()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.patient_fundings
     where funding_type_id = old.id
       and ended_on is null
       and (period_end is null or period_end >= current_date)
  ) then
    raise exception 'Move this type''s patients to another type before deleting it.'
      using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

create trigger funding_types_delete_unused
  before delete on public.funding_types
  for each row execute function public.funding_types_delete_unused();

-- Row-level security, as in 20261111222421_row_level_security.sql ------------------

do $$
declare
  table_name text;
begin
  foreach table_name in array array['funding_types', 'patient_fundings']
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format(
      'alter table public.%I alter column owner_id set default public.requesting_owner_id()',
      table_name
    );
    execute format('revoke all on public.%I from anon', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (owner_id = (select public.requesting_owner_id()))',
      table_name || '_select_own', table_name
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (owner_id = (select public.requesting_owner_id()))',
      table_name || '_insert_own', table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (owner_id = (select public.requesting_owner_id()))
         with check (owner_id = (select public.requesting_owner_id()))',
      table_name || '_update_own', table_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated
         using (owner_id = (select public.requesting_owner_id()))',
      table_name || '_delete_own', table_name
    );
  end loop;
end;
$$;

-- Offline copies on every device (infra/powersync/sync-config.yaml lists them too).
alter publication powersync add table public.funding_types, public.patient_fundings;
