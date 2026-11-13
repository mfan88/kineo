import { describe, expect, it } from "vitest";
import {
  buildInvoiceNumber,
  DEFAULT_INVOICE_NUMBER_FORMAT,
  highestInvoiceNumber,
  invoiceIssuedOn,
  invoiceNumberDigitsExample,
  invoiceNumberPartExample,
  invoiceNumberFormatSchema,
  invoiceNumberStartProblem,
  moveInvoiceNumberPart,
  nextInvoiceNumber,
  type InvoiceNumberFormat,
} from "./number";

const format = (changes: Partial<InvoiceNumberFormat>): InvoiceNumberFormat => ({
  ...DEFAULT_INVOICE_NUMBER_FORMAT,
  prefix: "INV",
  ...changes,
});

/** Whether the default format with these changes is a valid format. */
const parses = (changes: Record<string, unknown>): boolean =>
  invoiceNumberFormatSchema.safeParse({ ...DEFAULT_INVOICE_NUMBER_FORMAT, ...changes }).success;

describe("buildInvoiceNumber", () => {
  it("joins the parts that are on, in order, with the separator", () => {
    expect(buildInvoiceNumber(format({}), 42, "2026-11-13")).toBe("INV-0042");
    expect(
      buildInvoiceNumber(
        format({ shown: { prefix: true, year: true, month: false } }),
        42,
        "2026-11-13",
      ),
    ).toBe("INV-2026-0042");
    expect(
      buildInvoiceNumber(
        format({
          order: ["year", "month", "prefix", "number"],
          shown: { prefix: true, year: true, month: true },
          separator: "/",
        }),
        42,
        "2026-03-01",
      ),
    ).toBe("2026/03/INV/0042");
  });

  it("pads the number to the digits chosen, and shows a longer number in full", () => {
    expect(buildInvoiceNumber(format({ digits: 3 }), 7, "2026-11-13")).toBe("INV-007");
    expect(buildInvoiceNumber(format({ digits: 6 }), 7, "2026-11-13")).toBe("INV-000007");
    expect(buildInvoiceNumber(format({ digits: 1 }), 7, "2026-11-13")).toBe("INV-7");
    expect(buildInvoiceNumber(format({ digits: 3 }), 12345, "2026-11-13")).toBe("INV-12345");
  });

  it("leaves out an empty or hidden prefix with its separator", () => {
    expect(buildInvoiceNumber(DEFAULT_INVOICE_NUMBER_FORMAT, 1, "2026-11-13")).toBe("0001");
    expect(
      buildInvoiceNumber(
        format({ shown: { prefix: false, year: true, month: false } }),
        1,
        "2026-11-13",
      ),
    ).toBe("2026-0001");
    expect(buildInvoiceNumber(format({ prefix: "  " }), 1, "2026-11-13")).toBe("0001");
  });

  it("can use no separator", () => {
    expect(
      buildInvoiceNumber(
        format({ separator: "", shown: { prefix: true, year: true, month: true } }),
        5,
        "2026-11-13",
      ),
    ).toBe("INV2026110005");
  });

  it("refuses a number below 1", () => {
    expect(() => buildInvoiceNumber(format({}), 0, "2026-11-13")).toThrow(RangeError);
  });
});

describe("invoiceNumberFormatSchema", () => {
  it("accepts the default and a rearranged format", () => {
    expect(invoiceNumberFormatSchema.safeParse(DEFAULT_INVOICE_NUMBER_FORMAT).success).toBe(true);
    expect(
      invoiceNumberFormatSchema.safeParse(format({ order: ["number", "month", "year", "prefix"] }))
        .success,
    ).toBe(true);
  });

  it("needs every part once, digits from 1 to 6, a known separator and a short prefix", () => {
    expect(parses({ order: ["prefix", "year", "number"] })).toBe(false);
    expect(parses({ order: ["prefix", "year", "year", "number"] })).toBe(false);
    expect(parses({ digits: 0 })).toBe(false);
    expect(parses({ digits: 7 })).toBe(false);
    expect(parses({ separator: "#" })).toBe(false);
    expect(parses({ prefix: "X".repeat(21) })).toBe(false);
  });
});

describe("next invoice number", () => {
  const invoices = [{ number: 3 }, { number: 9 }, { number: 4 }];

  it("is one more than the highest, keeping gaps", () => {
    expect(highestInvoiceNumber([])).toBe(0);
    expect(highestInvoiceNumber(invoices)).toBe(9);
    expect(nextInvoiceNumber([])).toBe(1);
    expect(nextInvoiceNumber(invoices)).toBe(10);
  });

  it("carries on from a starting number when that's higher", () => {
    expect(nextInvoiceNumber([], 1250)).toBe(1250);
    expect(nextInvoiceNumber(invoices, 1250)).toBe(1250);
    expect(nextInvoiceNumber(invoices, 5)).toBe(10);
  });
});

describe("invoiceNumberStartProblem", () => {
  it("accepts a whole number from the next one due", () => {
    expect(invoiceNumberStartProblem(10, 10)).toBeNull();
    expect(invoiceNumberStartProblem(1250, 10)).toBeNull();
    expect(invoiceNumberStartProblem(1, 1)).toBeNull();
  });

  it("refuses numbers already used, and ones that aren't whole or are too long", () => {
    expect(invoiceNumberStartProblem(9, 10)).toBe(
      "Start at 10 or higher. Lower numbers are already used.",
    );
    expect(invoiceNumberStartProblem(0, 1)).toBe("Enter a whole number of at least 1.");
    expect(invoiceNumberStartProblem(2.5, 1)).toBe("Enter a whole number of at least 1.");
    expect(invoiceNumberStartProblem(100_000_000, 1)).toBe(
      "Enter a number with at most eight digits.",
    );
  });
});

describe("moveInvoiceNumberPart", () => {
  const order = DEFAULT_INVOICE_NUMBER_FORMAT.order;

  it("swaps a part with its neighbour", () => {
    expect(moveInvoiceNumberPart(order, "year", -1)).toEqual(["year", "prefix", "month", "number"]);
    expect(moveInvoiceNumberPart(order, "year", 1)).toEqual(["prefix", "month", "year", "number"]);
  });

  it("changes nothing past either end", () => {
    expect(moveInvoiceNumberPart(order, "prefix", -1)).toEqual(order);
    expect(moveInvoiceNumberPart(order, "number", 1)).toEqual(order);
  });
});

describe("invoiceIssuedOn", () => {
  it("is the sent day, or for a draft the day it was made, in local time", () => {
    const sent = new Date(2026, 0, 2, 9, 30).toISOString();
    const made = new Date(2025, 11, 31, 23, 50).toISOString();
    expect(invoiceIssuedOn({ sentAt: sent, createdAt: made })).toBe("2026-01-02");
    expect(invoiceIssuedOn({ sentAt: null, createdAt: made })).toBe("2025-12-31");
  });
});

describe("Settings examples", () => {
  it("shows each part as it will look", () => {
    const shown = format({ digits: 3 });
    expect(invoiceNumberPartExample("prefix", shown, 42, "2026-03-01")).toBe("INV");
    expect(invoiceNumberPartExample("prefix", { ...shown, prefix: " " }, 42, "2026-03-01")).toBe(
      "Add text below",
    );
    expect(invoiceNumberPartExample("year", shown, 42, "2026-03-01")).toBe("2026");
    expect(invoiceNumberPartExample("month", shown, 42, "2026-03-01")).toBe("03");
    expect(invoiceNumberPartExample("number", shown, 42, "2026-03-01")).toBe("042");
  });

  it("shows each number length", () => {
    expect([1, 2, 3, 4, 5, 6].map(invoiceNumberDigitsExample)).toEqual([
      "7",
      "07",
      "007",
      "0007",
      "00007",
      "000007",
    ]);
  });
});
