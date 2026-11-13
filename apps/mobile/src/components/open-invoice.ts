import { router } from "expo-router";

/** Opens an invoice's editor, on top of whichever tab you're in. */
export function openInvoice(invoiceId: string): void {
  router.navigate({ pathname: "/invoice/[id]", params: { id: invoiceId } });
}

/** Opens an invoice's preview, on top of its editor. */
export function openInvoicePreview(invoiceId: string): void {
  router.navigate({ pathname: "/invoice-preview/[id]", params: { id: invoiceId } });
}

/** Opens the New invoice step for a patient: pick their visits, then Continue. */
export function openNewInvoice(patientId: string): void {
  router.navigate({ pathname: "/new-invoice/[patientId]", params: { patientId } });
}

/** Opens the list of patients with visits ready to invoice. */
export function openReadyToInvoice(): void {
  router.navigate("/ready-to-invoice");
}
