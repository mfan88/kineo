import { createDemoPractice } from "@kineo/data/demo";
import { renderInvoiceHtml } from "@kineo/invoice-template";
import { describe, expect, it } from "vitest";
import { pdfFileName, previewHtml } from "./invoice-preview";

const practice = createDemoPractice();

describe("previewHtml", () => {
  it("lays the real template out at letter width, changing nothing else", () => {
    const [invoice] = practice.invoices;
    if (!invoice) throw new Error("The demo practice has no invoices.");
    const html = renderInvoiceHtml({
      invoice,
      lines: practice.lineItems.filter((line) => line.invoiceId === invoice.id),
      patient: practice.patients.find((patient) => patient.id === invoice.patientId) ?? null,
      visits: practice.visits.filter((visit) => visit.invoiceId === invoice.id),
      profile: practice.profile,
      settings: practice.settings,
      style: practice.invoiceStyle,
    });
    const preview = previewHtml(html);
    expect(preview).toContain('<meta name="viewport" content="width=816" />');
    expect(preview).not.toContain("width=device-width");
    expect(preview).toContain("-webkit-text-size-adjust: 100%");
    // Nothing else changes: taking the two additions out gives the template's HTML back.
    const [viewportLine = "", styleLine = ""] = preview
      .split("\n")
      .filter((line) => line.includes("width=816") || line.includes("text-size-adjust"));
    expect(
      preview
        .replace(`${styleLine}\n`, "")
        .replace(
          viewportLine,
          '<meta name="viewport" content="width=device-width, initial-scale=1" />',
        ),
    ).toBe(html);
  });

  it("leaves other HTML as it is", () => {
    expect(previewHtml("<p>Hello</p>")).toBe("<p>Hello</p>");
  });
});

describe("pdfFileName", () => {
  it("names the file after the invoice number", () => {
    expect(pdfFileName("INV-0004")).toBe("Invoice INV-0004.pdf");
    expect(pdfFileName("0012")).toBe("Invoice 0012.pdf");
  });

  it("replaces characters a file name can't hold", () => {
    expect(pdfFileName("A/B:0004")).toBe("Invoice A-B-0004.pdf");
    expect(pdfFileName("../é 0004")).toBe("Invoice ..-0004.pdf");
    expect(pdfFileName("//")).toBe("Invoice draft.pdf");
    expect(pdfFileName("")).toBe("Invoice draft.pdf");
  });
});
