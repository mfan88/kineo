import { z } from "zod";
import { localDateString } from "../dates/display";

/** The parts an invoice number can be built from, in any order. */
export const INVOICE_NUMBER_PARTS = ["prefix", "year", "month", "number"] as const;
export type InvoiceNumberPart = (typeof INVOICE_NUMBER_PARTS)[number];

/** What goes between the parts: a dash, slash, full stop, or nothing. */
export const INVOICE_NUMBER_SEPARATORS = ["-", "/", ".", ""] as const;
export type InvoiceNumberSeparator = (typeof INVOICE_NUMBER_SEPARATORS)[number];

export const MIN_INVOICE_NUMBER_DIGITS = 1;
export const MAX_INVOICE_NUMBER_DIGITS = 6;
/** The highest starting number: eight digits is plenty for any practice. */
export const MAX_INVOICE_NUMBER_START = 99_999_999;
export const MAX_INVOICE_NUMBER_PREFIX = 20;

export const invoiceNumberPartSchema = z.enum(INVOICE_NUMBER_PARTS);
export const invoiceNumberSeparatorSchema = z.enum(INVOICE_NUMBER_SEPARATORS);

/** The parts that can be turned off; the number is always shown. */
export type OptionalInvoiceNumberPart = Exclude<InvoiceNumberPart, "number">;

/**
 * How a practice's invoice numbers look, e.g. INV-2026-0042: all four parts in the
 * order they appear, which of prefix, year and month are shown (a part that's off
 * keeps its place for when it's turned back on), the separator between them, the
 * prefix text and how many digits the number is padded to.
 */
export const invoiceNumberFormatSchema = z.object({
  prefix: z.string().trim().max(MAX_INVOICE_NUMBER_PREFIX),
  order: z
    .array(invoiceNumberPartSchema)
    .length(INVOICE_NUMBER_PARTS.length)
    .refine((order) => new Set(order).size === order.length, "Each part appears once."),
  shown: z.object({ prefix: z.boolean(), year: z.boolean(), month: z.boolean() }),
  separator: invoiceNumberSeparatorSchema,
  digits: z.int().min(MIN_INVOICE_NUMBER_DIGITS).max(MAX_INVOICE_NUMBER_DIGITS),
});
export type InvoiceNumberFormat = z.infer<typeof invoiceNumberFormatSchema>;

/** A new practice's format: the number alone, four digits (0001). */
export const DEFAULT_INVOICE_NUMBER_FORMAT: InvoiceNumberFormat = {
  prefix: "",
  order: ["prefix", "year", "month", "number"],
  shown: { prefix: true, year: false, month: false },
  separator: "-",
  digits: 4,
};

/**
 * Builds the number shown on an invoice, e.g. INV-2026-0042. `issuedOn` is the
 * invoice's date in the practitioner's time zone (YYYY-MM-DD); it gives the year and
 * month. Parts that are off, and a prefix with no text, are left out along with
 * their separator. A number longer than the digits is shown in full.
 */
export function buildInvoiceNumber(
  format: InvoiceNumberFormat,
  invoiceNumber: number,
  issuedOn: string,
): string {
  if (!Number.isSafeInteger(invoiceNumber) || invoiceNumber < 1) {
    throw new RangeError("Invoice number must be a whole number of at least 1.");
  }
  const [year = "", month = ""] = issuedOn.split("-");
  const values: Record<InvoiceNumberPart, string> = {
    prefix: format.prefix.trim(),
    year,
    month,
    number: invoiceNumber.toString().padStart(format.digits, "0"),
  };
  return format.order
    .filter((part) => part === "number" || format.shown[part])
    .map((part) => values[part])
    .filter((value) => value !== "")
    .join(format.separator);
}

/**
 * An invoice's date as YYYY-MM-DD in this device's time zone: the day it was sent,
 * or for a draft the day it was made. The same date the invoice itself shows.
 */
export function invoiceIssuedOn(invoice: { sentAt: string | null; createdAt: string }): string {
  return localDateString(new Date(invoice.sentAt ?? invoice.createdAt));
}

/**
 * The number shown for an invoice: the one it was sent with, or, until it's sent,
 * the number built from the practice's current format and the invoice's date.
 */
export function invoiceNumberLabel(
  invoice: {
    number: number;
    displayNumber?: string | null | undefined;
    sentAt: string | null;
    createdAt: string;
  },
  format: InvoiceNumberFormat,
): string {
  return (
    invoice.displayNumber ?? buildInvoiceNumber(format, invoice.number, invoiceIssuedOn(invoice))
  );
}

/** The highest number used so far, or 0 before the first invoice. */
export function highestInvoiceNumber(invoices: readonly { number: number }[]): number {
  let highest = 0;
  for (const invoice of invoices) {
    if (invoice.number > highest) highest = invoice.number;
  }
  return highest;
}

/**
 * The number for a practitioner's next invoice: one more than the highest so far,
 * or the starting number from Settings if that's higher (to carry on from invoices
 * made before Kineō). Gaps are kept (numbers are never reused).
 */
export function nextInvoiceNumber(invoices: readonly { number: number }[], start = 1): number {
  return Math.max(highestInvoiceNumber(invoices) + 1, start);
}

/**
 * What's wrong with a starting number typed in Settings, or null. It can't be lower
 * than the next number already due, which would mean reusing numbers.
 * `nextDue` is `nextInvoiceNumber(invoices)` with no starting number.
 */
export function invoiceNumberStartProblem(start: number, nextDue: number): string | null {
  if (!Number.isSafeInteger(start) || start < 1) {
    return "Enter a whole number of at least 1.";
  }
  if (start > MAX_INVOICE_NUMBER_START) {
    return "Enter a number with at most eight digits.";
  }
  if (start < nextDue) {
    return `Start at ${nextDue} or higher. Lower numbers are already used.`;
  }
  return null;
}

/**
 * The order with `part` moved one place up (-1) or down (1). Moving past either end
 * changes nothing.
 */
export function moveInvoiceNumberPart(
  order: readonly InvoiceNumberPart[],
  part: InvoiceNumberPart,
  direction: -1 | 1,
): InvoiceNumberPart[] {
  const from = order.indexOf(part);
  const to = from + direction;
  const moved = [...order];
  const other = order[to];
  if (from === -1 || other === undefined) return moved;
  moved[from] = other;
  moved[to] = part;
  return moved;
}

/** Each part's name in Settings. */
export const INVOICE_NUMBER_PART_LABELS: Record<InvoiceNumberPart, string> = {
  prefix: "Prefix",
  year: "Year",
  month: "Month",
  number: "Number",
};

/** Each separator's name in Settings. */
export const INVOICE_NUMBER_SEPARATOR_LABELS: Record<InvoiceNumberSeparator, string> = {
  "-": "Dash",
  "/": "Slash",
  ".": "Full stop",
  "": "None",
};

/**
 * What a part looks like in a number, for its row in Settings: the prefix text (or
 * a hint while empty), the year and month of `issuedOn`, and `invoiceNumber` padded.
 */
export function invoiceNumberPartExample(
  part: InvoiceNumberPart,
  format: InvoiceNumberFormat,
  invoiceNumber: number,
  issuedOn: string,
): string {
  const [year = "", month = ""] = issuedOn.split("-");
  const examples: Record<InvoiceNumberPart, string> = {
    prefix: format.prefix.trim() === "" ? "Add text below" : format.prefix.trim(),
    year,
    month,
    number: invoiceNumber.toString().padStart(format.digits, "0"),
  };
  return examples[part];
}

/** How each number length looks, for choosing digits: 7, 07, 007… */
export function invoiceNumberDigitsExample(digits: number): string {
  return "7".padStart(digits, "0");
}
