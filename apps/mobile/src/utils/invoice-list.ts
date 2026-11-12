import type { PracticeData } from "@kineo/data";
import { formatCad, formatInvoiceNumber, invoiceTotals, type InvoiceStatus } from "@kineo/shared";

/** One invoice in the Invoices list, worded for display. */
export interface InvoiceRow {
  id: string;
  number: string;
  patientName: string;
  total: string;
  status: InvoiceStatus;
}

/**
 * Every invoice for the Invoices tab, newest first (by when it was created, then
 * by number). Totals come from @kineo/shared; this only words them.
 */
export function invoiceRows(
  practice: Pick<PracticeData, "invoices" | "patients" | "lineItems" | "settings">,
): InvoiceRow[] {
  const { invoices, patients, lineItems, settings } = practice;
  const names = new Map(patients.map((patient) => [patient.id, patient.fullName]));
  return invoices
    .toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.number - a.number)
    .map((invoice) => ({
      id: invoice.id,
      number: formatInvoiceNumber(settings.invoiceNumberPrefix, invoice.number),
      patientName: names.get(invoice.patientId) ?? "Unknown patient",
      total: formatCad(
        invoiceTotals(
          lineItems.filter((line) => line.invoiceId === invoice.id),
          invoice,
        ).totalCents,
      ),
      status: invoice.status,
    }));
}
