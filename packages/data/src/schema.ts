import { column, Schema, Table } from "@powersync/common";

/*
 * The local copy of the eight server tables (supabase/migrations), as plain
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
    },
    indexes: { invoice: ["invoice_id"] },
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
