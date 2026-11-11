import { describe, expect, it } from "vitest";
import {
  addCents,
  applyTax,
  assertCents,
  assertTaxRate,
  formatCad,
  multiplyCents,
  taxCents,
} from "../src/money";

describe("assertCents", () => {
  it("accepts whole numbers, including zero and negatives", () => {
    expect(() => assertCents(0)).not.toThrow();
    expect(() => assertCents(12_345)).not.toThrow();
    expect(() => assertCents(-500)).not.toThrow();
  });

  it("rejects fractions, NaN, infinity and unsafe integers", () => {
    expect(() => assertCents(10.5)).toThrow(RangeError);
    expect(() => assertCents(Number.NaN)).toThrow(RangeError);
    expect(() => assertCents(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => assertCents(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
  });
});

describe("assertTaxRate", () => {
  it("accepts 0 to 10000 basis points", () => {
    expect(() => assertTaxRate(0)).not.toThrow();
    expect(() => assertTaxRate(500)).not.toThrow();
    expect(() => assertTaxRate(10_000)).not.toThrow();
  });

  it("rejects negative, over 100% and fractional rates", () => {
    expect(() => assertTaxRate(-1)).toThrow(RangeError);
    expect(() => assertTaxRate(10_001)).toThrow(RangeError);
    expect(() => assertTaxRate(12.5)).toThrow(RangeError);
  });
});

describe("addCents", () => {
  it("adds amounts", () => {
    expect(addCents(8_500, 1_250, 5)).toBe(9_755);
  });

  it("returns 0 for no amounts", () => {
    expect(addCents()).toBe(0);
  });

  it("handles zero and negative amounts", () => {
    expect(addCents(0, 0)).toBe(0);
    expect(addCents(1_000, -250)).toBe(750);
  });

  it("rejects fractional cents", () => {
    expect(() => addCents(100, 0.1)).toThrow(RangeError);
  });

  it("rejects a total beyond the safe integer range", () => {
    expect(() => addCents(Number.MAX_SAFE_INTEGER, 1)).toThrow(RangeError);
  });
});

describe("multiplyCents", () => {
  it("multiplies a price by a quantity", () => {
    expect(multiplyCents(9_500, 3)).toBe(28_500);
  });

  it("returns the price for quantity 1 and 0 for a free item", () => {
    expect(multiplyCents(9_500, 1)).toBe(9_500);
    expect(multiplyCents(0, 4)).toBe(0);
  });

  it("rejects quantities below 1 or not whole", () => {
    expect(() => multiplyCents(9_500, 0)).toThrow(RangeError);
    expect(() => multiplyCents(9_500, -2)).toThrow(RangeError);
    expect(() => multiplyCents(9_500, 1.5)).toThrow(RangeError);
  });

  it("rejects fractional prices and overflowing results", () => {
    expect(() => multiplyCents(99.5, 2)).toThrow(RangeError);
    expect(() => multiplyCents(Number.MAX_SAFE_INTEGER, 2)).toThrow(RangeError);
  });
});

describe("taxCents", () => {
  it("is 0 when the rate or subtotal is 0", () => {
    expect(taxCents(10_000, 0)).toBe(0);
    expect(taxCents(0, 500)).toBe(0);
  });

  it("works out exact tax", () => {
    expect(taxCents(10_000, 500)).toBe(500); // 5% of $100.00
    expect(taxCents(10_000, 1_250)).toBe(1_250); // 12.5%
    expect(taxCents(10_000, 10_000)).toBe(10_000); // 100%
  });

  it("rounds exactly half a cent up", () => {
    expect(taxCents(250, 500)).toBe(13); // 12.5¢ → 13¢
    expect(taxCents(10, 500)).toBe(1); // 0.5¢ → 1¢
    expect(taxCents(270, 500)).toBe(14); // 13.5¢ → 14¢ (not half to even)
  });

  it("rounds below half down and above half up", () => {
    expect(taxCents(249, 500)).toBe(12); // 12.45¢
    expect(taxCents(251, 500)).toBe(13); // 12.55¢
    expect(taxCents(9, 500)).toBe(0); // 0.45¢
    expect(taxCents(1, 1)).toBe(0); // 0.0001¢
  });

  it("stays exact for large subtotals", () => {
    expect(taxCents(9_000_000_000_000, 1_250)).toBe(1_125_000_000_000);
  });

  it("rejects negative subtotals and invalid rates", () => {
    expect(() => taxCents(-100, 500)).toThrow(RangeError);
    expect(() => taxCents(100.5, 500)).toThrow(RangeError);
    expect(() => taxCents(100, -1)).toThrow(RangeError);
    expect(() => taxCents(100, 10_001)).toThrow(RangeError);
    expect(() => taxCents(100, 5.5)).toThrow(RangeError);
  });
});

describe("applyTax", () => {
  it("adds rounded tax to the subtotal", () => {
    expect(applyTax(250, 500)).toBe(263);
    expect(applyTax(10_000, 500)).toBe(10_500);
  });

  it("returns the subtotal when the rate is 0", () => {
    expect(applyTax(9_999, 0)).toBe(9_999);
    expect(applyTax(0, 0)).toBe(0);
  });
});

describe("formatCad", () => {
  it("formats cents as Canadian dollars", () => {
    expect(formatCad(123_456)).toBe("$1,234.56");
    expect(formatCad(9_500)).toBe("$95.00");
  });

  it("pads small amounts", () => {
    expect(formatCad(0)).toBe("$0.00");
    expect(formatCad(5)).toBe("$0.05");
    expect(formatCad(99)).toBe("$0.99");
  });

  it("formats negative amounts", () => {
    expect(formatCad(-250)).toBe("-$2.50");
  });

  it("formats large amounts without floating point error", () => {
    expect(formatCad(Number.MAX_SAFE_INTEGER)).toBe("$90,071,992,547,409.91");
  });

  it("rejects fractional cents", () => {
    expect(() => formatCad(10.5)).toThrow(RangeError);
  });
});
