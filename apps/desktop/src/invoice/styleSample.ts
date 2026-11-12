import type { InvoiceTemplateInput } from "@kineo/invoice-template";
import type { InvoiceStyle } from "@kineo/shared";
import type { DemoState } from "../data/store";
import { INVOICE_FONT_FACE_CSS } from "./fonts";

/**
 * What the Invoice style preview shows: the most recently created invoice, or a
 * made-up sample when there are no invoices yet. The style is the unsaved draft.
 */
export function stylePreviewInput(state: DemoState, style: InvoiceStyle): InvoiceTemplateInput {
  const latest = state.invoices.toSorted(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.number - a.number,
  )[0];

  if (latest) {
    return {
      invoice: latest,
      lines: state.lineItems.filter((line) => line.invoiceId === latest.id),
      patient: state.patients.find((patient) => patient.id === latest.patientId) ?? null,
      visits: state.visits.filter((visit) => visit.invoiceId === latest.id),
      profile: state.profile,
      settings: state.settings,
      style,
      fontFaceCss: INVOICE_FONT_FACE_CSS,
    };
  }

  // Made-up sample, never saved anywhere.
  const now = new Date().toISOString();
  const sampleId = "00000000-0000-4000-8000-00000000a001";
  return {
    invoice: {
      id: sampleId,
      ownerId: state.profile.ownerId,
      patientId: "00000000-0000-4000-8000-00000000a002",
      number: 1,
      status: "draft",
      taxEnabled: false,
      taxRateBasisPoints: state.settings.defaultTaxRateBasisPoints,
      sentAt: null,
      paidAt: null,
      createdAt: now,
      updatedAt: now,
    },
    lines: [
      {
        id: "00000000-0000-4000-8000-00000000a003",
        ownerId: state.profile.ownerId,
        invoiceId: sampleId,
        priceItemId: null,
        name: "Sample treatment",
        unitPriceCents: 9500,
        quantity: 1,
        position: 0,
      },
    ],
    patient: { fullName: "Sample Patient" },
    visits: [{ visitDate: now.slice(0, 10) }],
    profile: state.profile,
    settings: state.settings,
    style,
    fontFaceCss: INVOICE_FONT_FACE_CSS,
  };
}
