import type { Invoice, InvoiceStatus } from "../types/models";

/**
 * Invoice status rules.
 *
 *   draft → sent → paid, paid → sent to undo a payment, and sent → cancelled.
 *
 * There is no way back to draft once an invoice is sent, and nothing leaves
 * cancelled. A paid invoice can't be cancelled: undo the payment first. Each transition
 * returns a new invoice and never changes the one passed in.
 */

/** Thrown when an invoice action isn't allowed. The message is safe to show the practitioner. */
export class InvoiceRuleError extends Error {
  override name = "InvoiceRuleError";
}

/** What can still be edited on an invoice in each status. */
export interface InvoiceLocks {
  /** Adding, removing or changing line items. */
  lineItems: boolean;
  /** Adding or removing visits. */
  visits: boolean;
  /** Turning tax on or off and changing the rate. */
  tax: boolean;
  /** Editing notes on the invoice's visits. */
  notes: boolean;
}

const LOCKS: Record<InvoiceStatus, InvoiceLocks> = {
  draft: { lineItems: false, visits: false, tax: false, notes: false },
  sent: { lineItems: true, visits: true, tax: true, notes: false },
  paid: { lineItems: true, visits: true, tax: true, notes: true },
  // A cancelled invoice is a read-only record. Its visits are released, so their
  // notes are editable again like any visit that isn't on an invoice.
  cancelled: { lineItems: true, visits: true, tax: true, notes: false },
};

const ALLOWED: Record<InvoiceStatus, readonly InvoiceStatus[]> = {
  draft: ["sent"],
  sent: ["paid", "cancelled"],
  paid: ["sent"],
  cancelled: [],
};

/** What is locked (true) for an invoice in the given status. */
export function invoiceLocks(status: InvoiceStatus): InvoiceLocks {
  return { ...LOCKS[status] };
}

/** Whether an invoice can move directly from one status to another. */
export function canChangeStatus(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return ALLOWED[from].includes(to);
}

/** Marks a draft invoice as sent. It must have at least one line item. */
export function markSent(invoice: Invoice, lineItemCount: number, now: string): Invoice {
  if (invoice.status !== "draft") {
    throw new InvoiceRuleError("This invoice has already been sent.");
  }
  if (!Number.isInteger(lineItemCount) || lineItemCount < 1) {
    throw new InvoiceRuleError("Add at least one line item before sending.");
  }
  return {
    ...invoice,
    status: "sent",
    sentAt: now,
    paidAt: null,
    cancelledAt: null,
    cancelledVisitDates: null,
    updatedAt: now,
  };
}

/** Records payment on a sent invoice. */
export function markPaid(invoice: Invoice, now: string): Invoice {
  if (invoice.status === "draft") {
    throw new InvoiceRuleError("Send this invoice before recording payment.");
  }
  if (invoice.status === "paid") {
    throw new InvoiceRuleError("This invoice is already marked paid.");
  }
  if (invoice.status === "cancelled") {
    throw new InvoiceRuleError("A cancelled invoice can't be marked paid.");
  }
  return { ...invoice, status: "paid", paidAt: now, updatedAt: now };
}

/** Undoes "Marked paid": a paid invoice goes back to sent and keeps its sent date. */
export function undoPaid(invoice: Invoice, now: string): Invoice {
  if (invoice.status !== "paid") {
    throw new InvoiceRuleError("Only a paid invoice can be moved back to unpaid.");
  }
  return { ...invoice, status: "sent", paidAt: null, updatedAt: now };
}

/**
 * Cancels a sent invoice. It keeps its number and gets a copy of the dates of the
 * visits it's letting go of (the caller releases those visits in the same write).
 * Drafts don't need cancelling and a paid invoice needs its payment undone first.
 */
export function markCancelled(
  invoice: Invoice,
  visitDates: readonly string[],
  now: string,
): Invoice {
  if (invoice.status === "draft") {
    throw new InvoiceRuleError("Only a sent invoice can be cancelled.");
  }
  if (invoice.status === "paid") {
    throw new InvoiceRuleError("Undo the payment before cancelling this invoice.");
  }
  if (invoice.status === "cancelled") {
    throw new InvoiceRuleError("This invoice is already cancelled.");
  }
  return {
    ...invoice,
    status: "cancelled",
    cancelledAt: now,
    cancelledVisitDates: visitDates.toSorted(),
    updatedAt: now,
  };
}
