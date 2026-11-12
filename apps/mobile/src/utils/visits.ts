import type { Invoice, InvoiceStatus, Visit } from "@kineo/shared";

const longDate = new Intl.DateTimeFormat("en-CA", {
  weekday: "short",
  month: "long",
  day: "numeric",
  year: "numeric",
});

/** Formats a YYYY-MM-DD visit date as a calendar date, without time zone shifts. */
export function formatVisitDate(date: string): string {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  return longDate.format(new Date(year, month - 1, day));
}

/** A patient's visits, newest first; same-day visits by when they were created. */
export function patientVisits<V extends Pick<Visit, "patientId" | "visitDate" | "createdAt">>(
  visits: readonly V[],
  patientId: string,
): V[] {
  return visits
    .filter((visit) => visit.patientId === patientId)
    .toSorted((a, b) => {
      if (a.visitDate !== b.visitDate) return a.visitDate < b.visitDate ? 1 : -1;
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    });
}

/** Where a visit stands: not on an invoice yet, or its invoice's status. */
export type VisitStatus = InvoiceStatus | "uninvoiced";

/** A visit whose invoice can't be found counts as not invoiced. */
export function visitStatus(
  visit: Pick<Visit, "invoiceId">,
  invoices: readonly Pick<Invoice, "id" | "status">[],
): VisitStatus {
  if (visit.invoiceId === null) return "uninvoiced";
  return invoices.find((invoice) => invoice.id === visit.invoiceId)?.status ?? "uninvoiced";
}
