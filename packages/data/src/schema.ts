import { column, Schema, Table, type RowType } from "@powersync/common";

/*
 * The local copy of the eight server tables (supabase/migrations), as PowerSync
 * tables. PowerSync adds `id` (text) itself. SQLite has three column types, so:
 * uuid, text, date and timestamptz are text (ISO-8601 for dates and times);
 * integer, bigint and boolean are integer (booleans are 0 or 1, money is cents).
 * tests/schema.test.ts checks this stays in step with the migrations.
 */

export const profiles = new Table({
  owner_id: column.text,
  full_name: column.text,
  full_name_on_invoice: column.integer,
  title: column.text,
  title_on_invoice: column.integer,
  clinic_name: column.text,
  clinic_name_on_invoice: column.integer,
  address: column.text,
  address_on_invoice: column.integer,
  phone: column.text,
  phone_on_invoice: column.integer,
  updated_at: column.text,
});

export const practice_settings = new Table({
  owner_id: column.text,
  default_tax_rate_basis_points: column.integer,
  invoice_number_prefix: column.text,
  updated_at: column.text,
});

export const invoice_styles = new Table({
  owner_id: column.text,
  logo_path: column.text,
  accent_color: column.text,
  font: column.text,
  header_layout: column.text,
  footer_note: column.text,
  updated_at: column.text,
});

export const patients = new Table(
  {
    owner_id: column.text,
    full_name: column.text,
    reason_for_visit: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { full_name: ["full_name"] } },
);

export const price_items = new Table({
  owner_id: column.text,
  name: column.text,
  unit_price_cents: column.integer,
  created_at: column.text,
  updated_at: column.text,
});

export const invoices = new Table(
  {
    owner_id: column.text,
    patient_id: column.text,
    number: column.integer,
    status: column.text,
    tax_enabled: column.integer,
    tax_rate_basis_points: column.integer,
    sent_at: column.text,
    paid_at: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { patient: ["patient_id"], status: ["status"] } },
);

export const visits = new Table(
  {
    owner_id: column.text,
    patient_id: column.text,
    visit_date: column.text,
    note: column.text,
    note_edited_at: column.text,
    invoice_id: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { patient: ["patient_id"], invoice: ["invoice_id"] } },
);

export const invoice_lines = new Table(
  {
    owner_id: column.text,
    invoice_id: column.text,
    price_item_id: column.text,
    name: column.text,
    unit_price_cents: column.integer,
    quantity: column.integer,
    position: column.integer,
  },
  { indexes: { invoice: ["invoice_id"] } },
);

export const AppSchema = new Schema({
  profiles,
  practice_settings,
  invoice_styles,
  patients,
  price_items,
  invoices,
  visits,
  invoice_lines,
});

/** Every table's row type, keyed by table name. */
export type Database = (typeof AppSchema)["types"];
export type ProfileRow = RowType<typeof profiles>;
export type PracticeSettingsRow = RowType<typeof practice_settings>;
export type InvoiceStyleRow = RowType<typeof invoice_styles>;
export type PatientRow = RowType<typeof patients>;
export type PriceItemRow = RowType<typeof price_items>;
export type InvoiceRow = RowType<typeof invoices>;
export type VisitRow = RowType<typeof visits>;
export type InvoiceLineRow = RowType<typeof invoice_lines>;
