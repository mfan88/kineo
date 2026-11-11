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
