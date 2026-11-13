import { describe, expect, it } from "vitest";
import { countLabel, todoCounts } from "./todo";

const visit = (id: string, patientId: string, invoiceId: string | null = null) => ({
  id,
  patientId,
  visitDate: "2026-11-01",
  invoiceId,
});
const invoice = (id: string, status: "draft" | "sent" | "paid" | "cancelled") => ({
  id,
  status,
  createdAt: "2026-11-02T10:00:00Z",
  sentAt: status === "draft" ? null : "2026-11-03T10:00:00Z",
});

describe("todoCounts", () => {
  it("is zero and zero with nothing to do", () => {
    expect(todoCounts([], [])).toEqual({ readyVisits: 0, waitingInvoices: 0 });
  });

  it("counts visits not on an invoice across patients", () => {
    const visits = [
      visit("v1", "p1"),
      visit("v2", "p1"),
      visit("v3", "p2"),
      visit("v4", "p2", "i1"),
    ];
    expect(todoCounts(visits, [invoice("i1", "draft")])).toEqual({
      readyVisits: 3,
      waitingInvoices: 0,
    });
  });

  it("counts only sent invoices as waiting, not drafts or paid ones", () => {
    const invoices = [
      invoice("i1", "draft"),
      invoice("i2", "sent"),
      invoice("i3", "paid"),
      invoice("i4", "sent"),
    ];
    expect(todoCounts([], invoices).waitingInvoices).toBe(2);
  });

  it("doesn't count a cancelled invoice as waiting, and counts its released visits as ready again", () => {
    const cancelled = [invoice("i1", "cancelled"), invoice("i2", "sent")];
    // i1's visits were released (invoiceId back to null); i2's visit is still on it.
    const visits = [visit("v1", "p1"), visit("v2", "p1"), visit("v3", "p2", "i2")];
    expect(todoCounts(visits, cancelled)).toEqual({ readyVisits: 2, waitingInvoices: 1 });
  });
});

describe("countLabel", () => {
  it("uses the singular for exactly one", () => {
    expect(countLabel(1, "visit")).toBe("1 visit");
    expect(countLabel(0, "visit")).toBe("0 visits");
    expect(countLabel(2, "invoice")).toBe("2 invoices");
  });
});
