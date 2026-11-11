import { invoiceLocks } from "../invoices/status";
import type { InvoiceStatus, Visit } from "../types/models";

/**
 * Visit note rules.
 *
 * - "Add to note" appends text after the existing note, separated by a blank line.
 * - "Replace note" overwrites the note; replacing with empty text clears it.
 * - Every change sets `noteEditedAt` (and `updatedAt`) to the time given.
 * - A note on a paid invoice is locked. Notes on draft or sent invoices, and
 *   on visits not on any invoice, can still be edited.
 *
 * Each function returns a new visit and never changes the one passed in.
 */

/** Thrown when a note change isn't allowed. The message is safe to show the practitioner. */
export class NoteRuleError extends Error {
  override name = "NoteRuleError";
}

/** Status of the invoice the visit is on, or null if it isn't on one. */
export type NoteInvoiceStatus = InvoiceStatus | null;

const SEPARATOR = "\n\n";

/** Whether a visit's note can be edited, given the status of its invoice. */
export function isNoteLocked(invoiceStatus: NoteInvoiceStatus): boolean {
  return invoiceStatus !== null && invoiceLocks(invoiceStatus).notes;
}

function assertEditable(invoiceStatus: NoteInvoiceStatus): void {
  if (isNoteLocked(invoiceStatus)) {
    throw new NoteRuleError("This note is on a paid invoice and can't be changed.");
  }
}

/** Appends text to a visit's note. Text that is empty or only spaces is refused. */
export function addToNote(
  visit: Visit,
  text: string,
  invoiceStatus: NoteInvoiceStatus,
  now: string,
): Visit {
  assertEditable(invoiceStatus);
  const addition = text.trim();
  if (addition === "") {
    throw new NoteRuleError("Type something to add to the note.");
  }
  const existing = visit.note.trimEnd();
  const note = existing === "" ? addition : `${existing}${SEPARATOR}${addition}`;
  return { ...visit, note, noteEditedAt: now, updatedAt: now };
}

/** Replaces a visit's note. Empty text clears the note. */
export function replaceNote(
  visit: Visit,
  text: string,
  invoiceStatus: NoteInvoiceStatus,
  now: string,
): Visit {
  assertEditable(invoiceStatus);
  return { ...visit, note: text.trim(), noteEditedAt: now, updatedAt: now };
}
