import {
  invoiceSchema,
  invoiceStyleSchema,
  lineItemSchema,
  patientSchema,
  practiceSettingsSchema,
  priceItemSchema,
  profileSchema,
  visitSchema,
  type Invoice,
  type InvoiceStyle,
  type LineItem,
  type Patient,
  type PracticeSettings,
  type PriceItem,
  type Profile,
  type Visit,
} from "@kineo/shared";
import type {
  InvoiceLineRow,
  InvoiceRow,
  InvoiceStyleRow,
  PatientRow,
  PracticeSettingsRow,
  PriceItemRow,
  ProfileRow,
  VisitRow,
} from "./schema";

/**
 * Local rows (snake_case, booleans as 0/1, Postgres text timestamps) to the shared
 * models the screens use. Every result is checked against the shared Zod schema;
 * a row that doesn't fit throws a RowError, never a half-filled record.
 */

/** A row that couldn't be read. Names the table only, never the row's contents. */
export class RowError extends Error {
  override name = "RowError";
  constructor(readonly table: string) {
    super(`A row in ${table} couldn't be read.`);
  }
}

/**
 * Postgres writes timestamps as `2026-11-12 03:15:00.123+00`; the models use ISO
 * 8601 (`2026-11-12T03:15:00.123+00:00`). Already-ISO values pass through.
 */
export function toIsoTimestamp(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  return value
    .trim()
    .replace(" ", "T")
    .replace(/([+-]\d{2})$/, "$1:00");
}

const flag = (value: number | null | undefined) =>
  value !== null && value !== undefined && value !== 0;

const field = (value: string | null | undefined, shown: number | null | undefined) => ({
  value: value ?? "",
  showOnInvoice: flag(shown),
});

function parse<T>(
  table: string,
  schema: { safeParse(v: unknown): { success: true; data: T } | { success: false } },
  value: unknown,
): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new RowError(table);
  return result.data;
}

export function toPatient(row: PatientRow): Patient {
  return parse("patients", patientSchema, {
    id: row.id,
    ownerId: row.owner_id,
    fullName: row.full_name,
    reasonForVisit: row.reason_for_visit ?? null,
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
  });
}

export function toVisit(row: VisitRow): Visit {
  return parse("visits", visitSchema, {
    id: row.id,
    ownerId: row.owner_id,
    patientId: row.patient_id,
    visitDate: row.visit_date,
    note: row.note ?? "",
    noteEditedAt: toIsoTimestamp(row.note_edited_at),
    invoiceId: row.invoice_id ?? null,
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
  });
}

export function toPriceItem(row: PriceItemRow): PriceItem {
  return parse("price_items", priceItemSchema, {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    unitPriceCents: row.unit_price_cents,
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
  });
}

export function toLineItem(row: InvoiceLineRow): LineItem {
  return parse("invoice_lines", lineItemSchema, {
    id: row.id,
    ownerId: row.owner_id,
    invoiceId: row.invoice_id,
    priceItemId: row.price_item_id ?? null,
    name: row.name,
    unitPriceCents: row.unit_price_cents,
    quantity: row.quantity,
    position: row.position ?? 0,
  });
}

export function toInvoice(row: InvoiceRow): Invoice {
  return parse("invoices", invoiceSchema, {
    id: row.id,
    ownerId: row.owner_id,
    patientId: row.patient_id,
    number: row.number,
    status: row.status,
    taxEnabled: flag(row.tax_enabled),
    taxRateBasisPoints: row.tax_rate_basis_points ?? 0,
    sentAt: toIsoTimestamp(row.sent_at),
    paidAt: toIsoTimestamp(row.paid_at),
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
  });
}

/**
 * The profile, or the server's defaults (every field empty and hidden) if the
 * practitioner hasn't saved one yet. `now` stands in for the missing updated time.
 */
export function toProfile(row: ProfileRow | undefined, ownerId: string, now: string): Profile {
  return parse("profiles", profileSchema, {
    ownerId: row?.owner_id ?? ownerId,
    fullName: field(row?.full_name, row?.full_name_on_invoice),
    title: field(row?.title, row?.title_on_invoice),
    clinicName: field(row?.clinic_name, row?.clinic_name_on_invoice),
    address: field(row?.address, row?.address_on_invoice),
    phone: field(row?.phone, row?.phone_on_invoice),
    updatedAt: toIsoTimestamp(row?.updated_at) ?? now,
  });
}

/** Settings, or the server's defaults (no tax, no prefix). */
export function toSettings(
  row: PracticeSettingsRow | undefined,
  ownerId: string,
  now: string,
): PracticeSettings {
  return parse("practice_settings", practiceSettingsSchema, {
    ownerId: row?.owner_id ?? ownerId,
    defaultTaxRateBasisPoints: row?.default_tax_rate_basis_points ?? 0,
    invoiceNumberPrefix: row?.invoice_number_prefix ?? "",
    updatedAt: toIsoTimestamp(row?.updated_at) ?? now,
  });
}

/** Invoice style, or the server's defaults (sky, clean, logo left, no logo). */
export function toInvoiceStyle(
  row: InvoiceStyleRow | undefined,
  ownerId: string,
  now: string,
): InvoiceStyle {
  return parse("invoice_styles", invoiceStyleSchema, {
    ownerId: row?.owner_id ?? ownerId,
    logoPath: row?.logo_path ?? null,
    accentColor: row?.accent_color ?? "sky",
    font: row?.font ?? "clean",
    headerLayout: row?.header_layout ?? "logo-left",
    footerNote: row?.footer_note ?? "",
    updatedAt: toIsoTimestamp(row?.updated_at) ?? now,
  });
}
