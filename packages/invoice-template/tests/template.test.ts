import {
  DEFAULT_INVOICE_NUMBER_FORMAT,
  type Invoice,
  type InvoiceStyle,
  type LineItem,
  type Profile,
} from "@kineo/shared";
import { describe, expect, it } from "vitest";
import { escapeHtml, renderInvoiceHtml, type InvoiceTemplateInput } from "../src/index";

// Made-up test data only.
const owner = "user_test_owner";
const invoice: Invoice = {
  id: "3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f",
  ownerId: owner,
  patientId: "8f3b0b8e-2c1d-4a8e-9f1a-1b2c3d4e5f60",
  number: 2,
  status: "sent",
  taxEnabled: true,
  taxRateBasisPoints: 500,
  sentAt: "2026-10-22T19:00:00Z",
  paidAt: null,
  cancelledAt: null,
  cancelledVisitDates: null,
  createdAt: "2026-10-22T18:00:00Z",
  updatedAt: "2026-10-22T19:00:00Z",
};
const line = (
  name: string,
  unitPriceCents: number,
  quantity: number,
  position: number,
): LineItem => ({
  id: `00000000-0000-4000-8000-00000000000${position}`,
  ownerId: owner,
  invoiceId: invoice.id,
  priceItemId: null,
  name,
  unitPriceCents,
  quantity,
  position,
});
const profile: Profile = {
  ownerId: owner,
  fullName: { value: "Alex Example", showOnInvoice: true },
  title: { value: "Registered Physiotherapist", showOnInvoice: true },
  clinicName: { value: "Example Physio", showOnInvoice: true },
  address: { value: "100 Sample St", showOnInvoice: true },
  phone: { value: "604-555-0100", showOnInvoice: false },
  updatedAt: "2026-10-01T00:00:00Z",
};
const style: InvoiceStyle = {
  ownerId: owner,
  logoPath: null,
  accentColor: "sky",
  font: "clean",
  headerLayout: "logo-left",
  footerNote: "Thank you.",
  updatedAt: "2026-10-01T00:00:00Z",
};
const base: InvoiceTemplateInput = {
  invoice,
  // Out of order on purpose: the template sorts by position.
  lines: [line("Exercise band", 1500, 1, 1), line("Follow-up treatment", 9500, 2, 0)],
  patient: { fullName: "Morgan Testcase" },
  visits: [{ visitDate: "2026-10-22" }, { visitDate: "2026-10-15" }],
  profile,
  settings: { invoiceNumberFormat: { ...DEFAULT_INVOICE_NUMBER_FORMAT, prefix: "INV" } },
  style,
};

describe("renderInvoiceHtml", () => {
  const html = renderInvoiceHtml(base);

  it("is a complete document titled with the invoice number", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>Invoice INV-0002</title>");
    expect(html).toContain('<html lang="en-CA">');
  });

  it("prints a sent invoice's saved number, whatever the format says now", () => {
    const saved = renderInvoiceHtml({
      ...base,
      invoice: { ...invoice, displayNumber: "OLD/2026/02" },
      settings: { invoiceNumberFormat: { ...DEFAULT_INVOICE_NUMBER_FORMAT, prefix: "NEW" } },
    });
    expect(saved).toContain("<title>Invoice OLD/2026/02</title>");
    expect(saved).not.toContain("NEW");
  });

  it("shows only the profile fields marked show on invoice", () => {
    expect(html).toContain('<p class="from-name">Alex Example</p>');
    expect(html).toContain("Registered Physiotherapist");
    expect(html).not.toContain("604-555-0100");
  });

  it("shows the patient, the visit dates in order and the sent date", () => {
    expect(html).toContain('<p class="name">Morgan Testcase</p>');
    expect(html).toContain("Visits on October 15, 2026, October 22, 2026");
    expect(html).toContain("October 22, 2026</p>");
  });

  it("lists lines in position order with amounts, then the totals with tax", () => {
    expect(html.indexOf("Follow-up treatment")).toBeLessThan(html.indexOf("Exercise band"));
    expect(html).toContain('<td class="num">$190.00</td>');
    expect(html).toContain("<dt>Subtotal</dt><dd>$205.00</dd>");
    expect(html).toContain("<dt>Tax (5%)</dt><dd>$10.25</dd>");
    expect(html).toContain('<dt class="total">Total</dt><dd>$215.25</dd>');
  });

  it("leaves tax out when it's off", () => {
    const noTax = renderInvoiceHtml({ ...base, invoice: { ...invoice, taxEnabled: false } });
    expect(noTax).not.toContain("<dt>Tax");
    expect(noTax).toContain('<dt class="total">Total</dt><dd>$205.00</dd>');
  });

  it("says when there are no line items", () => {
    const empty = renderInvoiceHtml({ ...base, lines: [] });
    expect(empty).toContain("No line items");
    expect(empty).toContain('<dt class="total">Total</dt><dd>$0.00</dd>');
  });

  it("uses the draft's created date before it's sent", () => {
    const draft = renderInvoiceHtml({
      ...base,
      invoice: { ...invoice, status: "draft", sentAt: null, createdAt: "2026-11-03T18:00:00Z" },
    });
    expect(draft).toContain("November 3, 2026</p>");
  });

  it("marks a cancelled invoice as Cancelled and shows the visit dates it kept", () => {
    const cancelled: Invoice = {
      ...invoice,
      status: "cancelled",
      cancelledAt: "2026-10-25T18:00:00Z",
      cancelledVisitDates: ["2026-10-20", "2026-10-15"],
    };
    const cancelledHtml = renderInvoiceHtml({ ...base, invoice: cancelled, visits: [] });
    expect(cancelledHtml).toContain('<p class="cancelled-mark">Cancelled</p>');
    expect(cancelledHtml.indexOf("October 15, 2026")).toBeGreaterThan(-1);
    expect(cancelledHtml.indexOf("October 15, 2026")).toBeLessThan(
      cancelledHtml.indexOf("October 20, 2026"),
    );
  });

  it("doesn't mark a sent or paid invoice as cancelled", () => {
    expect(html).not.toContain('cancelled-mark">');
  });

  it("applies the style: accent colour, font, centred header and footer note", () => {
    const styled = renderInvoiceHtml({
      ...base,
      style: {
        ...style,
        accentColor: "forest",
        font: "serif",
        headerLayout: "centred",
        footerNote: "",
      },
    });
    expect(styled).toContain("color: #166534");
    expect(styled).toContain("font-family: Georgia");
    expect(styled).toContain('<header class="header centred">');
    expect(styled).not.toContain('class="footer-note"');
    expect(html).toContain('<p class="footer-note">Thank you.</p>');
  });

  it("shows the logo only when the style has one and the app passes its source", () => {
    expect(html).not.toContain('class="logo"');
    const withLogo = renderInvoiceHtml({
      ...base,
      style: { ...style, logoPath: "logos/owner.png" },
      logoSrc: "data:image/png;base64,AAAA",
    });
    expect(withLogo).toContain('<img class="logo" src="data:image/png;base64,AAAA" alt="" />');
  });

  it("includes the app's font CSS", () => {
    const withFonts = renderInvoiceHtml({
      ...base,
      fontFaceCss: "@font-face { font-family: Inter; }",
    });
    expect(withFonts).toContain("@font-face { font-family: Inter; }");
  });

  it("escapes everything the practitioner or patient typed", () => {
    const tricky = renderInvoiceHtml({
      ...base,
      patient: { fullName: '<script>alert("x")</script>' },
      lines: [line("A & B <i>", 100, 1, 0)],
      style: { ...style, footerNote: "Thanks <b>" },
    });
    expect(tricky).not.toContain("<script>");
    expect(tricky).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(tricky).toContain("A &amp; B &lt;i&gt;");
    expect(tricky).toContain("Thanks &lt;b&gt;");
  });

  it("ends with a small Made with kineō line using the drawn macron", () => {
    expect(html).toContain(
      'Made with <span class="wordmark" aria-label="Kineō">kine<span class="o">o</span></span>',
    );
  });
});

const dated = (name: string, position: number, serviceDate: string | null): LineItem => ({
  ...line(name, 9500, 1, position),
  serviceDate,
});

describe("funded invoices", () => {
  const fundedInvoice: Invoice = {
    ...invoice,
    billTo: {
      kind: "funding",
      patientFundingId: null,
      fundingName: "Example Funder",
      name: "Example Funding Branch",
      address: "PO Box 1\nVictoria BC V8W 1A1",
      details: [
        { id: "5e6f7a8b-9c0d-4e1f-8a3b-4c5d6e7f8091", label: "Billing number", value: "4821" },
        { id: "6f7a8b9c-0d1e-4f2a-9b4c-5d6e7f809102", label: "Empty one", value: " " },
      ],
    },
  };
  const funded = renderInvoiceHtml({
    ...base,
    invoice: fundedInvoice,
    lines: [dated("Later visit", 0, "2026-11-12"), dated("Earlier visit", 1, "2026-11-04")],
  });

  it("bills the recipient and names the client with their details", () => {
    expect(funded).toContain('<p class="name">Example Funding Branch</p>');
    expect(funded).toContain("<p>PO Box 1</p>");
    expect(funded).toContain("<p>Victoria BC V8W 1A1</p>");
    expect(funded).toContain('<p class="label">Client</p>');
    expect(funded).toContain('<p class="name">Morgan Testcase</p>');
    expect(funded).toContain('<p class="label">Billing number</p><p class="name id">4821</p>');
    // An empty detail still prints, with a dash, so the preview shows what's missing.
    expect(funded).toContain('<p class="label">Empty one</p><p class="name id">—</p>');
  });

  it("dates the lines, earliest first, and leaves out the visits line", () => {
    expect(funded).toContain("<th>Date</th><th>Service</th>");
    expect(funded).toContain('<th class="num">Rate</th>');
    expect(funded.indexOf("4 Nov 2026")).toBeGreaterThan(-1);
    expect(funded.indexOf("4 Nov 2026")).toBeLessThan(funded.indexOf("12 Nov 2026"));
    expect(funded).not.toContain("Visits on");
    expect(funded).not.toContain("Visit on");
  });

  it("puts undated lines last with a dash, and widens the empty row", () => {
    const mixed = renderInvoiceHtml({
      ...base,
      invoice: fundedInvoice,
      lines: [dated("No date", 0, null), dated("Dated", 1, "2026-11-04")],
    });
    expect(mixed.indexOf("Dated")).toBeLessThan(mixed.indexOf("No date"));
    expect(mixed).toContain("<td>\u2014</td>");
    expect(renderInvoiceHtml({ ...base, invoice: fundedInvoice, lines: [] })).toContain(
      'colspan="5"',
    );
  });

  it("escapes labels, values and the recipient", () => {
    const tricky = renderInvoiceHtml({
      ...base,
      invoice: {
        ...fundedInvoice,
        billTo: {
          kind: "funding",
          patientFundingId: null,
          fundingName: "F",
          name: "<b>Name</b>",
          address: "<i>Addr</i>",
          details: [
            {
              id: "5e6f7a8b-9c0d-4e1f-8a3b-4c5d6e7f8091",
              label: "<u>Label</u>",
              value: "<script>x</script>",
            },
          ],
        },
      },
    });
    expect(tricky).not.toContain("<script>");
    expect(tricky).not.toContain("<u>Label");
    expect(tricky).toContain("&lt;b&gt;Name&lt;/b&gt;");
    expect(tricky).toContain("&lt;i&gt;Addr&lt;/i&gt;");
    expect(tricky).toContain("&lt;u&gt;Label&lt;/u&gt;");
  });
});

describe("self-pay invoices", () => {
  it("bills the patient, with their billing address when set, and keeps the old table", () => {
    const html = renderInvoiceHtml({
      ...base,
      patient: { fullName: "Morgan Testcase", billingAddress: "5 Sample Ave\nBurnaby BC" },
    });
    expect(html).toContain('<p class="label">Bill to</p>');
    expect(html).toContain('<p class="name">Morgan Testcase</p>');
    expect(html).toContain("<p>5 Sample Ave</p>");
    expect(html).toContain("<p>Burnaby BC</p>");
    expect(html).not.toContain('<p class="label">Client</p>');
    expect(html).toContain("<th>Item</th>");
    expect(html).not.toContain("<th>Date</th>");
    expect(html).toContain("Visits on");
  });

  it("uses the invoice's own self-pay name over the patient's", () => {
    const html = renderInvoiceHtml({
      ...base,
      invoice: { ...invoice, billTo: { kind: "patient", name: "Kept Name", address: "" } },
    });
    expect(html).toContain('<p class="name">Kept Name</p>');
  });

  it("keeps 4 columns for an empty table", () => {
    expect(renderInvoiceHtml({ ...base, lines: [] })).toContain('colspan="4"');
  });
});

describe("escapeHtml", () => {
  it("escapes the five HTML special characters", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;",
    );
  });
});
