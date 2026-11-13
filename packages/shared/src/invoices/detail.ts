import { formatDayMonth, localDateString } from "../dates/display";
import { formatCad, formatPercent } from "../money";
import type { Invoice, InvoiceStatus, Visit } from "../types/models";

/**
 * The Invoices list's three groups and the wording of a sent or paid invoice's
 * detail screen. Inputs are never changed.
 */

/** The Invoices list's groups, in the order they're shown. */
export const INVOICE_GROUP_KEYS = ["notSent", "waiting", "paid"] as const;
export type InvoiceGroupKey = (typeof INVOICE_GROUP_KEYS)[number];

export const INVOICE_GROUP_LABELS: Record<InvoiceGroupKey, string> = {
  notSent: "Not sent yet",
  waiting: "Waiting on payment",
  paid: "Paid",
};

/** The pills' shorter words, as on the storyboard ("Waiting · 2"); screen readers get the full label. */
export const INVOICE_GROUP_SHORT_LABELS: Record<InvoiceGroupKey, string> = {
  notSent: "Not sent yet",
  waiting: "Waiting",
  paid: "Paid",
};

const GROUP_OF_STATUS: Record<InvoiceStatus, InvoiceGroupKey> = {
  draft: "notSent",
  sent: "waiting",
  paid: "paid",
};

type ListedInvoice = Pick<Invoice, "id" | "number" | "status" | "createdAt">;

export interface InvoiceGroup<I extends ListedInvoice> {
  key: InvoiceGroupKey;
  label: string;
  invoices: I[];
}

/** Newest first: by when it was created, then by number. */
function newestFirst(a: ListedInvoice, b: ListedInvoice): number {
  return Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.number - a.number;
}

/** Every invoice in its group (Not sent yet, Waiting on payment, Paid), newest first in each. */
export function invoiceGroups<I extends ListedInvoice>(invoices: readonly I[]): InvoiceGroup<I>[] {
  const sorted = invoices.toSorted(newestFirst);
  return INVOICE_GROUP_KEYS.map((key) => ({
    key,
    label: INVOICE_GROUP_LABELS[key],
    invoices: sorted.filter((invoice) => GROUP_OF_STATUS[invoice.status] === key),
  }));
}

/** Narrows a route or search parameter to a group, or undefined if it isn't one. */
export function parseInvoiceGroup(value: unknown): InvoiceGroupKey | undefined {
  return INVOICE_GROUP_KEYS.find((key) => key === value);
}

/**
 * The group the list opens on: the one asked for (Home's Waiting on payment card
 * asks for "waiting"), otherwise the first with any invoices, otherwise Not sent yet.
 */
export function initialInvoiceGroup(
  groups: readonly Pick<InvoiceGroup<ListedInvoice>, "key" | "invoices">[],
  requested?: InvoiceGroupKey,
): InvoiceGroupKey {
  if (requested) return requested;
  return groups.find((group) => group.invoices.length > 0)?.key ?? "notSent";
}

/** A group's pill: "Waiting · 2", and what a screen reader says for it: "Waiting on payment, 2 invoices". */
export function invoiceGroupPill(group: Pick<InvoiceGroup<ListedInvoice>, "key" | "invoices">): {
  text: string;
  accessibilityLabel: string;
} {
  const count = group.invoices.length;
  return {
    text: `${INVOICE_GROUP_SHORT_LABELS[group.key]} · ${count}`,
    accessibilityLabel: `${INVOICE_GROUP_LABELS[group.key]}, ${count} ${count === 1 ? "invoice" : "invoices"}`,
  };
}

/**
 * The line under a sent or paid invoice's total: "INV-0012 · Maya Okafor · sent 12 Nov",
 * or "… · paid 14 Nov" once paid. Dates are the day it happened on this device's
 * clock, with the year when it isn't this year. A draft has no date.
 */
export function invoiceDetailLine(
  number: string,
  patientName: string,
  invoice: Pick<Invoice, "status" | "sentAt" | "paidAt">,
  today: string,
): string {
  const parts = [number, patientName];
  const event =
    invoice.status === "paid" && invoice.paidAt
      ? { word: "paid", at: invoice.paidAt }
      : invoice.status !== "draft" && invoice.sentAt
        ? { word: "sent", at: invoice.sentAt }
        : null;
  if (event) {
    const day = localDateString(new Date(event.at));
    parts.push(`${event.word} ${formatDayMonth(day, today)}`);
  }
  return parts.join(" · ");
}

/** The detail's Visits row: the dates on the invoice, oldest first ("4 Nov, 12 Nov"), or "None". */
export function invoiceVisitDates(
  visits: readonly Pick<Visit, "visitDate" | "invoiceId">[],
  invoiceId: string,
  today: string,
): string {
  const dates = visits
    .filter((visit) => visit.invoiceId === invoiceId)
    .map((visit) => visit.visitDate)
    .toSorted();
  return dates.length === 0 ? "None" : dates.map((date) => formatDayMonth(date, today)).join(", ");
}

/** The detail's Tax row: "None", or the rate and amount ("5% · $11.00"). */
export function invoiceTaxLabel(
  invoice: Pick<Invoice, "taxEnabled" | "taxRateBasisPoints">,
  taxCents: number,
): string {
  if (!invoice.taxEnabled) return "None";
  return `${formatPercent(invoice.taxRateBasisPoints)}% · ${formatCad(taxCents)}`;
}
