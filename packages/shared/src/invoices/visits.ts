import type { Invoice, Visit } from "../types/models";
import { InvoiceRuleError } from "./status";

/**
 * Visits on invoices. A visit is on at most one invoice (its `invoiceId`).
 * Visits can be added to or removed from an invoice only while it is a draft,
 * and only for the invoice's own patient. Each function returns a new visit
 * and never changes the one passed in.
 */

type InvoiceRef = Pick<Invoice, "id" | "ownerId" | "patientId" | "status">;

/** Visits not on any invoice yet, in the order given. */
export function uninvoicedVisits<V extends Pick<Visit, "invoiceId">>(visits: readonly V[]): V[] {
  return visits.filter((visit) => visit.invoiceId === null);
}

/** Puts a visit on a draft invoice for the same patient. */
export function addVisitToInvoice(visit: Visit, invoice: InvoiceRef, now: string): Visit {
  if (invoice.status !== "draft") {
    throw new InvoiceRuleError("Visits can't be added once an invoice is sent.");
  }
  if (visit.ownerId !== invoice.ownerId || visit.patientId !== invoice.patientId) {
    throw new InvoiceRuleError("Only this patient's visits can go on this invoice.");
  }
  if (visit.invoiceId === invoice.id) {
    throw new InvoiceRuleError("This visit is already on this invoice.");
  }
  if (visit.invoiceId !== null) {
    throw new InvoiceRuleError("This visit is already on another invoice.");
  }
  return { ...visit, invoiceId: invoice.id, updatedAt: now };
}

/** Takes a visit off a draft invoice so it can be invoiced again later. */
export function removeVisitFromInvoice(visit: Visit, invoice: InvoiceRef, now: string): Visit {
  if (invoice.status !== "draft") {
    throw new InvoiceRuleError("Visits can't be removed once an invoice is sent.");
  }
  if (visit.invoiceId !== invoice.id) {
    throw new InvoiceRuleError("This visit isn't on this invoice.");
  }
  return { ...visit, invoiceId: null, updatedAt: now };
}
