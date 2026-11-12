import type { CommonPowerSyncDatabase } from "@powersync/common";
import type {
  Invoice,
  InvoiceStyle,
  LineItem,
  Patient,
  PracticeSettings,
  PriceItem,
  Profile,
  Visit,
} from "@kineo/shared";
import {
  RowError,
  toInvoice,
  toInvoiceStyle,
  toLineItem,
  toPatient,
  toPriceItem,
  toProfile,
  toSettings,
  toVisit,
} from "./mappers";
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

/** Everything the screens show, in the same shape as the desktop demo store. */
export interface PracticeData {
  patients: Patient[];
  visits: Visit[];
  invoices: Invoice[];
  lineItems: LineItem[];
  priceItems: PriceItem[];
  profile: Profile;
  settings: PracticeSettings;
  invoiceStyle: InvoiceStyle;
}

export interface PracticeDataHandlers {
  /** Called once every table has been read, then again after every change. */
  onData: (data: PracticeData) => void;
  /** A query failed, or a row couldn't be read (that row is left out). */
  onError?: (error: Error) => void;
}

/** The part of a PowerSync database this needs, so tests can use a stand-in. */
export type WatchableDatabase = Pick<CommonPowerSyncDatabase, "watchWithCallback">;

interface Rows {
  patients: PatientRow[];
  visits: VisitRow[];
  invoices: InvoiceRow[];
  invoice_lines: InvoiceLineRow[];
  price_items: PriceItemRow[];
  profiles: ProfileRow[];
  practice_settings: PracticeSettingsRow[];
  invoice_styles: InvoiceStyleRow[];
}

/** One query per table, only the practitioner's own rows, in a stable order. */
export const PRACTICE_QUERIES: Readonly<Record<keyof Rows, string>> = {
  patients: "SELECT * FROM patients WHERE owner_id = ? ORDER BY full_name COLLATE NOCASE, id",
  visits: "SELECT * FROM visits WHERE owner_id = ? ORDER BY visit_date DESC, created_at DESC, id",
  invoices: "SELECT * FROM invoices WHERE owner_id = ? ORDER BY number DESC",
  invoice_lines: "SELECT * FROM invoice_lines WHERE owner_id = ? ORDER BY invoice_id, position, id",
  price_items: "SELECT * FROM price_items WHERE owner_id = ? ORDER BY name COLLATE NOCASE, id",
  profiles: "SELECT * FROM profiles WHERE owner_id = ? LIMIT 1",
  practice_settings: "SELECT * FROM practice_settings WHERE owner_id = ? LIMIT 1",
  invoice_styles: "SELECT * FROM invoice_styles WHERE owner_id = ? LIMIT 1",
};

const TABLES = [
  "patients",
  "visits",
  "invoices",
  "invoice_lines",
  "price_items",
  "profiles",
  "practice_settings",
  "invoice_styles",
] as const satisfies readonly (keyof Rows)[];

/** All eight tables' rows, once every query has answered; otherwise null. */
function complete(latest: Map<keyof Rows, unknown[]>): Rows | null {
  if (TABLES.some((table) => !latest.has(table))) return null;
  const rows = Object.fromEntries(latest);
  // Rows come from SQLite untyped; they're shaped by the local schema, and the
  // mappers check every one against the shared Zod schemas before use.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return rows as unknown as Rows;
}

/** Maps each row, leaving out (and reporting) any that can't be read. */
function mapRows<R, T>(rows: R[], map: (row: R) => T, onError?: (error: Error) => void): T[] {
  const mapped: T[] = [];
  for (const row of rows) {
    try {
      mapped.push(map(row));
    } catch (error) {
      if (!(error instanceof RowError)) throw error;
      onError?.(error);
    }
  }
  return mapped;
}

/** Reads a one-per-practitioner row, falling back to the defaults if it can't be read. */
function single<R, T>(
  row: R | undefined,
  map: (row: R | undefined) => T,
  onError?: (error: Error) => void,
): T {
  try {
    return map(row);
  } catch (error) {
    if (!(error instanceof RowError)) throw error;
    onError?.(error);
    return map(undefined);
  }
}

export function buildPracticeData(
  rows: Rows,
  ownerId: string,
  now: string,
  onError?: (error: Error) => void,
): PracticeData {
  return {
    patients: mapRows(rows.patients, toPatient, onError),
    visits: mapRows(rows.visits, toVisit, onError),
    invoices: mapRows(rows.invoices, toInvoice, onError),
    lineItems: mapRows(rows.invoice_lines, toLineItem, onError),
    priceItems: mapRows(rows.price_items, toPriceItem, onError),
    profile: single(rows.profiles[0], (r) => toProfile(r, ownerId, now), onError),
    settings: single(rows.practice_settings[0], (r) => toSettings(r, ownerId, now), onError),
    invoiceStyle: single(rows.invoice_styles[0], (r) => toInvoiceStyle(r, ownerId, now), onError),
  };
}

/**
 * Watches the practitioner's data in the local database and calls `onData` with
 * all of it, kept up to date as it changes (locally or by sync). Returns a
 * function that stops watching.
 */
export function watchPracticeData(
  db: WatchableDatabase,
  ownerId: string,
  handlers: PracticeDataHandlers,
  now: () => string = () => new Date().toISOString(),
): () => void {
  const controller = new AbortController();
  const latest = new Map<keyof Rows, unknown[]>();

  const emit = () => {
    if (controller.signal.aborted) return;
    const rows = complete(latest);
    if (rows) handlers.onData(buildPracticeData(rows, ownerId, now(), handlers.onError));
  };

  for (const table of TABLES) {
    db.watchWithCallback(
      PRACTICE_QUERIES[table],
      [ownerId],
      {
        onResult: (result) => {
          latest.set(table, result.array);
          emit();
        },
        onError: (error) => handlers.onError?.(error),
      },
      { signal: controller.signal },
    );
  }
  return () => controller.abort();
}
