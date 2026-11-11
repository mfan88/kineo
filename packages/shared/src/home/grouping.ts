import type { Invoice, Visit } from "../types/models";

/**
 * Home screen invoice to-dos, in three groups:
 *
 * - Ready to invoice: patients with visits that aren't on any invoice yet,
 *   one entry per patient, the patient waiting longest first.
 * - Not sent yet: draft invoices, oldest first.
 * - Waiting on payment: sent (unpaid) invoices, the one sent longest ago first.
 *
 * Paid invoices don't appear. Inputs are never changed.
 */

type HomeVisit = Pick<Visit, "id" | "patientId" | "visitDate" | "invoiceId">;
type HomeInvoice = Pick<Invoice, "id" | "status" | "createdAt" | "sentAt">;

/** One patient's visits waiting to be invoiced. */
export interface ReadyToInvoice {
  patientId: string;
  /** Visit IDs, oldest visit first. */
  visitIds: string[];
  /** Date of the oldest uninvoiced visit, YYYY-MM-DD. */
  oldestVisitDate: string;
  /** Date of the newest uninvoiced visit, YYYY-MM-DD. */
  latestVisitDate: string;
}

export interface HomeGroups<I extends HomeInvoice> {
  readyToInvoice: ReadyToInvoice[];
  notSentYet: I[];
  waitingOnPayment: I[];
  /** True when all three groups are empty ("You're all caught up"). */
  allCaughtUp: boolean;
}

function byText(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/** Compares ISO timestamps by instant, so different UTC offsets sort correctly. */
function byTime(a: string, b: string): number {
  return Date.parse(a) - Date.parse(b);
}

/** Groups visits not on an invoice by patient. */
export function readyToInvoice(visits: readonly HomeVisit[]): ReadyToInvoice[] {
  const byPatient = new Map<string, HomeVisit[]>();
  for (const visit of visits) {
    if (visit.invoiceId !== null) continue;
    const list = byPatient.get(visit.patientId);
    if (list) list.push(visit);
    else byPatient.set(visit.patientId, [visit]);
  }

  const groups: ReadyToInvoice[] = [];
  for (const [patientId, list] of byPatient) {
    const sorted = list.toSorted((a, b) => byText(a.visitDate, b.visitDate) || byText(a.id, b.id));
    const first = sorted[0];
    const last = sorted.at(-1);
    if (!first || !last) continue;
    groups.push({
      patientId,
      visitIds: sorted.map((visit) => visit.id),
      oldestVisitDate: first.visitDate,
      latestVisitDate: last.visitDate,
    });
  }
  return groups.toSorted(
    (a, b) => byText(a.oldestVisitDate, b.oldestVisitDate) || byText(a.patientId, b.patientId),
  );
}

/** All three Home groups from the practitioner's visits and invoices. */
export function homeGroups<I extends HomeInvoice>(
  visits: readonly HomeVisit[],
  invoices: readonly I[],
): HomeGroups<I> {
  const ready = readyToInvoice(visits);
  const notSentYet = invoices
    .filter((invoice) => invoice.status === "draft")
    .toSorted((a, b) => byTime(a.createdAt, b.createdAt) || byText(a.id, b.id));
  const waitingOnPayment = invoices
    .filter((invoice) => invoice.status === "sent")
    // A sent invoice always has sentAt (enforced by invoiceSchema); fall back to createdAt.
    .toSorted(
      (a, b) => byTime(a.sentAt ?? a.createdAt, b.sentAt ?? b.createdAt) || byText(a.id, b.id),
    );
  return {
    readyToInvoice: ready,
    notSentYet,
    waitingOnPayment,
    allCaughtUp: ready.length === 0 && notSentYet.length === 0 && waitingOnPayment.length === 0,
  };
}
