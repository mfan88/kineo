import type { PracticeData } from "@kineo/data";
import {
  formatCad,
  formatInvoiceNumber,
  homeGroups,
  invoiceTotals,
  recentPatients,
  type Patient,
} from "@kineo/shared";

/** One row on Home: who, what, and (for invoices) the total. */
export interface HomeRow {
  id: string;
  title: string;
  detail: string;
  amount: string | null;
}

export interface HomeSummary {
  recentPatients: Patient[];
  readyToInvoice: HomeRow[];
  notSentYet: HomeRow[];
  waitingOnPayment: HomeRow[];
  allCaughtUp: boolean;
}

const shortDate = new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric" });

/** A YYYY-MM-DD visit date as "Nov 3", without time zone shifts. */
export function formatVisitDate(date: string): string {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  return shortDate.format(new Date(year, month - 1, day));
}

/**
 * What Home shows, worded as on desktop. The grouping, totals and recent patients
 * come from @kineo/shared; this only words them.
 */
export function homeSummary(practice: PracticeData): HomeSummary {
  const { patients, visits, invoices, lineItems, settings } = practice;
  const names = new Map(patients.map((patient) => [patient.id, patient.fullName]));
  const nameOf = (patientId: string) => names.get(patientId) ?? "Unknown patient";
  const groups = homeGroups(visits, invoices);

  const invoiceRow = (invoice: (typeof invoices)[number], status: string): HomeRow => {
    const lines = lineItems.filter((line) => line.invoiceId === invoice.id);
    const number = formatInvoiceNumber(settings.invoiceNumberPrefix, invoice.number);
    return {
      id: invoice.id,
      title: nameOf(invoice.patientId),
      detail: `${number} · ${status}`,
      amount: formatCad(invoiceTotals(lines, invoice).totalCents),
    };
  };

  return {
    recentPatients: recentPatients(patients, visits),
    readyToInvoice: groups.readyToInvoice.map((group) => {
      const count = group.visitIds.length;
      const dates =
        group.oldestVisitDate === group.latestVisitDate
          ? formatVisitDate(group.oldestVisitDate)
          : `${formatVisitDate(group.oldestVisitDate)} – ${formatVisitDate(group.latestVisitDate)}`;
      return {
        id: group.patientId,
        title: nameOf(group.patientId),
        detail: `${count} ${count === 1 ? "visit" : "visits"} · ${dates}`,
        amount: null,
      };
    }),
    notSentYet: groups.notSentYet.map((invoice) => invoiceRow(invoice, "Draft")),
    waitingOnPayment: groups.waitingOnPayment.map((invoice) =>
      invoiceRow(
        invoice,
        invoice.sentAt ? `Sent ${shortDate.format(new Date(invoice.sentAt))}` : "Sent",
      ),
    ),
    allCaughtUp: groups.allCaughtUp,
  };
}
