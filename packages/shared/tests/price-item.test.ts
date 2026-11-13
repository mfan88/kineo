import { describe, expect, it } from "vitest";
import { checkPriceItem } from "../src/index";

describe("checkPriceItem", () => {
  it("reads a price in dollars as whole cents, without floating point", () => {
    expect(checkPriceItem({ name: "Follow-up visit", price: "95" })).toEqual({ cents: 9500 });
    expect(checkPriceItem({ name: "Follow-up visit", price: "95.5" })).toEqual({ cents: 9550 });
    expect(checkPriceItem({ name: "Taping", price: "19.99" })).toEqual({ cents: 1999 });
    expect(checkPriceItem({ name: "Assessment", price: "$1,200.00" })).toEqual({ cents: 120000 });
    // 0.1 + 0.2 style traps: 0.29 is exactly 29 cents.
    expect(checkPriceItem({ name: "Tape", price: "0.29" })).toEqual({ cents: 29 });
  });

  it("allows a free item", () => {
    expect(checkPriceItem({ name: "Courtesy call", price: "0" })).toEqual({ cents: 0 });
    expect(checkPriceItem({ name: "Courtesy call", price: "0.00" })).toEqual({ cents: 0 });
  });

  it("asks for a name when it's empty or only spaces", () => {
    expect(checkPriceItem({ name: "", price: "95" })).toEqual({
      errors: { name: "Give the item a name." },
    });
    expect(checkPriceItem({ name: "   ", price: "95" })).toEqual({
      errors: { name: "Give the item a name." },
    });
  });

  it("asks for a price it can read", () => {
    const price = "Enter a price in dollars, like 95 or 95.50.";
    for (const typed of ["", "abc", "-5", "95.555", "9 5", "1.2.3"]) {
      expect(checkPriceItem({ name: "Taping", price: typed })).toEqual({ errors: { price } });
    }
  });

  it("shows both errors at once", () => {
    expect(checkPriceItem({ name: " ", price: "" })).toEqual({
      errors: {
        name: "Give the item a name.",
        price: "Enter a price in dollars, like 95 or 95.50.",
      },
    });
  });
});
