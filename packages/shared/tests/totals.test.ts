import { describe, expect, it } from "vitest";
import { invoiceTotals, lineFromPriceItem, lineTotalCents } from "../src/index";

const taxOff = { taxEnabled: false, taxRateBasisPoints: 0 };
const gst = { taxEnabled: true, taxRateBasisPoints: 500 };

// Made-up price list item.
const followUp = {
  id: "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e",
  name: "Follow-up treatment",
  unitPriceCents: 9_500,
};

describe("lineFromPriceItem", () => {
  it("copies the name and price with quantity 1 by default", () => {
    expect(lineFromPriceItem(followUp)).toEqual({
      priceItemId: followUp.id,
      name: "Follow-up treatment",
      unitPriceCents: 9_500,
      quantity: 1,
    });
  });

  it("uses the given quantity", () => {
    expect(lineFromPriceItem(followUp, 3).quantity).toBe(3);
  });

  it("keeps the copied price if the price list item changes later", () => {
    const item = { ...followUp };
    const line = lineFromPriceItem(item);
    item.unitPriceCents = 12_000;
    expect(line.unitPriceCents).toBe(9_500);
  });

  it("rejects a quantity below 1 and a fractional price", () => {
    expect(() => lineFromPriceItem(followUp, 0)).toThrow(RangeError);
    expect(() => lineFromPriceItem({ ...followUp, unitPriceCents: 95.5 })).toThrow(RangeError);
  });
});

describe("lineTotalCents", () => {
  it("multiplies price by quantity", () => {
    expect(lineTotalCents({ unitPriceCents: 9_500, quantity: 2 })).toBe(19_000);
    expect(lineTotalCents({ unitPriceCents: 0, quantity: 5 })).toBe(0);
  });

  it("rejects a quantity of 0", () => {
    expect(() => lineTotalCents({ unitPriceCents: 9_500, quantity: 0 })).toThrow(RangeError);
  });
});

describe("invoiceTotals", () => {
  it("is all zero for no line items", () => {
    expect(invoiceTotals([], taxOff)).toEqual({ subtotalCents: 0, taxCents: 0, totalCents: 0 });
    expect(invoiceTotals([], gst)).toEqual({ subtotalCents: 0, taxCents: 0, totalCents: 0 });
  });

  it("adds line totals with tax off", () => {
    const lines = [
      { unitPriceCents: 12_000, quantity: 1 },
      { unitPriceCents: 9_500, quantity: 2 },
    ];
    expect(invoiceTotals(lines, taxOff)).toEqual({
      subtotalCents: 31_000,
      taxCents: 0,
      totalCents: 31_000,
    });
  });

  it("ignores the rate when tax is off", () => {
    expect(
      invoiceTotals([{ unitPriceCents: 10_000, quantity: 1 }], {
        taxEnabled: false,
        taxRateBasisPoints: 500,
      }).taxCents,
    ).toBe(0);
  });

  it("adds tax on the subtotal when tax is on", () => {
    expect(invoiceTotals([{ unitPriceCents: 10_000, quantity: 1 }], gst)).toEqual({
      subtotalCents: 10_000,
      taxCents: 500,
      totalCents: 10_500,
    });
  });

  it("is 0 tax when tax is on at a 0% rate", () => {
    expect(
      invoiceTotals([{ unitPriceCents: 10_000, quantity: 1 }], {
        taxEnabled: true,
        taxRateBasisPoints: 0,
      }).taxCents,
    ).toBe(0);
  });

  it("taxes the subtotal once rather than each line", () => {
    // Each line alone: 5% of 10¢ = 0.5¢ → 1¢, so per-line would give 3¢.
    // On the 30¢ subtotal: 1.5¢ → 2¢.
    const lines = [
      { unitPriceCents: 10, quantity: 1 },
      { unitPriceCents: 10, quantity: 1 },
      { unitPriceCents: 10, quantity: 1 },
    ];
    expect(invoiceTotals(lines, gst)).toEqual({ subtotalCents: 30, taxCents: 2, totalCents: 32 });
  });

  it("rounds half a cent of tax up", () => {
    expect(invoiceTotals([{ unitPriceCents: 250, quantity: 1 }], gst).taxCents).toBe(13);
    expect(invoiceTotals([{ unitPriceCents: 249, quantity: 1 }], gst).taxCents).toBe(12);
  });

  it("rejects an invalid rate when tax is on", () => {
    expect(() =>
      invoiceTotals([{ unitPriceCents: 100, quantity: 1 }], {
        taxEnabled: true,
        taxRateBasisPoints: 10_001,
      }),
    ).toThrow(RangeError);
  });

  it("rejects invalid line items", () => {
    expect(() => invoiceTotals([{ unitPriceCents: 100, quantity: 0 }], taxOff)).toThrow(RangeError);
    expect(() => invoiceTotals([{ unitPriceCents: 10.5, quantity: 1 }], taxOff)).toThrow(
      RangeError,
    );
  });
});
