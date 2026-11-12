import { router } from "expo-router";

/** Opens an invoice's editor, on top of whichever tab you're in. */
export function openInvoice(invoiceId: string): void {
  router.navigate({ pathname: "/invoice/[id]", params: { id: invoiceId } });
}

/** Opens an invoice's preview, on top of its editor. */
export function openInvoicePreview(invoiceId: string): void {
  router.navigate({ pathname: "/invoice-preview/[id]", params: { id: invoiceId } });
}
