import { homeGroups } from "./grouping";
import type { Invoice, Visit } from "../types/models";

/** The two to-do counts on Home. */
export interface TodoCounts {
  /** Visits not on any invoice, across all patients. */
  readyVisits: number;
  /** Sent invoices that haven't been paid. */
  waitingInvoices: number;
}

/** What the Home "To do" cards count; both zero means "You're all caught up". */
export function todoCounts(
  visits: readonly Pick<Visit, "id" | "patientId" | "visitDate" | "invoiceId">[],
  invoices: readonly Pick<Invoice, "id" | "status" | "createdAt" | "sentAt">[],
): TodoCounts {
  const groups = homeGroups(visits, invoices);
  return {
    readyVisits: groups.readyToInvoice.reduce((sum, group) => sum + group.visitIds.length, 0),
    waitingInvoices: groups.waitingOnPayment.length,
  };
}

/** "1 visit", "3 visits". */
export function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
