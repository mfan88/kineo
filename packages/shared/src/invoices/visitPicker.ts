import { readyToInvoice } from "../home/grouping";
import type { Patient, Visit } from "../types/models";

/**
 * Starting an invoice: which visits can go on it, and which patients have any.
 * Inputs are never changed.
 */

type PickerVisit = Pick<Visit, "id" | "patientId" | "visitDate" | "createdAt" | "invoiceId">;

/**
 * A patient's visits not on any invoice yet, newest first; visits on the same day
 * by when they were created, latest first. These are what a new invoice can take.
 */
export function uninvoicedVisitsFor<V extends PickerVisit>(
  visits: readonly V[],
  patientId: string,
): V[] {
  return visits
    .filter((visit) => visit.patientId === patientId && visit.invoiceId === null)
    .toSorted((a, b) => {
      if (a.visitDate !== b.visitDate) return a.visitDate < b.visitDate ? 1 : -1;
      return Date.parse(b.createdAt) - Date.parse(a.createdAt) || (a.id < b.id ? -1 : 1);
    });
}

/**
 * The visits still ticked: every visit offered, in order, except those unticked.
 * Keeping the unticked ones (not the ticked) means a visit that arrives while the
 * picker is open starts ticked, like the rest.
 */
export function pickedVisitIds(
  offered: readonly Pick<Visit, "id">[],
  unticked: ReadonlySet<string>,
): string[] {
  return offered.filter((visit) => !unticked.has(visit.id)).map((visit) => visit.id);
}

/** The picker's button: "Continue with 2 visits", "Continue with 1 visit", or "Continue" with none. */
export function continueLabel(count: number): string {
  if (count <= 0) return "Continue";
  return `Continue with ${count} ${count === 1 ? "visit" : "visits"}`;
}

/** A patient on the Ready to invoice list. */
export interface ReadyPatient<P> {
  patient: P;
  /** Visits not on any invoice. */
  visitCount: number;
  /** Date of their oldest uninvoiced visit, YYYY-MM-DD. */
  oldestVisitDate: string;
}

/**
 * Patients with visits ready to invoice, the one waiting longest first. Visits of a
 * patient who isn't in `patients` (removed, or not synced yet) are left out.
 */
export function readyPatients<P extends Pick<Patient, "id">>(
  patients: readonly P[],
  visits: readonly Pick<Visit, "id" | "patientId" | "visitDate" | "invoiceId">[],
): ReadyPatient<P>[] {
  const byId = new Map(patients.map((patient) => [patient.id, patient]));
  return readyToInvoice(visits).flatMap((group) => {
    const patient = byId.get(group.patientId);
    return patient
      ? [{ patient, visitCount: group.visitIds.length, oldestVisitDate: group.oldestVisitDate }]
      : [];
  });
}
