import type { Invoice, LineItem, Visit } from "@kineo/shared";
import { patientVisits } from "./visits";

/** 500 → "5%", 1250 → "12.5%". Display only. */
export function formatRate(basisPoints: number): string {
  return `${basisPoints / 100}%`;
}

/**
 * The visits the editor lists, newest first: only that patient's. A draft shows
 * the ones on it and the ones not on any invoice (which can be added); once the
 * visits are locked, only the ones on it.
 */
export function editorVisits<
  V extends Pick<Visit, "patientId" | "invoiceId" | "visitDate" | "createdAt">,
>(visits: readonly V[], invoice: Pick<Invoice, "id" | "patientId">, visitsLocked: boolean): V[] {
  return patientVisits(visits, invoice.patientId).filter(
    (visit) => visit.invoiceId === invoice.id || (!visitsLocked && visit.invoiceId === null),
  );
}

/** An invoice's lines in the order they were added. */
export function editorLines<L extends Pick<LineItem, "invoiceId" | "position">>(
  lineItems: readonly L[],
  invoiceId: string,
): L[] {
  return lineItems
    .filter((line) => line.invoiceId === invoiceId)
    .toSorted((a, b) => a.position - b.position);
}
