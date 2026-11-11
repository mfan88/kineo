-- Kineō core tables.
--
-- Mirrors the Zod schemas in packages/shared/src/schemas/models.ts (camelCase there,
-- snake_case here). Every table has a uuid `id` primary key (PowerSync needs one) and
-- `owner_id`, the Clerk user ID that row-level security is keyed on.
--
-- Money is integer cents; tax rates are integer basis points (5% = 500).
--
-- Row-level security is enabled on every table here so no table is ever exposed
-- without it. With no policies yet, nothing is readable or writable through the API;
-- the policies come in the next migration.

-- Practitioner profile: one row per practitioner. Each field has a "show on invoice"
-- flag, and a field shown on invoices must not be blank.
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null unique check (btrim(owner_id) <> ''),
  full_name text not null default '',
  full_name_on_invoice boolean not null default false,
  title text not null default '',
  title_on_invoice boolean not null default false,
  clinic_name text not null default '',
  clinic_name_on_invoice boolean not null default false,
  address text not null default '',
  address_on_invoice boolean not null default false,
  phone text not null default '',
  phone_on_invoice boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint profiles_full_name_shown_required check (not full_name_on_invoice or btrim(full_name) <> ''),
  constraint profiles_title_shown_required check (not title_on_invoice or btrim(title) <> ''),
  constraint profiles_clinic_name_shown_required check (not clinic_name_on_invoice or btrim(clinic_name) <> ''),
  constraint profiles_address_shown_required check (not address_on_invoice or btrim(address) <> ''),
  constraint profiles_phone_shown_required check (not phone_on_invoice or btrim(phone) <> '')
);

-- Price list and tax settings that aren't price list items: one row per practitioner.
create table public.practice_settings (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null unique check (btrim(owner_id) <> ''),
  default_tax_rate_basis_points integer not null default 0
    check (default_tax_rate_basis_points between 0 and 10000),
  invoice_number_prefix text not null default ''
    check (char_length(invoice_number_prefix) <= 20),
  updated_at timestamptz not null default now()
);

-- Invoice style (desktop only): one row per practitioner.
create table public.invoice_styles (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null unique check (btrim(owner_id) <> ''),
  logo_path text check (logo_path is null or btrim(logo_path) <> ''),
  accent_color text not null default 'sky'
    check (accent_color in ('sky', 'forest', 'ocean', 'plum', 'charcoal')),
  font text not null default 'clean'
    check (font in ('nunito', 'serif', 'clean')),
  header_layout text not null default 'logo-left'
    check (header_layout in ('logo-left', 'centred')),
  footer_note text not null default ''
    check (char_length(footer_note) <= 500),
  updated_at timestamptz not null default now()
);

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null check (btrim(owner_id) <> ''),
  full_name text not null check (btrim(full_name) <> ''),
  reason_for_visit text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Lets child tables require the same owner as their patient.
  unique (id, owner_id)
);

create index patients_owner_id_idx on public.patients (owner_id);

create table public.price_items (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null check (btrim(owner_id) <> ''),
  name text not null check (btrim(name) <> ''),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);

create index price_items_owner_id_idx on public.price_items (owner_id);

-- An invoice is for one patient. Status moves draft → sent → paid (paid → sent to undo);
-- the dates must match the status.
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null check (btrim(owner_id) <> ''),
  patient_id uuid not null,
  number integer not null check (number >= 1),
  status text not null default 'draft' check (status in ('draft', 'sent', 'paid')),
  tax_enabled boolean not null default false,
  tax_rate_basis_points integer not null default 0
    check (tax_rate_basis_points between 0 and 10000),
  sent_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_patient_same_owner
    foreign key (patient_id, owner_id) references public.patients (id, owner_id),
  constraint invoices_number_unique_per_owner unique (owner_id, number),
  constraint invoices_dates_match_status check (
    (status = 'draft' and sent_at is null and paid_at is null)
    or (status = 'sent' and sent_at is not null and paid_at is null)
    or (status = 'paid' and sent_at is not null and paid_at is not null)
  ),
  -- Lets visits require an invoice for the same owner and patient.
  unique (id, owner_id, patient_id),
  unique (id, owner_id)
);

create index invoices_patient_id_idx on public.invoices (patient_id);
create index invoices_owner_status_idx on public.invoices (owner_id, status);

-- A visit is on at most one invoice (invoice_id), and only an invoice for its own
-- patient and practitioner.
create table public.visits (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null check (btrim(owner_id) <> ''),
  patient_id uuid not null,
  visit_date date not null,
  note text not null default '',
  note_edited_at timestamptz not null default now(),
  invoice_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint visits_patient_same_owner
    foreign key (patient_id, owner_id) references public.patients (id, owner_id),
  -- MATCH SIMPLE: the check is skipped while invoice_id is null.
  constraint visits_invoice_same_owner_and_patient
    foreign key (invoice_id, owner_id, patient_id)
    references public.invoices (id, owner_id, patient_id)
);

create index visits_patient_id_idx on public.visits (patient_id);
create index visits_invoice_id_idx on public.visits (invoice_id);
create index visits_owner_uninvoiced_idx on public.visits (owner_id) where invoice_id is null;

-- Invoice lines copy name and price from the price list, so later price list edits
-- never change an existing invoice. price_item_id is cleared if that item is deleted.
create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null check (btrim(owner_id) <> ''),
  invoice_id uuid not null,
  price_item_id uuid references public.price_items (id) on delete set null,
  name text not null check (btrim(name) <> ''),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  quantity integer not null check (quantity >= 1),
  position integer not null default 0 check (position >= 0),
  constraint invoice_lines_invoice_same_owner
    foreign key (invoice_id, owner_id) references public.invoices (id, owner_id) on delete cascade
);

create index invoice_lines_invoice_id_idx on public.invoice_lines (invoice_id);
create index invoice_lines_price_item_id_idx on public.invoice_lines (price_item_id);

-- A visit can be put on or taken off an invoice only while that invoice is a draft.
create function public.visits_invoice_change_only_on_draft()
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
    if old_status is distinct from 'draft' then
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

create trigger visits_invoice_change_only_on_draft
  before update of invoice_id on public.visits
  for each row execute function public.visits_invoice_change_only_on_draft();

-- Inserting a visit straight onto an invoice follows the same rule.
create function public.visits_insert_only_on_draft()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.invoice_id is not null
    and (select status from public.invoices where id = new.invoice_id) is distinct from 'draft' then
    raise exception 'Visits can''t be added once an invoice is sent.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger visits_insert_only_on_draft
  before insert on public.visits
  for each row execute function public.visits_insert_only_on_draft();

alter table public.profiles enable row level security;
alter table public.practice_settings enable row level security;
alter table public.invoice_styles enable row level security;
alter table public.patients enable row level security;
alter table public.price_items enable row level security;
alter table public.invoices enable row level security;
alter table public.visits enable row level security;
alter table public.invoice_lines enable row level security;
