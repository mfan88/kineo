import { describe, expect, it } from "vitest";
import {
  InvoiceRuleError,
  canChangeStatus,
  invoiceLocks,
  invoiceSchema,
  markCancelled,
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
  cancelledAt: null,
  cancelledVisitDates: null,
  createdAt: created,
  updatedAt: created,
};
const sent: Invoice = { ...draft, status: "sent", sentAt, updatedAt: sentAt };
const paid: Invoice = { ...sent, status: "paid", paidAt, updatedAt: paidAt };
const cancelled: Invoice = {
  ...sent,
  status: "cancelled",
  cancelledAt: later,
  cancelledVisitDates: ["2026-11-01", "2026-11-04"],
  updatedAt: later,
};

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

  it("locks line items, visits and tax on a cancelled invoice, and its released visits' notes stay editable", () => {
    expect(invoiceLocks("cancelled")).toEqual({
      lineItems: true,
      visits: true,
      tax: true,
      notes: false,
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

  it("allows sent → cancelled, and nothing else into or out of cancelled", () => {
    expect(canChangeStatus("sent", "cancelled")).toBe(true);
    expect(canChangeStatus("draft", "cancelled")).toBe(false);
    expect(canChangeStatus("paid", "cancelled")).toBe(false);
    expect(canChangeStatus("cancelled", "cancelled")).toBe(false);
    for (const to of ["draft", "sent", "paid"] as const) {
      expect(canChangeStatus("cancelled", to)).toBe(false);
    }
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

  it("can't send an invoice that is already sent, paid or cancelled", () => {
    expect(() => markSent(sent, 1, later)).toThrow(InvoiceRuleError);
    expect(() => markSent(paid, 1, later)).toThrow(InvoiceRuleError);
    expect(() => markSent(cancelled, 1, later)).toThrow(InvoiceRuleError);
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

  it("can't mark a cancelled invoice paid", () => {
    expect(() => markPaid(cancelled, later)).toThrow(
      new InvoiceRuleError("A cancelled invoice can't be marked paid."),
    );
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
    expect(() => undoPaid(cancelled, later)).toThrow(InvoiceRuleError);
  });
});

describe("markCancelled", () => {
  it("cancels a sent invoice, keeping its number and sent date and a sorted copy of the visit dates", () => {
    const result = markCancelled(sent, ["2026-11-04", "2026-11-01"], later);
    expect(result).toEqual(cancelled);
    expect(result.number).toBe(sent.number);
    expect(result.sentAt).toBe(sentAt);
    expect(invoiceSchema.safeParse(result).success).toBe(true);
  });

  it("can cancel a sent invoice with no visits", () => {
    const result = markCancelled(sent, [], later);
    expect(result.cancelledVisitDates).toEqual([]);
    expect(invoiceSchema.safeParse(result).success).toBe(true);
  });

  it("doesn't change the invoice or the dates passed in", () => {
    const dates = ["2026-11-04", "2026-11-01"];
    markCancelled(sent, dates, later);
    expect(sent.status).toBe("sent");
    expect(sent.cancelledAt).toBeNull();
    expect(dates).toEqual(["2026-11-04", "2026-11-01"]);
  });

  it("can't cancel a draft", () => {
    expect(() => markCancelled(draft, [], later)).toThrow(
      new InvoiceRuleError("Only a sent invoice can be cancelled."),
    );
  });

  it("can't cancel a paid invoice until the payment is undone", () => {
    expect(() => markCancelled(paid, [], later)).toThrow(
      new InvoiceRuleError("Undo the payment before cancelling this invoice."),
    );
    expect(markCancelled(undoPaid(paid, later), [], later).status).toBe("cancelled");
  });

  it("can't cancel twice", () => {
    expect(() => markCancelled(cancelled, [], later)).toThrow(
      new InvoiceRuleError("This invoice is already cancelled."),
    );
  });

  it("is refused by the schema without its date or visit dates", () => {
    expect(invoiceSchema.safeParse({ ...cancelled, cancelledAt: null }).success).toBe(false);
    expect(invoiceSchema.safeParse({ ...cancelled, cancelledVisitDates: null }).success).toBe(
      false,
    );
    expect(invoiceSchema.safeParse({ ...sent, cancelledAt: later }).success).toBe(false);
  });
});
