-- Patient information: child/parent names, email, phone, custom details, and
-- Invoice visibility toggles, plus required-details enforcement for new patients.
--
-- Existing patients keep `details_required = false` so historical records remain
-- valid without forcing immediate backfill. New patients always get
-- `details_required = true` via BEFORE INSERT trigger, and updates preserve
-- `old.details_required` so clients cannot opt out or flip the flag.
--
-- As with funding jsonb columns, apps store jsonb locally as JSON text and
-- upload it as a JSON string, so `patients_jsonb_from_text` parses string
-- payloads back into real jsonb before CHECK constraints run.
--
-- Shapes (snake_case keys):
--   patients.parent_names    ["Parent Name", ...] (up to 4, <= 200 chars each)
--   patients.custom_details  [{"id", "label", "value", "show_on_invoice"}] (up to 20)

-- Validation ----------------------------------------------------------------

-- Parent names: an array of up to 4 strings, each at most 200 characters.
create function public.patient_parent_names_valid(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p is null or jsonb_typeof(p) <> 'array' then false
    when jsonb_array_length(p) = 0 then true
    when jsonb_array_length(p) > 4 then false
    else coalesce((
      select bool_and(
               coalesce(
                 jsonb_typeof(e) = 'string'
                 and char_length(e #>> '{}') <= 200,
                 false
               )
             )
        from jsonb_array_elements(p) as e
    ), false)
  end;
$$;

-- At least one non-blank string entry in parent_names (required for children
-- when details_required is true).
create function public.patient_has_parent_name(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p is null or jsonb_typeof(p) <> 'array' then false
    else coalesce((
      select bool_or(
               jsonb_typeof(e) = 'string'
               and btrim(e #>> '{}') <> ''
             )
        from jsonb_array_elements(p) as e
    ), false)
  end;
$$;

-- Patient custom details: up to 20 objects, each with a uuid id, a non-blank
-- label of at most 80 characters, a non-blank value of at most 500 characters,
-- and a show_on_invoice boolean. Ids (ignoring case) and labels (ignoring case
-- and outer spaces) are unique within the patient.
create function public.patient_custom_details_valid(d jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when d is null or jsonb_typeof(d) <> 'array' then false
    when jsonb_array_length(d) = 0 then true
    when jsonb_array_length(d) > 20 then false
    else coalesce((
      select bool_and(
               coalesce(
                 jsonb_typeof(e) = 'object'
                 and jsonb_typeof(e -> 'id') = 'string'
                 and (e ->> 'id') ~ '^[0-9a-fA-F-]{36}$'
                 and jsonb_typeof(e -> 'label') = 'string'
                 and btrim(e ->> 'label') <> ''
                 and char_length(e ->> 'label') <= 80
                 and jsonb_typeof(e -> 'value') = 'string'
                 and btrim(e ->> 'value') <> ''
                 and char_length(e ->> 'value') <= 500
                 and jsonb_typeof(e -> 'show_on_invoice') = 'boolean',
                 false
               )
             )
             and count(distinct lower(btrim(e ->> 'label'))) = count(*)
             and count(distinct lower(e ->> 'id')) = count(*)
        from jsonb_array_elements(d) as e
    ), false)
  end;
$$;

-- Columns and constraints ---------------------------------------------------

alter table public.patients
  add column is_child boolean not null default false,
  add column parent_names jsonb not null default '[]'::jsonb,
  add column parent_names_on_invoice boolean not null default false,
  add column email text not null default '',
  add column email_on_invoice boolean not null default false,
  add column phone text not null default '',
  add column phone_on_invoice boolean not null default false,
  add column custom_details jsonb not null default '[]'::jsonb,
  add column details_required boolean not null default false;

alter table public.patients
  add constraint patients_parent_names_valid
    check (public.patient_parent_names_valid(parent_names)),
  add constraint patients_parent_names_only_for_child
    check (is_child or parent_names = '[]'::jsonb),
  add constraint patients_email_valid
    check (char_length(email) <= 254 and (btrim(email) = '' or btrim(email) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  add constraint patients_phone_valid
    check (char_length(phone) <= 40),
  add constraint patients_custom_details_valid
    check (public.patient_custom_details_valid(custom_details)),
  add constraint patients_details_required_complete
    check (not details_required or (btrim(email) <> '' and btrim(phone) <> '' and (not is_child or public.patient_has_parent_name(parent_names))));

-- Triggers ------------------------------------------------------------------

-- Convert JSON string payloads uploaded by offline clients back into jsonb.
create function public.patients_jsonb_from_text()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if jsonb_typeof(new.parent_names) = 'string' then
    new.parent_names := (new.parent_names #>> '{}')::jsonb;
  end if;
  if jsonb_typeof(new.custom_details) = 'string' then
    new.custom_details := (new.custom_details #>> '{}')::jsonb;
  end if;
  return new;
end;
$$;

create trigger patients_jsonb_from_text
  before insert or update on public.patients
  for each row execute function public.patients_jsonb_from_text();

-- Every new patient requires contact details; clients cannot opt out.
create function public.patients_details_required_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.details_required := true;
  return new;
end;
$$;

create trigger patients_details_required_insert
  before insert on public.patients
  for each row execute function public.patients_details_required_insert();

-- Clients cannot clear or flip details_required on update.
create function public.patients_details_required_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.details_required := old.details_required;
  return new;
end;
$$;

create trigger patients_details_required_update
  before update on public.patients
  for each row execute function public.patients_details_required_update();
