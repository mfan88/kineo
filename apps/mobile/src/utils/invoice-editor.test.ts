import { describe, expect, it } from "vitest";
import { editorLines, editorVisits, formatPaidDate, formatRate } from "./invoice-editor";

describe("formatRate", () => {
  it("shows basis points as a percentage", () => {
    expect(formatRate(500)).toBe("5%");
    expect(formatRate(1250)).toBe("12.5%");
    expect(formatRate(0)).toBe("0%");
    expect(formatRate(10000)).toBe("100%");
    expect(formatRate(1)).toBe("0.01%");
  });
});

describe("formatPaidDate", () => {
  it("shows the local day", () => {
    expect(formatPaidDate(new Date(2026, 10, 12, 9).toISOString())).toBe("November 12, 2026");
    expect(formatPaidDate(new Date(2026, 0, 1, 23, 59).toISOString())).toBe("January 1, 2026");
  });
});

function visit(id: string, patientId: string, invoiceId: string | null, visitDate: string) {
  return { id, patientId, invoiceId, visitDate, createdAt: `${visitDate}T17:00:00.000Z` };
}

describe("editorVisits", () => {
  const INVOICE = { id: "inv", patientId: "a" };
  const VISITS = [
    visit("on-old", "a", "inv", "2026-10-01"),
    visit("free", "a", null, "2026-11-04"),
    visit("elsewhere", "a", "other-invoice", "2026-10-20"),
    visit("on-new", "a", "inv", "2026-10-28"),
    visit("other-patient", "b", null, "2026-11-10"),
    visit("other-patient-same-invoice-id", "b", "inv", "2026-11-11"),
  ];

  it("lists a draft's visits and the patient's uninvoiced ones, newest first", () => {
    expect(editorVisits(VISITS, INVOICE, false).map((v) => v.id)).toEqual([
      "free",
      "on-new",
      "on-old",
    ]);
  });

  it("lists only the visits on it once visits are locked", () => {
    expect(editorVisits(VISITS, INVOICE, true).map((v) => v.id)).toEqual(["on-new", "on-old"]);
  });

  it("never lists another patient's visits or ones on another invoice", () => {
    const ids = editorVisits(VISITS, INVOICE, false).map((v) => v.id);
    expect(ids).not.toContain("other-patient");
    expect(ids).not.toContain("other-patient-same-invoice-id");
    expect(ids).not.toContain("elsewhere");
  });

  it("is empty when there's nothing to list", () => {
    expect(editorVisits([], INVOICE, false)).toEqual([]);
    expect(editorVisits(VISITS, { id: "none", patientId: "nobody" }, true)).toEqual([]);
  });
});

describe("editorLines", () => {
  it("keeps the invoice's lines, in the order they were added", () => {
    const lines = [
      { id: "c", invoiceId: "inv", position: 2 },
      { id: "x", invoiceId: "other", position: 0 },
      { id: "a", invoiceId: "inv", position: 0 },
      { id: "b", invoiceId: "inv", position: 1 },
    ];
    expect(editorLines(lines, "inv").map((line) => line.id)).toEqual(["a", "b", "c"]);
    expect(editorLines(lines, "none")).toEqual([]);
    expect(lines.map((line) => line.id)).toEqual(["c", "x", "a", "b"]);
  });
});
