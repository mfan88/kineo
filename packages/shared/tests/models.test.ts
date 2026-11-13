import { describe, expect, it } from "vitest";
import {
  formatInvoiceNumber,
  nextInvoiceNumber,
  invoiceSchema,
  invoiceStyleSchema,
  lineItemSchema,
  patientSchema,
  practiceSettingsSchema,
  priceItemSchema,
  profileSchema,
  visitSchema,
} from "../src/index";

// Made-up test data only.
const owner = "user_test_owner";
const now = "2026-11-11T09:30:00Z";
const ids = {
  patient: "8f3b0b8e-2c1d-4a8e-9f1a-1b2c3d4e5f60",
  visit: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  priceItem: "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e",
  invoice: "3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f",
  line: "4d5e6f7a-8b9c-4d0e-9f2a-3b4c5d6e7f80",
};

const patient = {
  id: ids.patient,
  ownerId: owner,
  fullName: "Test Patient",
  reasonForVisit: "Sore shoulder",
  createdAt: now,
  updatedAt: now,
};

const visit = {
  id: ids.visit,
  ownerId: owner,
  patientId: ids.patient,
  visitDate: "2026-11-11",
  note: "Range of motion improving.",
  noteEditedAt: now,
  invoiceId: null,
  createdAt: now,
  updatedAt: now,
};

const priceItem = {
  id: ids.priceItem,
  ownerId: owner,
  name: "Follow-up treatment",
  unitPriceCents: 9_500,
  createdAt: now,
  updatedAt: now,
};

const lineItem = {
  id: ids.line,
  ownerId: owner,
  invoiceId: ids.invoice,
  priceItemId: ids.priceItem,
  name: "Follow-up treatment",
  unitPriceCents: 9_500,
  quantity: 1,
  position: 0,
};

const draftInvoice = {
  id: ids.invoice,
  ownerId: owner,
  patientId: ids.patient,
  number: 1,
  status: "draft",
  taxEnabled: false,
  taxRateBasisPoints: 0,
  sentAt: null,
  paidAt: null,
  cancelledAt: null,
  cancelledVisitDates: null,
  createdAt: now,
  updatedAt: now,
};

const field = (value: string, showOnInvoice = true) => ({ value, showOnInvoice });
const profile = {
  ownerId: owner,
  fullName: field("Alex Example"),
  title: field("Registered Physiotherapist"),
  clinicName: field("", false),
  address: field("123 Example St, Vancouver BC"),
  phone: field("", false),
  updatedAt: now,
};

const style = {
  ownerId: owner,
  logoPath: null,
  accentColor: "sky",
  font: "clean",
  headerLayout: "logo-left",
  footerNote: "Thank you.",
  updatedAt: now,
};

describe("patientSchema", () => {
  it("accepts a valid patient and trims the name", () => {
    expect(patientSchema.parse({ ...patient, fullName: "  Test Patient  " }).fullName).toBe(
      "Test Patient",
    );
    expect(patientSchema.safeParse({ ...patient, reasonForVisit: null }).success).toBe(true);
  });

  it("rejects an empty name, a bad id and a missing owner", () => {
    expect(patientSchema.safeParse({ ...patient, fullName: "   " }).success).toBe(false);
    expect(patientSchema.safeParse({ ...patient, id: "not-a-uuid" }).success).toBe(false);
    expect(patientSchema.safeParse({ ...patient, ownerId: "" }).success).toBe(false);
  });
});

describe("visitSchema", () => {
  it("accepts a visit with or without an invoice and an empty note", () => {
    expect(visitSchema.safeParse(visit).success).toBe(true);
    expect(visitSchema.safeParse({ ...visit, invoiceId: ids.invoice }).success).toBe(true);
    expect(visitSchema.safeParse({ ...visit, note: "" }).success).toBe(true);
  });

  it("rejects a bad date and a missing edit timestamp", () => {
    expect(visitSchema.safeParse({ ...visit, visitDate: "2026-13-01" }).success).toBe(false);
    expect(visitSchema.safeParse({ ...visit, noteEditedAt: undefined }).success).toBe(false);
  });
});

describe("priceItemSchema", () => {
  it("accepts a price, including a free item", () => {
    expect(priceItemSchema.safeParse(priceItem).success).toBe(true);
    expect(priceItemSchema.safeParse({ ...priceItem, unitPriceCents: 0 }).success).toBe(true);
  });

  it("rejects negative or fractional cents and an empty name", () => {
    expect(priceItemSchema.safeParse({ ...priceItem, unitPriceCents: -1 }).success).toBe(false);
    expect(priceItemSchema.safeParse({ ...priceItem, unitPriceCents: 95.5 }).success).toBe(false);
    expect(priceItemSchema.safeParse({ ...priceItem, name: "" }).success).toBe(false);
  });
});

describe("lineItemSchema", () => {
  it("accepts a line copied from the price list, or one whose item was deleted", () => {
    expect(lineItemSchema.safeParse(lineItem).success).toBe(true);
    expect(lineItemSchema.safeParse({ ...lineItem, priceItemId: null }).success).toBe(true);
  });

  it("rejects a quantity below 1 or not whole", () => {
    expect(lineItemSchema.safeParse({ ...lineItem, quantity: 0 }).success).toBe(false);
    expect(lineItemSchema.safeParse({ ...lineItem, quantity: 1.5 }).success).toBe(false);
  });

  it("rejects a negative position", () => {
    expect(lineItemSchema.safeParse({ ...lineItem, position: -1 }).success).toBe(false);
  });
});

describe("invoiceSchema", () => {
  it("accepts draft, sent and paid invoices with matching dates", () => {
    expect(invoiceSchema.safeParse(draftInvoice).success).toBe(true);
    expect(invoiceSchema.safeParse({ ...draftInvoice, status: "sent", sentAt: now }).success).toBe(
      true,
    );
    expect(
      invoiceSchema.safeParse({ ...draftInvoice, status: "paid", sentAt: now, paidAt: now })
        .success,
    ).toBe(true);
  });

  it("accepts a cancelled invoice with its dates and visit dates", () => {
    expect(
      invoiceSchema.safeParse({
        ...draftInvoice,
        status: "cancelled",
        sentAt: now,
        cancelledAt: now,
        cancelledVisitDates: ["2026-11-01"],
      }).success,
    ).toBe(true);
  });

  it("rejects dates that don't match the status", () => {
    expect(invoiceSchema.safeParse({ ...draftInvoice, sentAt: now }).success).toBe(false);
    expect(invoiceSchema.safeParse({ ...draftInvoice, status: "sent" }).success).toBe(false);
    expect(
      invoiceSchema.safeParse({ ...draftInvoice, status: "sent", sentAt: now, paidAt: now })
        .success,
    ).toBe(false);
    expect(invoiceSchema.safeParse({ ...draftInvoice, status: "paid", sentAt: now }).success).toBe(
      false,
    );
    expect(invoiceSchema.safeParse({ ...draftInvoice, cancelledAt: now }).success).toBe(false);
    expect(
      invoiceSchema.safeParse({ ...draftInvoice, status: "cancelled", sentAt: now }).success,
    ).toBe(false);
    expect(invoiceSchema.safeParse({ ...draftInvoice, cancelledVisitDates: [] }).success).toBe(
      false,
    );
  });

  it("checks the tax rate range, number and status", () => {
    expect(
      invoiceSchema.safeParse({ ...draftInvoice, taxEnabled: true, taxRateBasisPoints: 10_000 })
        .success,
    ).toBe(true);
    expect(invoiceSchema.safeParse({ ...draftInvoice, taxRateBasisPoints: 10_001 }).success).toBe(
      false,
    );
    expect(invoiceSchema.safeParse({ ...draftInvoice, taxRateBasisPoints: -1 }).success).toBe(
      false,
    );
    expect(invoiceSchema.safeParse({ ...draftInvoice, number: 0 }).success).toBe(false);
    expect(invoiceSchema.safeParse({ ...draftInvoice, status: "void" }).success).toBe(false);
  });
});

describe("profileSchema", () => {
  it("accepts a profile with hidden empty fields", () => {
    expect(profileSchema.safeParse(profile).success).toBe(true);
  });

  it("rejects a field without a show-on-invoice flag", () => {
    expect(profileSchema.safeParse({ ...profile, phone: { value: "" } }).success).toBe(false);
  });
});

describe("practiceSettingsSchema", () => {
  const settings = {
    ownerId: owner,
    defaultTaxRateBasisPoints: 500,
    invoiceNumberPrefix: "INV-",
    updatedAt: now,
  };

  it("accepts settings with or without a prefix", () => {
    expect(practiceSettingsSchema.safeParse(settings).success).toBe(true);
    expect(practiceSettingsSchema.safeParse({ ...settings, invoiceNumberPrefix: "" }).success).toBe(
      true,
    );
  });

  it("rejects a prefix over 20 characters and an invalid rate", () => {
    expect(
      practiceSettingsSchema.safeParse({ ...settings, invoiceNumberPrefix: "X".repeat(21) })
        .success,
    ).toBe(false);
    expect(
      practiceSettingsSchema.safeParse({ ...settings, defaultTaxRateBasisPoints: 12.5 }).success,
    ).toBe(false);
  });
});

describe("invoiceStyleSchema", () => {
  it("accepts every listed option", () => {
    expect(invoiceStyleSchema.safeParse(style).success).toBe(true);
    for (const accentColor of ["sky", "forest", "ocean", "plum", "charcoal"]) {
      expect(invoiceStyleSchema.safeParse({ ...style, accentColor }).success).toBe(true);
    }
    for (const font of ["nunito", "serif", "clean"]) {
      expect(invoiceStyleSchema.safeParse({ ...style, font }).success).toBe(true);
    }
    expect(invoiceStyleSchema.safeParse({ ...style, headerLayout: "centred" }).success).toBe(true);
  });

  it("rejects unknown options, an empty logo path and a long footer", () => {
    expect(invoiceStyleSchema.safeParse({ ...style, accentColor: "terracotta" }).success).toBe(
      false,
    );
    expect(invoiceStyleSchema.safeParse({ ...style, logoPath: "" }).success).toBe(false);
    expect(invoiceStyleSchema.safeParse({ ...style, footerNote: "x".repeat(501) }).success).toBe(
      false,
    );
  });
});

describe("formatInvoiceNumber", () => {
  it("adds the prefix and pads to four digits", () => {
    expect(formatInvoiceNumber("INV-", 7)).toBe("INV-0007");
    expect(formatInvoiceNumber("", 42)).toBe("0042");
    expect(formatInvoiceNumber("  KP ", 1)).toBe("KP0001");
  });

  it("doesn't cut off numbers longer than four digits", () => {
    expect(formatInvoiceNumber("INV-", 12_345)).toBe("INV-12345");
  });

  it("rejects 0, negative and fractional numbers", () => {
    expect(() => formatInvoiceNumber("INV-", 0)).toThrow(RangeError);
    expect(() => formatInvoiceNumber("INV-", -3)).toThrow(RangeError);
    expect(() => formatInvoiceNumber("INV-", 1.5)).toThrow(RangeError);
  });
});

describe("nextInvoiceNumber", () => {
  it("starts at 1", () => {
    expect(nextInvoiceNumber([])).toBe(1);
  });

  it("is one more than the highest, keeping gaps", () => {
    expect(nextInvoiceNumber([{ number: 1 }, { number: 4 }, { number: 2 }])).toBe(5);
  });
});
