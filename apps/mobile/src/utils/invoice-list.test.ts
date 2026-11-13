import { createDemoPractice } from "@kineo/data/demo";
import { describe, expect, it } from "vitest";
import { invoiceRows } from "./invoice-list";

describe("invoiceRows", () => {
  it("words every invoice of the demo practice, newest first", () => {
    const practice = createDemoPractice();
    const rows = invoiceRows(practice);
    expect(rows.length).toBe(practice.invoices.length);
    expect(rows.length).toBeGreaterThan(1);
    const created = rows.map((row) =>
      Date.parse(practice.invoices.find((invoice) => invoice.id === row.id)?.createdAt ?? ""),
    );
    expect(created).toEqual(created.toSorted((a, b) => b - a));
    for (const row of rows) {
      expect(row.number).toMatch(/^INV-\d{4}$/);
      expect(row.total).toMatch(/^\$\d[\d,]*\.\d{2}$/);
      expect(row.patientName).not.toBe("Unknown patient");
    }
    expect(rows.find((row) => row.number === "INV-0003")).toMatchObject({
      status: "draft",
      total: "$120.00",
    });
  });

  it("breaks a tie in creation time by number, highest first", () => {
    const practice = createDemoPractice();
    const [first] = practice.invoices;
    if (!first) throw new Error("The demo practice has no invoices.");
    const rows = invoiceRows({
      ...practice,
      invoices: [
        { ...first, id: "a", number: 7 },
        { ...first, id: "b", number: 9 },
        { ...first, id: "c", number: 8 },
      ],
    });
    expect(rows.map((row) => row.id)).toEqual(["b", "c", "a"]);
  });

  it("shows $0.00 for an invoice without line items", () => {
    const practice = createDemoPractice();
    const rows = invoiceRows({ ...practice, lineItems: [] });
    expect(rows.every((row) => row.total === "$0.00")).toBe(true);
  });

  it("uses the practice's number format, or a sent invoice's saved number", () => {
    const practice = createDemoPractice();
    const rows = invoiceRows({
      ...practice,
      invoices: practice.invoices.map((invoice, index) =>
        index === 0 ? { ...invoice, displayNumber: "OLD-7" } : { ...invoice, displayNumber: null },
      ),
      settings: {
        ...practice.settings,
        invoiceNumberFormat: { ...practice.settings.invoiceNumberFormat, prefix: "", digits: 3 },
      },
    });
    const saved = rows.find((row) => row.id === practice.invoices[0]?.id);
    expect(saved?.number).toBe("OLD-7");
    expect(rows.filter((row) => row !== saved).every((row) => /^\d{3}$/.test(row.number))).toBe(
      true,
    );
  });

  it("says so when the patient can't be found", () => {
    const practice = createDemoPractice();
    const rows = invoiceRows({ ...practice, patients: [] });
    expect(rows.every((row) => row.patientName === "Unknown patient")).toBe(true);
  });

  it("is empty when there are no invoices", () => {
    expect(invoiceRows({ ...createDemoPractice(), invoices: [] })).toEqual([]);
  });
});
