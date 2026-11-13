import { renderInvoiceHtml } from "@kineo/invoice-template";
import type { Invoice } from "@kineo/shared";
import { useMemo } from "react";
import { usePracticeData } from "../data/PracticeStoreProvider";
import { useLogoSrc } from "../data/useLogoSrc";
import { INVOICE_FONT_FACE_CSS } from "./fonts";

/** The invoice exactly as the patient receives it, as a page for `InvoiceFrame`. */
export function useInvoiceHtml(invoice: Invoice | undefined): string {
  const { patients, visits, lineItems, profile, settings, invoiceStyle } = usePracticeData();
  const logoSrc = useLogoSrc(invoiceStyle.logoPath);
  return useMemo(() => {
    if (!invoice) return "";
    return renderInvoiceHtml({
      invoice,
      lines: lineItems.filter((line) => line.invoiceId === invoice.id),
      patient: patients.find((candidate) => candidate.id === invoice.patientId) ?? null,
      visits: visits.filter((visit) => visit.invoiceId === invoice.id),
      profile,
      settings,
      style: invoiceStyle,
      logoSrc,
      fontFaceCss: INVOICE_FONT_FACE_CSS,
    });
  }, [invoice, lineItems, patients, visits, profile, settings, invoiceStyle, logoSrc]);
}

/**
 * Opens the system print dialog for just the invoice in `frame`; choose "Save as PDF"
 * there. Returns false when the invoice isn't on the page yet.
 */
export function printInvoice(frame: HTMLIFrameElement | null): boolean {
  const view = frame?.contentWindow;
  if (!view) return false;
  view.focus();
  view.print();
  return true;
}
