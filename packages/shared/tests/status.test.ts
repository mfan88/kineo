import { describe, expect, it } from "vitest";
import {
  InvoiceRuleError,
  canChangeStatus,
  invoiceLocks,
  invoiceSchema,
  markPaid,
  markSent,
  undoPaid,
  type Invoice,
} from "../src/index";

const created = "2026-11-01T09:00:00Z";
const sentAt = "2026-11-02T10:00:00Z";
const paidAt = "2026-11-09T15:30:00Z";
const later = "2026-11-10T08:00:00Z";

// Made-up test data only.
const draft: Invoice = {
  id: "3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f",
  ownerId: "user_test_owner",
  patientId: "8f3b0b8e-2c1d-4a8e-9f1a-1b2c3d4e5f60",
  number: 1,
  status: "draft",
  taxEnabled: false,
  taxRateBasisPoints: 0,
  sentAt: null,
  paidAt: null,
  createdAt: created,
  updatedAt: created,
};
const sent: Invoice = { ...draft, status: "sent", sentAt, updatedAt: sentAt };
const paid: Invoice = { ...sent, status: "paid", paidAt, updatedAt: paidAt };

describe("invoiceLocks", () => {
  it("locks nothing on a draft", () => {
    expect(invoiceLocks("draft")).toEqual({
      lineItems: false,
      visits: false,
      tax: false,
      notes: false,
    });
  });

  it("locks line items, visits and tax once sent, but not notes", () => {
    expect(invoiceLocks("sent")).toEqual({
      lineItems: true,
      visits: true,
      tax: true,
      notes: false,
    });
  });

  it("locks everything, including notes, once paid", () => {
    expect(invoiceLocks("paid")).toEqual({
      lineItems: true,
      visits: true,
      tax: true,
      notes: true,
    });
  });

  it("returns a copy that can't change the rules", () => {
    const locks = invoiceLocks("draft");
    locks.lineItems = true;
    expect(invoiceLocks("draft").lineItems).toBe(false);
  });
});

describe("canChangeStatus", () => {
  it("allows draft → sent → paid and paid → sent", () => {
    expect(canChangeStatus("draft", "sent")).toBe(true);
    expect(canChangeStatus("sent", "paid")).toBe(true);
    expect(canChangeStatus("paid", "sent")).toBe(true);
  });

  it("doesn't allow skipping, going back to draft or staying put", () => {
    expect(canChangeStatus("draft", "paid")).toBe(false);
    expect(canChangeStatus("sent", "draft")).toBe(false);
    expect(canChangeStatus("paid", "draft")).toBe(false);
    expect(canChangeStatus("draft", "draft")).toBe(false);
    expect(canChangeStatus("sent", "sent")).toBe(false);
    expect(canChangeStatus("paid", "paid")).toBe(false);
  });
});

describe("markSent", () => {
  it("sends a draft with line items and records the sent date", () => {
    const result = markSent(draft, 2, sentAt);
    expect(result).toEqual({ ...draft, status: "sent", sentAt, updatedAt: sentAt });
    expect(invoiceSchema.safeParse(result).success).toBe(true);
  });

  it("doesn't change the invoice passed in", () => {
    markSent(draft, 1, sentAt);
    expect(draft.status).toBe("draft");
    expect(draft.sentAt).toBeNull();
  });

  it("needs at least one line item", () => {
    expect(() => markSent(draft, 0, sentAt)).toThrow(
      new InvoiceRuleError("Add at least one line item before sending."),
    );
    expect(() => markSent(draft, -1, sentAt)).toThrow(InvoiceRuleError);
  });

  it("can't send an invoice that is already sent or paid", () => {
    expect(() => markSent(sent, 1, later)).toThrow(InvoiceRuleError);
    expect(() => markSent(paid, 1, later)).toThrow(InvoiceRuleError);
  });
});

describe("markPaid", () => {
  it("records payment on a sent invoice and keeps the sent date", () => {
    const result = markPaid(sent, paidAt);
    expect(result).toEqual({ ...sent, status: "paid", paidAt, updatedAt: paidAt });
    expect(result.sentAt).toBe(sentAt);
    expect(invoiceSchema.safeParse(result).success).toBe(true);
  });

  it("can't mark a draft paid", () => {
    expect(() => markPaid(draft, paidAt)).toThrow(
      new InvoiceRuleError("Send this invoice before recording payment."),
    );
  });

  it("can't mark a paid invoice paid again", () => {
    expect(() => markPaid(paid, later)).toThrow(InvoiceRuleError);
  });
});

describe("undoPaid", () => {
  it("moves a paid invoice back to sent and clears the paid date", () => {
    const result = undoPaid(paid, later);
    expect(result).toEqual({ ...sent, updatedAt: later });
    expect(result.sentAt).toBe(sentAt);
    expect(invoiceSchema.safeParse(result).success).toBe(true);
  });

  it("round-trips: mark paid, undo, mark paid again", () => {
    const again = markPaid(undoPaid(markPaid(sent, paidAt), later), later);
    expect(again.status).toBe("paid");
    expect(again.paidAt).toBe(later);
  });

  it("only works on a paid invoice", () => {
    expect(() => undoPaid(draft, later)).toThrow(InvoiceRuleError);
    expect(() => undoPaid(sent, later)).toThrow(InvoiceRuleError);
  });
});
