import { createDemoPractice } from "@kineo/data/demo";
import { renderInvoiceHtml } from "@kineo/invoice-template";
import { profileErrors, type Profile } from "@kineo/shared";
import { describe, expect, it } from "vitest";
import { pdfFileName, previewHtml, sendProblems } from "./invoice-preview";

const practice = createDemoPractice();
const complete: Profile = practice.profile;
const missingPhone: Profile = {
  ...complete,
  phone: { value: "", showOnInvoice: true },
  address: { value: " ", showOnInvoice: true },
};
const hiddenEmpty: Profile = { ...complete, phone: { value: "", showOnInvoice: false } };

const NOT_SYNCED_MESSAGE =
  "This invoice hasn't reached the server yet, so its number isn't final. Connect to the internet; you can send it once it's synced.";

describe("sendProblems", () => {
  it("has none for a draft with a line, a complete profile, already on the server", () => {
    expect(profileErrors(complete)).toEqual([]);
    expect(
      sendProblems({
        invoice: { status: "draft" },
        lineCount: 1,
        profile: complete,
        pending: false,
      }),
    ).toEqual([]);
  });

  it("asks for a line item when there are none", () => {
    expect(
      sendProblems({
        invoice: { status: "draft" },
        lineCount: 0,
        profile: complete,
        pending: false,
      }),
    ).toEqual([{ message: "Add at least one line item before sending.", inProfile: false }]);
  });

  it("names every profile field shown on invoices that's empty", () => {
    expect(
      sendProblems({
        invoice: { status: "draft" },
        lineCount: 2,
        profile: missingPhone,
        pending: false,
      }),
    ).toEqual([
      {
        message: "Add your address and phone before sending. They're shown on invoices.",
        inProfile: true,
      },
    ]);
  });

  it("names a single missing field on its own", () => {
    expect(
      sendProblems({
        invoice: { status: "draft" },
        lineCount: 1,
        profile: { ...complete, phone: { value: "", showOnInvoice: true } },
        pending: false,
      }),
    ).toEqual([
      { message: "Add your phone before sending. It's shown on invoices.", inProfile: true },
    ]);
  });

  it('joins three or more missing fields with commas and "and"', () => {
    const [problem] = sendProblems({
      invoice: { status: "draft" },
      lineCount: 1,
      profile: {
        ...missingPhone,
        clinicName: { value: "", showOnInvoice: true },
      },
      pending: false,
    });
    expect(problem?.message).toBe(
      "Add your clinic name, address and phone before sending. They're shown on invoices.",
    );
  });

  it("doesn't mind an empty field that isn't shown on invoices", () => {
    expect(
      sendProblems({
        invoice: { status: "draft" },
        lineCount: 1,
        profile: hiddenEmpty,
        pending: false,
      }),
    ).toEqual([]);
  });

  it("waits for an invoice that hasn't reached the server", () => {
    expect(
      sendProblems({
        invoice: { status: "draft" },
        lineCount: 1,
        profile: complete,
        pending: true,
      }),
    ).toEqual([{ message: NOT_SYNCED_MESSAGE, inProfile: false }]);
  });

  it("lists every reason at once, in a fixed order", () => {
    const problems = sendProblems({
      invoice: { status: "draft" },
      lineCount: 0,
      profile: missingPhone,
      pending: true,
    });
    expect(problems.length).toBe(3);
    expect(problems.map((problem) => problem.message)).toEqual([
      "Add at least one line item before sending.",
      "Add your address and phone before sending. They're shown on invoices.",
      NOT_SYNCED_MESSAGE,
    ]);
    expect(problems.map((problem) => problem.inProfile)).toEqual([false, true, false]);
  });

  it("has none once sent or paid, whatever else is true", () => {
    for (const status of ["sent", "paid"] as const) {
      expect(
        sendProblems({ invoice: { status }, lineCount: 0, profile: missingPhone, pending: true }),
      ).toEqual([]);
    }
  });
});

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
