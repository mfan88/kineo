import { describe, expect, it } from "vitest";
import {
  RowError,
  toInvoice,
  toInvoiceStyle,
  toIsoTimestamp,
  toLineItem,
  toPatient,
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
        created_at: "2026-11-01 09:00:00+00",
        updated_at: "2026-11-02 09:00:00+00",
      }),
    ).toEqual({
      id: P,
      ownerId: OWNER,
      fullName: "Sky Example",
      reasonForVisit: null,
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
    });
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
      invoiceNumberPrefix: "",
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
        invoice_number_prefix: "INV-",
        updated_at: NOW,
      },
      OWNER,
      NOW,
    );
    expect(settings).toMatchObject({ defaultTaxRateBasisPoints: 500, invoiceNumberPrefix: "INV-" });

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
