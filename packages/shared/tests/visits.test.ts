import { describe, expect, it } from "vitest";
import {
  InvoiceRuleError,
  addVisitToInvoice,
  removeVisitFromInvoice,
  uninvoicedVisits,
  visitSchema,
  type Invoice,
  type Visit,
} from "../src/index";

// Made-up test data only.
const owner = "user_test_owner";
const patientId = "8f3b0b8e-2c1d-4a8e-9f1a-1b2c3d4e5f60";
const otherPatientId = "9a4c1c9f-3d2e-4b9f-8a2b-2c3d4e5f6a71";
const created = "2026-11-01T09:00:00Z";
const now = "2026-11-11T10:00:00Z";

const draft: Invoice = {
  id: "3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f",
  ownerId: owner,
  patientId,
  number: 1,
  status: "draft",
  taxEnabled: false,
  taxRateBasisPoints: 0,
  sentAt: null,
  paidAt: null,
  cancelledAt: null,
  cancelledVisitDates: null,
  createdAt: created,
  updatedAt: created,
};
const otherDraft: Invoice = { ...draft, id: "5e6f7a8b-9c0d-4e1f-8a3b-4c5d6e7f8091", number: 2 };
const sent: Invoice = { ...draft, status: "sent", sentAt: now };
const paid: Invoice = { ...sent, status: "paid", paidAt: now };

const visit: Visit = {
  id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  ownerId: owner,
  patientId,
  visitDate: "2026-11-01",
  note: "Range of motion improving.",
  noteEditedAt: created,
  invoiceId: null,
  createdAt: created,
  updatedAt: created,
};
const onDraft: Visit = { ...visit, invoiceId: draft.id };

describe("uninvoicedVisits", () => {
  it("keeps only visits not on an invoice, in order", () => {
    const second = { ...visit, id: "6f7a8b9c-0d1e-4f2a-9b4c-5d6e7f8091a2" };
    expect(uninvoicedVisits([visit, onDraft, second])).toEqual([visit, second]);
  });

  it("returns an empty list for no visits or all invoiced", () => {
    expect(uninvoicedVisits([])).toEqual([]);
    expect(uninvoicedVisits([onDraft])).toEqual([]);
  });
});

describe("addVisitToInvoice", () => {
  it("puts an uninvoiced visit on a draft invoice", () => {
    const result = addVisitToInvoice(visit, draft, now);
    expect(result).toEqual({ ...visit, invoiceId: draft.id, updatedAt: now });
    expect(visitSchema.safeParse(result).success).toBe(true);
  });

  it("doesn't change the visit passed in or its note", () => {
    const result = addVisitToInvoice(visit, draft, now);
    expect(visit.invoiceId).toBeNull();
    expect(result.note).toBe(visit.note);
    expect(result.noteEditedAt).toBe(visit.noteEditedAt);
  });

  it("refuses a visit already on another invoice", () => {
    expect(() => addVisitToInvoice(onDraft, otherDraft, now)).toThrow(
      new InvoiceRuleError("This visit is already on another invoice."),
    );
  });

  it("refuses a visit already on this invoice", () => {
    expect(() => addVisitToInvoice(onDraft, draft, now)).toThrow(
      new InvoiceRuleError("This visit is already on this invoice."),
    );
  });

  it("refuses a visit for a different patient or practitioner", () => {
    expect(() => addVisitToInvoice({ ...visit, patientId: otherPatientId }, draft, now)).toThrow(
      InvoiceRuleError,
    );
    expect(() => addVisitToInvoice({ ...visit, ownerId: "user_someone_else" }, draft, now)).toThrow(
      InvoiceRuleError,
    );
  });

  it("is locked once the invoice is sent or paid", () => {
    expect(() => addVisitToInvoice(visit, sent, now)).toThrow(
      new InvoiceRuleError("Visits can't be added once an invoice is sent."),
    );
    expect(() => addVisitToInvoice(visit, paid, now)).toThrow(InvoiceRuleError);
  });
});

describe("removeVisitFromInvoice", () => {
  it("takes a visit off a draft invoice so it can be invoiced again", () => {
    const result = removeVisitFromInvoice(onDraft, draft, now);
    expect(result).toEqual({ ...onDraft, invoiceId: null, updatedAt: now });
    expect(uninvoicedVisits([result])).toEqual([result]);
    expect(addVisitToInvoice(result, otherDraft, now).invoiceId).toBe(otherDraft.id);
  });

  it("refuses a visit that isn't on this invoice", () => {
    expect(() => removeVisitFromInvoice(visit, draft, now)).toThrow(
      new InvoiceRuleError("This visit isn't on this invoice."),
    );
    expect(() => removeVisitFromInvoice(onDraft, otherDraft, now)).toThrow(InvoiceRuleError);
  });

  it("is locked once the invoice is sent or paid", () => {
    const onSent = { ...visit, invoiceId: sent.id };
    expect(() => removeVisitFromInvoice(onSent, sent, now)).toThrow(
      new InvoiceRuleError("Visits can't be removed once an invoice is sent."),
    );
    expect(() => removeVisitFromInvoice(onSent, paid, now)).toThrow(InvoiceRuleError);
  });
});
