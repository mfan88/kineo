import { column, Schema, Table } from "@powersync/common";

/*
 * The local copy of the ten server tables (supabase/migrations), as plain
 * definitions. PowerSync adds `id` (text) itself. SQLite has three column types, so:
 * uuid, text, date and timestamptz are text (ISO-8601 for dates and times);
 * integer, bigint and boolean are integer (booleans are 0 or 1, money is cents).
 * tests/schema.test.ts checks this stays in step with the migrations.
 *
 * The definitions are plain data, not PowerSync classes, because the two apps use
 * different PowerSync versions (desktop's Tauri SDK needs @powersync/common 2.0,
 * the React Native SDK 1.x). Each app builds its schema with its own PowerSync
 * through buildAppSchema; both versions turn it into the same schema.
 */

type ColumnKind = "text" | "integer";

interface TableDefinition {
  readonly columns: Readonly<Record<string, ColumnKind>>;
  readonly indexes?: Readonly<Record<string, readonly string[]>>;
}

export const TABLE_DEFINITIONS = {
  profiles: {
    columns: {
      owner_id: "text",
      full_name: "text",
      full_name_on_invoice: "integer",
      title: "text",
      title_on_invoice: "integer",
      clinic_name: "text",
      clinic_name_on_invoice: "integer",
      address: "text",
      address_on_invoice: "integer",
      phone: "text",
      phone_on_invoice: "integer",
      updated_at: "text",
    },
  },
  practice_settings: {
    columns: {
      owner_id: "text",
      default_tax_rate_basis_points: "integer",
      invoice_number_prefix: "text",
      // Invoice numbers built from parts (prefix, year, month, number): their order
      // as comma-separated names, which are shown, the separator, digits and the
      // lowest next number.
      invoice_number_order: "text",
      invoice_number_show_prefix: "integer",
      invoice_number_show_year: "integer",
      invoice_number_show_month: "integer",
      invoice_number_separator: "text",
      invoice_number_digits: "integer",
      invoice_number_start: "integer",
      updated_at: "text",
    },
  },
  invoice_styles: {
    columns: {
      owner_id: "text",
      logo_path: "text",
      accent_color: "text",
      font: "text",
      header_layout: "text",
      footer_note: "text",
      updated_at: "text",
    },
  },
  patients: {
    columns: {
      owner_id: "text",
      full_name: "text",
      reason_for_visit: "text",
      billing_address: "text",
      created_at: "text",
      updated_at: "text",
    },
    indexes: { full_name: ["full_name"] },
  },
  price_items: {
    columns: {
      owner_id: "text",
      name: "text",
      unit_price_cents: "integer",
      created_at: "text",
      updated_at: "text",
    },
  },
  invoices: {
    columns: {
      owner_id: "text",
      patient_id: "text",
      number: "integer",
      status: "text",
      tax_enabled: "integer",
      tax_rate_basis_points: "integer",
      sent_at: "text",
      paid_at: "text",
      cancelled_at: "text",
      // A JSON array of YYYY-MM-DD dates (jsonb on the server); only on a cancelled invoice.
      cancelled_visit_dates: "text",
      // Bill to, copied when the invoice is created ('patient' or 'funding').
      bill_to_kind: "text",
      bill_to_name: "text",
      bill_to_address: "text",
      bill_to_funding_name: "text",
      patient_funding_id: "text",
      // A JSON array of {id, label, value} (jsonb on the server).
      bill_to_details: "text",
      // The number the invoice was sent with; null while it's a draft.
      display_number: "text",
      created_at: "text",
      updated_at: "text",
    },
    indexes: { patient: ["patient_id"], status: ["status"] },
  },
  visits: {
    columns: {
      owner_id: "text",
      patient_id: "text",
      visit_date: "text",
      note: "text",
      note_edited_at: "text",
      invoice_id: "text",
      created_at: "text",
      updated_at: "text",
    },
    indexes: { patient: ["patient_id"], invoice: ["invoice_id"] },
  },
  invoice_lines: {
    columns: {
      owner_id: "text",
      invoice_id: "text",
      price_item_id: "text",
      name: "text",
      unit_price_cents: "integer",
      quantity: "integer",
      position: "integer",
      // YYYY-MM-DD; set on a funded invoice's lines.
      service_date: "text",
    },
    indexes: { invoice: ["invoice_id"] },
  },
  funding_types: {
    columns: {
      owner_id: "text",
      name: "text",
      recipient_name: "text",
      recipient_address: "text",
      // A JSON array of {id, label, kind, show_on_invoice} (jsonb on the server).
      details: "text",
      created_at: "text",
      updated_at: "text",
    },
  },
  patient_fundings: {
    columns: {
      owner_id: "text",
      patient_id: "text",
      funding_type_id: "text",
      // A JSON object of detail id to value (jsonb on the server).
      detail_values: "text",
      period_start: "text",
      period_end: "text",
      ended_on: "text",
      created_at: "text",
      updated_at: "text",
    },
    indexes: { patient: ["patient_id"], type: ["funding_type_id"] },
  },
} as const satisfies Record<string, TableDefinition>;

type Tables = typeof TABLE_DEFINITIONS;

/** A row as PowerSync returns it: `id`, then each column (text or integer), any of them null. */
type RowOf<Definition extends TableDefinition> = { id: string } & {
  -readonly [Name in keyof Definition["columns"]]:
    (Definition["columns"][Name] extends "text" ? string : number) | null;
};

/** What buildAppSchema needs from a PowerSync version: its column types, Table and Schema. */
export interface SchemaBuilders<TColumn, TTable, TSchema> {
  column: { text: TColumn; integer: TColumn };
  Table: new (
    columns: Record<string, TColumn>,
    options?: { indexes?: Record<string, string[]> },
  ) => TTable;
  // The table type comes from Table alone; Schema only has to accept it.
  Schema: new (tables: Record<string, NoInfer<TTable>>) => TSchema;
}

/**
 * The app's PowerSync schema, built with the caller's own PowerSync classes:
 * `buildAppSchema<ColumnType, Table, Schema>({ column, Table, Schema })` with the
 * imports of that app's SDK. Give the three types explicitly: TypeScript can't infer
 * them through PowerSync's generic Table class.
 */
export function buildAppSchema<TColumn, TTable, TSchema>({
  column: columnTypes,
  Table: TableClass,
  Schema: SchemaClass,
}: SchemaBuilders<TColumn, TTable, TSchema>): TSchema {
  const tables: Record<string, TTable> = {};
  for (const [name, definition] of Object.entries(TABLE_DEFINITIONS) as [
    string,
    TableDefinition,
  ][]) {
    const columns = Object.fromEntries(
      Object.entries(definition.columns).map(([columnName, kind]) => [
        columnName,
        columnTypes[kind],
      ]),
    );
    const indexes = definition.indexes
      ? Object.fromEntries(
          Object.entries(definition.indexes).map(([index, on]) => [index, [...on]]),
        )
      : undefined;
    tables[name] = new TableClass(columns, indexes ? { indexes } : undefined);
  }
  return new SchemaClass(tables);
}

/** The schema built with @powersync/common 2.0, the version desktop's Tauri SDK uses. */
export const AppSchema = buildAppSchema<typeof column.text | typeof column.integer, Table, Schema>({
  column,
  Table,
  Schema,
});

/**
 * Columns that are `boolean` on the server and 0 or 1 locally. Uploads turn them
 * back into true or false. tests/schema.test.ts checks this list against the migrations.
 */
export const BOOLEAN_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  profiles: [
    "full_name_on_invoice",
    "title_on_invoice",
    "clinic_name_on_invoice",
    "address_on_invoice",
    "phone_on_invoice",
  ],
  practice_settings: [
    "invoice_number_show_prefix",
    "invoice_number_show_year",
    "invoice_number_show_month",
  ],
  invoices: ["tax_enabled"],
};

/** Every table's row type, keyed by table name. */
export type Database = { [Name in keyof Tables]: RowOf<Tables[Name]> };
export type ProfileRow = Database["profiles"];
export type PracticeSettingsRow = Database["practice_settings"];
export type InvoiceStyleRow = Database["invoice_styles"];
export type PatientRow = Database["patients"];
export type PriceItemRow = Database["price_items"];
export type InvoiceRow = Database["invoices"];
export type VisitRow = Database["visits"];
export type InvoiceLineRow = Database["invoice_lines"];
export type FundingTypeRow = Database["funding_types"];
export type PatientFundingRow = Database["patient_fundings"];
