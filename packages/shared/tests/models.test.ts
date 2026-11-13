import { describe, expect, it } from "vitest";
import {
  billToDetailSchema,
  DEFAULT_INVOICE_NUMBER_FORMAT,
  invoiceNumberLabel,
  fundingTypeSchema,
  invoiceBillToSchema,
  patientFundingSchema,
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
    invoiceNumberFormat: { ...DEFAULT_INVOICE_NUMBER_FORMAT, prefix: "INV" },
    invoiceNumberStart: 1,
    updatedAt: now,
  };
  const withFormat = (changes: object) => ({
    ...settings,
    invoiceNumberFormat: { ...settings.invoiceNumberFormat, ...changes },
  });

  it("accepts settings with or without a prefix, and a starting number", () => {
    expect(practiceSettingsSchema.safeParse(settings).success).toBe(true);
    expect(practiceSettingsSchema.safeParse(withFormat({ prefix: "" })).success).toBe(true);
    expect(
      practiceSettingsSchema.safeParse({ ...settings, invoiceNumberStart: 1250 }).success,
    ).toBe(true);
  });

  it("rejects a long prefix, a bad starting number and an invalid rate", () => {
    expect(practiceSettingsSchema.safeParse(withFormat({ prefix: "X".repeat(21) })).success).toBe(
      false,
    );
    expect(practiceSettingsSchema.safeParse({ ...settings, invoiceNumberStart: 0 }).success).toBe(
      false,
    );
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

describe("invoiceNumberLabel", () => {
  const format = { ...DEFAULT_INVOICE_NUMBER_FORMAT, prefix: "INV" };
  const draft = { number: 7, sentAt: null, createdAt: "2026-11-13T18:00:00.000Z" };

  it("builds a draft's number from the current format", () => {
    expect(invoiceNumberLabel(draft, format)).toBe("INV-0007");
    expect(invoiceNumberLabel({ ...draft, displayNumber: null }, { ...format, digits: 3 })).toBe(
      "INV-007",
    );
  });

  it("shows a sent invoice's saved number, whatever the format says now", () => {
    const sent = { ...draft, sentAt: draft.createdAt, displayNumber: "OLD-0007" };
    expect(invoiceNumberLabel(sent, { ...format, prefix: "NEW", digits: 6 })).toBe("OLD-0007");
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

const detailIds = {
  claim: "5e6f7a8b-9c0d-4e1f-8a3b-4c5d6e7f8091",
  billing: "6f7a8b9c-0d1e-4f2a-9b4c-5d6e7f809102",
};

const fundingType = {
  id: "7a8b9c0d-1e2f-4a3b-8c5d-6e7f80910213",
  ownerId: owner,
  name: "Example funder",
  recipientName: "Example Ministry",
  recipientAddress: "1 Example Way, Victoria BC",
  details: [
    { id: detailIds.claim, label: "Claim number", kind: "text", showOnInvoice: true },
    { id: detailIds.billing, label: "Start date", kind: "date", showOnInvoice: false },
  ],
  createdAt: now,
  updatedAt: now,
};

const patientFunding = {
  id: "8b9c0d1e-2f3a-4b4c-9d6e-7f8091021324",
  ownerId: owner,
  patientId: ids.patient,
  fundingTypeId: fundingType.id,
  detailValues: { [detailIds.claim]: "C-1234" },
  periodStart: "2026-04-01",
  periodEnd: "2027-03-31",
  endedOn: null,
  createdAt: now,
  updatedAt: now,
};

const makeDetails = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: crypto.randomUUID(),
    label: `Detail ${i}`,
    kind: "text" as const,
    showOnInvoice: false,
  }));

describe("fundingTypeSchema", () => {
  it("accepts a type, including one with no recipient yet and no details", () => {
    expect(fundingTypeSchema.safeParse(fundingType).success).toBe(true);
    expect(
      fundingTypeSchema.safeParse({
        ...fundingType,
        recipientName: "",
        recipientAddress: "",
        details: [],
      }).success,
    ).toBe(true);
  });

  it("refuses two details with the same name, ignoring case and outer spaces", () => {
    const result = fundingTypeSchema.safeParse({
      ...fundingType,
      details: [
        { id: detailIds.claim, label: "Claim number", kind: "text", showOnInvoice: true },
        { id: detailIds.billing, label: " claim number ", kind: "text", showOnInvoice: true },
      ],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      path: ["details", 1, "label"],
      message: "Two details can't have the same name.",
    });
  });

  it("refuses two details with the same id", () => {
    const result = fundingTypeSchema.safeParse({
      ...fundingType,
      details: [
        { id: detailIds.claim, label: "One", kind: "text", showOnInvoice: true },
        { id: detailIds.claim, label: "Two", kind: "text", showOnInvoice: true },
      ],
    });
    expect(result.error?.issues[0]?.message).toBe("Each detail needs its own id.");
  });

  it("allows 20 details and refuses 21", () => {
    expect(fundingTypeSchema.safeParse({ ...fundingType, details: makeDetails(20) }).success).toBe(
      true,
    );
    expect(fundingTypeSchema.safeParse({ ...fundingType, details: makeDetails(21) }).success).toBe(
      false,
    );
  });

  it("refuses an unknown detail kind and an empty name", () => {
    const [first] = fundingType.details;
    expect(
      fundingTypeSchema.safeParse({ ...fundingType, details: [{ ...first, kind: "number" }] })
        .success,
    ).toBe(false);
    expect(fundingTypeSchema.safeParse({ ...fundingType, name: "  " }).success).toBe(false);
  });
});

describe("patientFundingSchema", () => {
  it("accepts a funding, with or without a period or a type", () => {
    expect(patientFundingSchema.safeParse(patientFunding).success).toBe(true);
    expect(
      patientFundingSchema.safeParse({
        ...patientFunding,
        fundingTypeId: null,
        periodStart: null,
        periodEnd: null,
        detailValues: {},
      }).success,
    ).toBe(true);
  });

  it("refuses a period that ends before it starts, and allows one day", () => {
    const result = patientFundingSchema.safeParse({
      ...patientFunding,
      periodStart: "2026-04-02",
      periodEnd: "2026-04-01",
    });
    expect(result.error?.issues[0]).toMatchObject({
      path: ["periodEnd"],
      message: "The period can't end before it starts.",
    });
    expect(
      patientFundingSchema.safeParse({
        ...patientFunding,
        periodStart: "2026-04-01",
        periodEnd: "2026-04-01",
      }).success,
    ).toBe(true);
  });

  it("refuses detail values keyed by something that isn't an id", () => {
    expect(
      patientFundingSchema.safeParse({ ...patientFunding, detailValues: { claim: "C-1" } }).success,
    ).toBe(false);
  });
});

describe("invoice Bill to", () => {
  const funded = {
    kind: "funding",
    patientFundingId: patientFunding.id,
    fundingName: "Example funder",
    name: "Example Ministry",
    address: "1 Example Way, Victoria BC",
    details: [{ id: detailIds.claim, label: "Claim number", value: "C-1234" }],
  };

  it("accepts both kinds", () => {
    expect(
      invoiceBillToSchema.safeParse({ kind: "patient", name: "Test Patient", address: "" }).success,
    ).toBe(true);
    expect(invoiceBillToSchema.safeParse(funded).success).toBe(true);
    expect(invoiceBillToSchema.safeParse({ ...funded, patientFundingId: null }).success).toBe(true);
  });

  it("refuses a funded Bill to without a funding name", () => {
    expect(invoiceBillToSchema.safeParse({ ...funded, fundingName: "" }).success).toBe(false);
  });

  it("accepts an invoice with or without billTo", () => {
    expect(invoiceSchema.safeParse(draftInvoice).success).toBe(true);
    expect(invoiceSchema.safeParse({ ...draftInvoice, billTo: funded }).success).toBe(true);
  });

  it("allows a blank detail value, which only blocks sending", () => {
    expect(
      billToDetailSchema.safeParse({ id: detailIds.claim, label: "Claim", value: "" }).success,
    ).toBe(true);
  });
});

describe("line service date and billing address", () => {
  it("accepts a dated line, an undated one and null; refuses a loose date", () => {
    expect(lineItemSchema.safeParse({ ...lineItem, serviceDate: "2026-11-04" }).success).toBe(true);
    expect(lineItemSchema.safeParse({ ...lineItem, serviceDate: null }).success).toBe(true);
    expect(lineItemSchema.safeParse(lineItem).success).toBe(true);
    expect(lineItemSchema.safeParse({ ...lineItem, serviceDate: "4 Nov" }).success).toBe(false);
  });

  it("accepts a patient with a billing address and refuses one over 500 characters", () => {
    expect(patientSchema.safeParse({ ...patient, billingAddress: "1 Example St" }).success).toBe(
      true,
    );
    expect(patientSchema.safeParse({ ...patient, billingAddress: "x".repeat(501) }).success).toBe(
      false,
    );
  });
});
