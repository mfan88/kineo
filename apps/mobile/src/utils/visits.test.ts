import { describe, expect, it } from "vitest";
import { formatVisitDate, patientVisits, visitStatus } from "./visits";

describe("formatVisitDate", () => {
  it("shows the calendar date as written, whatever the time zone", () => {
    expect(formatVisitDate("2026-11-12")).toBe("Thu, November 12, 2026");
    expect(formatVisitDate("2026-01-01")).toBe("Thu, January 1, 2026");
    expect(formatVisitDate("2024-02-29")).toBe("Thu, February 29, 2024");
  });
});

function visit(id: string, patientId: string, visitDate: string, createdAt: string) {
  return { id, patientId, visitDate, createdAt };
}

describe("patientVisits", () => {
  const VISITS = [
    visit("old", "a", "2026-10-01", "2026-10-01T17:00:00.000Z"),
    visit("other", "b", "2026-11-12", "2026-11-12T17:00:00.000Z"),
    visit("morning", "a", "2026-11-12", "2026-11-12T16:00:00.000Z"),
    visit("afternoon", "a", "2026-11-12", "2026-11-12T22:00:00.000Z"),
  ];

  it("keeps only that patient's visits, newest first", () => {
    expect(patientVisits(VISITS, "a").map((v) => v.id)).toEqual(["afternoon", "morning", "old"]);
  });

  it("is empty for a patient without visits, and leaves the list as it was", () => {
    expect(patientVisits(VISITS, "nobody")).toEqual([]);
    expect(patientVisits([], "a")).toEqual([]);
    expect(VISITS.map((v) => v.id)).toEqual(["old", "other", "morning", "afternoon"]);
  });
});

describe("visitStatus", () => {
  const INVOICES = [
    { id: "i-draft", status: "draft" },
    { id: "i-sent", status: "sent" },
    { id: "i-paid", status: "paid" },
  ] as const;

  it("is the status of the visit's invoice", () => {
    expect(visitStatus({ invoiceId: "i-draft" }, INVOICES)).toBe("draft");
    expect(visitStatus({ invoiceId: "i-sent" }, INVOICES)).toBe("sent");
    expect(visitStatus({ invoiceId: "i-paid" }, INVOICES)).toBe("paid");
  });

  it("is uninvoiced without an invoice, or when the invoice can't be found", () => {
    expect(visitStatus({ invoiceId: null }, INVOICES)).toBe("uninvoiced");
    expect(visitStatus({ invoiceId: "i-gone" }, INVOICES)).toBe("uninvoiced");
    expect(visitStatus({ invoiceId: "i-draft" }, [])).toBe("uninvoiced");
  });
});
