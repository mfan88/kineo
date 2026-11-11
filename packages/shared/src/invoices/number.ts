/**
 * Formats an invoice number for display: the practice's prefix followed by the
 * number padded to at least four digits, e.g. ("INV-", 7) → "INV-0007".
 */
export function formatInvoiceNumber(prefix: string, invoiceNumber: number): string {
  if (!Number.isSafeInteger(invoiceNumber) || invoiceNumber < 1) {
    throw new RangeError("Invoice number must be a whole number of at least 1.");
  }
  return `${prefix.trim()}${invoiceNumber.toString().padStart(4, "0")}`;
}

/**
 * The number for a practitioner's next invoice: one more than the highest so far,
 * or 1 for their first. Gaps are kept (numbers are never reused).
 */
export function nextInvoiceNumber(invoices: readonly { number: number }[]): number {
  let highest = 0;
  for (const invoice of invoices) {
    if (invoice.number > highest) highest = invoice.number;
  }
  return highest + 1;
}
