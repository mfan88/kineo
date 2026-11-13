import { DEFAULT_INVOICE_NUMBER_FORMAT } from "@kineo/shared";
import { describe, expect, it } from "vitest";
import {
  RowError,
  toInvoice,
  toFundingType,
  toInvoiceStyle,
  toIsoTimestamp,
  toLineItem,
  toPatient,
  toPatientFunding,
  toPriceItem,
  toProfile,
  toSettings,
  toVisit,
} from "../src/mappers";

const OWNER = "user_test";
const NOW = "2026-11-12T10:00:00.000Z";
const P = "0f8fad5b-d9cb-469f-a165-70867728950e";
const V = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const I = "16fd2706-8baf-433b-82eb-8c7fada847da";
const L = "886313e1-3b8a-4372-9b90-0c9aee199e5d";

describe("toIsoTimestamp", () => {
  it("turns Postgres text timestamps into ISO 8601", () => {
    expect(toIsoTimestamp("2026-11-12 03:15:00.123+00")).toBe("2026-11-12T03:15:00.123+00:00");
    expect(toIsoTimestamp("2026-11-12 03:15:00-08")).toBe("2026-11-12T03:15:00-08:00");
    expect(toIsoTimestamp("2026-11-12 03:15:00Z")).toBe("2026-11-12T03:15:00Z");
  });

  it("leaves ISO timestamps alone", () => {
    expect(toIsoTimestamp("2026-11-12T03:15:00.000Z")).toBe("2026-11-12T03:15:00.000Z");
    expect(toIsoTimestamp("2026-11-12T03:15:00+05:30")).toBe("2026-11-12T03:15:00+05:30");
  });

  it("treats missing values as null", () => {
    expect(toIsoTimestamp(null)).toBeNull();
    expect(toIsoTimestamp(undefined)).toBeNull();
    expect(toIsoTimestamp("")).toBeNull();
  });
});

describe("row mappers", () => {
  it("maps a patient, keeping an empty reason as null", () => {
    expect(
      toPatient({
        id: P,
        owner_id: OWNER,
        full_name: "Sky Example",
        reason_for_visit: null,
        billing_address: null,
        created_at: "2026-11-01 09:00:00+00",
        updated_at: "2026-11-02 09:00:00+00",
      }),
    ).toEqual({
      id: P,
      ownerId: OWNER,
      fullName: "Sky Example",
      reasonForVisit: null,
      billingAddress: "",
      createdAt: "2026-11-01T09:00:00+00:00",
      updatedAt: "2026-11-02T09:00:00+00:00",
    });
  });

  it("maps a visit, with or without an invoice", () => {
    const row = {
      id: V,
      owner_id: OWNER,
      patient_id: P,
      visit_date: "2026-11-10",
      note: "Knee: improving.",
      note_edited_at: NOW,
      invoice_id: null,
      created_at: NOW,
      updated_at: NOW,
    };
    expect(toVisit(row)).toMatchObject({ patientId: P, visitDate: "2026-11-10", invoiceId: null });
    expect(toVisit({ ...row, invoice_id: I }).invoiceId).toBe(I);
    expect(toVisit({ ...row, note: null }).note).toBe("");
  });

  it("keeps money as integer cents, including zero", () => {
    const row = {
      id: L,
      owner_id: OWNER,
      name: "Assessment",
      unit_price_cents: 0,
      created_at: NOW,
      updated_at: NOW,
    };
    expect(toPriceItem(row).unitPriceCents).toBe(0);
    expect(toPriceItem({ ...row, unit_price_cents: 12_550 }).unitPriceCents).toBe(12_550);
    expect(() => toPriceItem({ ...row, unit_price_cents: 12.5 })).toThrow(RowError);
    expect(() => toPriceItem({ ...row, unit_price_cents: -1 })).toThrow(RowError);
  });

  it("maps a line item, with a deleted price item as null", () => {
    const line = toLineItem({
      id: L,
      owner_id: OWNER,
      invoice_id: I,
      price_item_id: null,
      name: "Treatment",
      unit_price_cents: 9_000,
      quantity: 2,
      position: 0,
      service_date: null,
    });
    expect(line).toEqual({
      id: L,
      ownerId: OWNER,
      invoiceId: I,
      priceItemId: null,
      name: "Treatment",
      unitPriceCents: 9_000,
      quantity: 2,
      position: 0,
      serviceDate: null,
    });
  });

  it("maps a line's service date", () => {
    const row = {
      id: L,
      owner_id: OWNER,
      invoice_id: I,
      price_item_id: null,
      name: "Treatment",
      unit_price_cents: 9_000,
      quantity: 1,
      position: 0,
      service_date: "2026-11-04",
    };
    expect(toLineItem(row).serviceDate).toBe("2026-11-04");
    expect(() => toLineItem({ ...row, service_date: "4 Nov" })).toThrow(RowError);
  });

  it("maps invoices in every status, with tax as a boolean", () => {
    const draft = {
      id: I,
      owner_id: OWNER,
      patient_id: P,
      number: 1,
      status: "draft",
      tax_enabled: 0,
      tax_rate_basis_points: 500,
      sent_at: null,
      paid_at: null,
      cancelled_at: null,
      cancelled_visit_dates: null,
      display_number: null,
      bill_to_kind: null,
      bill_to_name: null,
      bill_to_address: null,
      bill_to_funding_name: null,
      patient_funding_id: null,
      bill_to_details: null,
      created_at: NOW,
      updated_at: NOW,
    };
    expect(toInvoice(draft)).toMatchObject({ status: "draft", taxEnabled: false, sentAt: null });
    expect(
      toInvoice({ ...draft, status: "sent", tax_enabled: 1, sent_at: "2026-11-11 08:00:00+00" }),
    ).toMatchObject({
      status: "sent",
      taxEnabled: true,
      sentAt: "2026-11-11T08:00:00+00:00",
    });
    const paid = toInvoice({ ...draft, status: "paid", sent_at: NOW, paid_at: NOW });
    expect(paid.paidAt).toBe(NOW);
    const cancelled = toInvoice({
      ...draft,
      status: "cancelled",
      sent_at: NOW,
      cancelled_at: NOW,
      cancelled_visit_dates: '["2026-11-01","2026-11-04"]',
      bill_to_kind: null,
      bill_to_name: null,
      bill_to_address: null,
      bill_to_funding_name: null,
      patient_funding_id: null,
      bill_to_details: null,
    });
    expect(cancelled).toMatchObject({
      status: "cancelled",
      cancelledAt: NOW,
      cancelledVisitDates: ["2026-11-01", "2026-11-04"],
    });
  });

  it("refuses a cancelled invoice without its visit dates", () => {
    expect(() =>
      toInvoice({
        id: I,
        owner_id: OWNER,
        patient_id: P,
        number: 1,
        status: "cancelled",
        tax_enabled: 0,
        tax_rate_basis_points: 0,
        sent_at: NOW,
        paid_at: null,
        cancelled_at: NOW,
        cancelled_visit_dates: null,
        display_number: null,
        bill_to_kind: null,
        bill_to_name: null,
        bill_to_address: null,
        bill_to_funding_name: null,
        patient_funding_id: null,
        bill_to_details: null,
        created_at: NOW,
        updated_at: NOW,
      }),
    ).toThrow(RowError);
  });

  it("refuses an invoice whose dates don't match its status", () => {
    expect(() =>
      toInvoice({
        id: I,
        owner_id: OWNER,
        patient_id: P,
        number: 1,
        status: "sent",
        tax_enabled: 0,
        tax_rate_basis_points: 0,
        sent_at: null,
        paid_at: null,
        cancelled_at: null,
        cancelled_visit_dates: null,
        display_number: null,
        bill_to_kind: null,
        bill_to_name: null,
        bill_to_address: null,
        bill_to_funding_name: null,
        patient_funding_id: null,
        bill_to_details: null,
        created_at: NOW,
        updated_at: NOW,
      }),
    ).toThrow(RowError);
  });

  it("names the table, never the row, when a row can't be read", () => {
    const row = {
      id: P,
      owner_id: OWNER,
      full_name: "Sky Example",
      reason_for_visit: null,
      billing_address: null,
      created_at: "not a time",
      updated_at: NOW,
    };
    expect(() => toPatient(row)).toThrow(RowError);
    expect(() => toPatient(row)).toThrow(/^A row in patients couldn't be read\.$/);
  });
});

describe("one-per-practitioner rows", () => {
  it("uses the server's defaults when nothing is saved yet", () => {
    expect(toProfile(undefined, OWNER, NOW)).toEqual({
      ownerId: OWNER,
      fullName: { value: "", showOnInvoice: false },
      title: { value: "", showOnInvoice: false },
      clinicName: { value: "", showOnInvoice: false },
      address: { value: "", showOnInvoice: false },
      phone: { value: "", showOnInvoice: false },
      updatedAt: NOW,
    });
    expect(toSettings(undefined, OWNER, NOW)).toEqual({
      ownerId: OWNER,
      defaultTaxRateBasisPoints: 0,
      invoiceNumberFormat: DEFAULT_INVOICE_NUMBER_FORMAT,
      invoiceNumberStart: 1,
      updatedAt: NOW,
    });
    expect(toInvoiceStyle(undefined, OWNER, NOW)).toEqual({
      ownerId: OWNER,
      logoPath: null,
      accentColor: "sky",
      font: "clean",
      headerLayout: "logo-left",
      footerNote: "",
      updatedAt: NOW,
    });
  });

  it("maps saved values, with each field's show-on-invoice flag", () => {
    const profile = toProfile(
      {
        id: P,
        owner_id: OWNER,
        full_name: "Alex Example",
        full_name_on_invoice: 1,
        title: "Physiotherapist",
        title_on_invoice: 0,
        clinic_name: "",
        clinic_name_on_invoice: 0,
        address: "",
        address_on_invoice: 0,
        phone: "",
        phone_on_invoice: 0,
        updated_at: "2026-11-05 12:00:00+00",
      },
      OWNER,
      NOW,
    );
    expect(profile.fullName).toEqual({ value: "Alex Example", showOnInvoice: true });
    expect(profile.title).toEqual({ value: "Physiotherapist", showOnInvoice: false });
    expect(profile.updatedAt).toBe("2026-11-05T12:00:00+00:00");

    const settings = toSettings(
      {
        id: P,
        owner_id: OWNER,
        default_tax_rate_basis_points: 500,
        invoice_number_prefix: "INV",
        invoice_number_order: "year,prefix,month,number",
        invoice_number_show_prefix: 1,
        invoice_number_show_year: 1,
        invoice_number_show_month: 0,
        invoice_number_separator: "/",
        invoice_number_digits: 3,
        invoice_number_start: 1250,
        updated_at: NOW,
      },
      OWNER,
      NOW,
    );
    expect(settings).toMatchObject({
      defaultTaxRateBasisPoints: 500,
      invoiceNumberFormat: {
        prefix: "INV",
        order: ["year", "prefix", "month", "number"],
        shown: { prefix: true, year: true, month: false },
        separator: "/",
        digits: 3,
      },
      invoiceNumberStart: 1250,
    });

    // A row from before the parts (the server's rewrite not here yet) reads the same
    // way the server rewrites it, so numbers look as they did.
    const before = (prefix: string) =>
      toSettings(
        {
          id: P,
          owner_id: OWNER,
          default_tax_rate_basis_points: 0,
          invoice_number_prefix: prefix,
          invoice_number_order: null,
          invoice_number_show_prefix: null,
          invoice_number_show_year: null,
          invoice_number_show_month: null,
          invoice_number_separator: null,
          invoice_number_digits: null,
          invoice_number_start: null,
          updated_at: NOW,
        },
        OWNER,
        NOW,
      ).invoiceNumberFormat;
    expect(before("INV-")).toMatchObject({ prefix: "INV", separator: "-" });
    expect(before(" JS/ ")).toMatchObject({ prefix: "JS", separator: "/" });
    expect(before("ABC")).toMatchObject({ prefix: "ABC", separator: "" });
    expect(before("")).toMatchObject({ prefix: "", separator: "-" });

    const style = toInvoiceStyle(
      {
        id: P,
        owner_id: OWNER,
        logo_path: "user_test/logo.png",
        accent_color: "plum",
        font: "serif",
        header_layout: "centred",
        footer_note: "Thank you.",
        updated_at: NOW,
      },
      OWNER,
      NOW,
    );
    expect(style).toMatchObject({
      logoPath: "user_test/logo.png",
      accentColor: "plum",
      headerLayout: "centred",
    });
  });

  it("refuses an invoice style value the app doesn't know", () => {
    expect(() =>
      toInvoiceStyle(
        {
          id: P,
          owner_id: OWNER,
          logo_path: null,
          accent_color: "neon",
          font: "clean",
          header_layout: "logo-left",
          footer_note: "",
          updated_at: NOW,
        },
        OWNER,
        NOW,
      ),
    ).toThrow(RowError);
  });
});

describe("funding mappers", () => {
  const T = "5eed0000-0000-4000-8000-000000000701";
  const D = "5eed0000-0000-4000-8000-000000000702";
  const typeRow = {
    id: T,
    owner_id: OWNER,
    name: "Autism Funding",
    recipient_name: "Example Branch",
    recipient_address: "PO Box 1",
    details: JSON.stringify([
      { id: D, label: "Billing number", kind: "text", show_on_invoice: true },
    ]),
    created_at: "2026-11-01 09:00:00+00",
    updated_at: "2026-11-02 09:00:00+00",
  };

  it("maps a funding type, reading its details from JSON text", () => {
    expect(toFundingType(typeRow)).toEqual({
      id: T,
      ownerId: OWNER,
      name: "Autism Funding",
      recipientName: "Example Branch",
      recipientAddress: "PO Box 1",
      details: [{ id: D, label: "Billing number", kind: "text", showOnInvoice: true }],
      createdAt: "2026-11-01T09:00:00+00:00",
      updatedAt: "2026-11-02T09:00:00+00:00",
    });
  });

  it("treats missing details and recipient as empty", () => {
    expect(
      toFundingType({ ...typeRow, details: null, recipient_name: null, recipient_address: null }),
    ).toMatchObject({ details: [], recipientName: "", recipientAddress: "" });
  });

  it("refuses details that aren't valid JSON or the right shape, naming only the table", () => {
    for (const details of ["{not json", '{"a":1}', '[{"id":"x"}]', "[1]"]) {
      expect(() => toFundingType({ ...typeRow, details })).toThrow(new RowError("funding_types"));
    }
  });

  it("maps a patient funding, with values keyed by detail id", () => {
    expect(
      toPatientFunding({
        id: "5eed0000-0000-4000-8000-000000000801",
        owner_id: OWNER,
        patient_id: P,
        funding_type_id: T,
        detail_values: JSON.stringify({ [D]: "4821" }),
        period_start: "2026-04-01",
        period_end: "2027-03-31",
        ended_on: null,
        created_at: NOW,
        updated_at: NOW,
      }),
    ).toMatchObject({
      patientId: P,
      fundingTypeId: T,
      detailValues: { [D]: "4821" },
      periodStart: "2026-04-01",
      periodEnd: "2027-03-31",
      endedOn: null,
    });
  });

  it("refuses bad detail values and a period that ends before it starts", () => {
    const row = {
      id: "5eed0000-0000-4000-8000-000000000801",
      owner_id: OWNER,
      patient_id: P,
      funding_type_id: null,
      detail_values: null,
      period_start: null,
      period_end: null,
      ended_on: null,
      created_at: NOW,
      updated_at: NOW,
    };
    expect(toPatientFunding(row)).toMatchObject({ fundingTypeId: null, detailValues: {} });
    expect(() => toPatientFunding({ ...row, detail_values: "[1]" })).toThrow(RowError);
    expect(() => toPatientFunding({ ...row, detail_values: "oops" })).toThrow(RowError);
    expect(() =>
      toPatientFunding({ ...row, period_start: "2026-04-02", period_end: "2026-04-01" }),
    ).toThrow(RowError);
  });

  describe("invoice Bill to", () => {
    const base = {
      id: I,
      owner_id: OWNER,
      patient_id: P,
      number: 1,
      status: "draft",
      tax_enabled: 0,
      tax_rate_basis_points: 0,
      sent_at: null,
      paid_at: null,
      cancelled_at: null,
      cancelled_visit_dates: null,
      display_number: null,
      bill_to_kind: "patient",
      bill_to_name: "Sky Example",
      bill_to_address: "1 Example St",
      bill_to_funding_name: "",
      patient_funding_id: null,
      bill_to_details: "[]",
      created_at: NOW,
      updated_at: NOW,
    };

    it("reads a self-pay invoice", () => {
      expect(toInvoice(base).billTo).toEqual({
        kind: "patient",
        name: "Sky Example",
        address: "1 Example St",
      });
      expect(toInvoice({ ...base, bill_to_kind: null, bill_to_name: null }).billTo).toEqual({
        kind: "patient",
        name: "",
        address: "1 Example St",
      });
    });

    it("reads a funded invoice, with its details from JSON text", () => {
      const details = [{ id: D, label: "Billing number", value: "4821" }];
      expect(
        toInvoice({
          ...base,
          bill_to_kind: "funding",
          bill_to_name: "Example Branch",
          bill_to_funding_name: "Autism Funding",
          patient_funding_id: "5eed0000-0000-4000-8000-000000000801",
          bill_to_details: JSON.stringify(details),
        }).billTo,
      ).toEqual({
        kind: "funding",
        patientFundingId: "5eed0000-0000-4000-8000-000000000801",
        fundingName: "Autism Funding",
        name: "Example Branch",
        address: "1 Example St",
        details,
      });
    });

    it("keeps a funded invoice whose funding was deleted, and refuses broken details", () => {
      const funded = { ...base, bill_to_kind: "funding", bill_to_funding_name: "ICBC" };
      expect(toInvoice(funded).billTo).toMatchObject({ patientFundingId: null, details: [] });
      expect(() => toInvoice({ ...funded, bill_to_details: "nope" })).toThrow(
        new RowError("invoices"),
      );
      expect(() => toInvoice({ ...funded, bill_to_details: '{"a":1}' })).toThrow(RowError);
      expect(() => toInvoice({ ...funded, bill_to_funding_name: "" })).toThrow(RowError);
    });
  });
});
