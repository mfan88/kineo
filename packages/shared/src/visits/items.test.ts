import { describe, expect, it } from "vitest";
import { NoteRuleError } from "../notes/rules";
import type { VisitItem } from "../types/models";
import {
  addItemToDraft,
  assertVisitItemsEditable,
  linesFromVisitItems,
  linesLeavingWithVisit,
  removeDraftItem,
  setDraftQuantity,
  visitItemsSummary,
  type VisitItemDraft,
} from "./items";

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const assessment = { id: P1, name: "Initial assessment", unitPriceCents: 9000 };
const treatment = { id: P2, name: "Treatment", unitPriceCents: 7500 };

function item(visitId: string, position: number, name: string, quantity = 1): VisitItem {
  return {
    id: `${visitId}-${position}`,
    ownerId: "user_test",
    visitId,
    priceItemId: P1,
    name,
    unitPriceCents: 1000 * (position + 1),
    quantity,
    position,
    createdAt: "2026-11-01T10:00:00Z",
  };
}

describe("addItemToDraft", () => {
  it("appends a new row with quantity 1", () => {
    const next = addItemToDraft([], assessment);
    expect(next).toEqual([
      { priceItemId: P1, name: "Initial assessment", unitPriceCents: 9000, quantity: 1 },
    ]);
  });

  it("raises the quantity when the price item is already there", () => {
    const once = addItemToDraft(addItemToDraft([], assessment), treatment);
    const twice = addItemToDraft(once, assessment);
    expect(twice).toHaveLength(2);
    expect(twice[0]?.quantity).toBe(2);
    expect(twice[1]?.quantity).toBe(1);
    expect(once[0]?.quantity).toBe(1);
  });

  it("keeps a copied price when the price list changes", () => {
    const first = addItemToDraft([], assessment);
    const next = addItemToDraft(first, { ...assessment, unitPriceCents: 10000 });
    expect(next[0]?.unitPriceCents).toBe(9000);
  });
});

describe("setDraftQuantity", () => {
  const items: VisitItemDraft[] = addItemToDraft(addItemToDraft([], assessment), treatment);

  it("sets a whole quantity of at least 1", () => {
    expect(setDraftQuantity(items, 1, 3)[1]?.quantity).toBe(3);
    expect(setDraftQuantity(items, 0, 1)[0]?.quantity).toBe(1);
  });

  it("rejects 0, fractions, negatives and NaN", () => {
    for (const bad of [0, 1.5, -1, Number.NaN]) {
      expect(() => setDraftQuantity(items, 0, bad)).toThrow(RangeError);
    }
  });
});

describe("removeDraftItem", () => {
  it("removes the row at the index", () => {
    const items = addItemToDraft(addItemToDraft([], assessment), treatment);
    expect(removeDraftItem(items, 0).map((i) => i.name)).toEqual(["Treatment"]);
    expect(removeDraftItem(items, 5)).toHaveLength(2);
    expect(removeDraftItem([], 0)).toEqual([]);
  });
});

describe("assertVisitItemsEditable", () => {
  it("allows a visit that is not on an invoice", () => {
    expect(() => assertVisitItemsEditable({ invoiceId: null })).not.toThrow();
  });

  it("refuses a visit on an invoice", () => {
    expect(() => assertVisitItemsEditable({ invoiceId: P1 })).toThrow(NoteRuleError);
    expect(() => assertVisitItemsEditable({ invoiceId: P1 })).toThrow(
      "This visit is on an invoice, so its items can't be changed. Change the lines on the invoice instead.",
    );
  });
});

describe("linesFromVisitItems", () => {
  const older = { id: "va", visitDate: "2026-11-02" };
  const newer = { id: "vb", visitDate: "2026-11-05" };
  const items = [item("vb", 0, "B first"), item("va", 1, "A second", 2), item("va", 0, "A first")];

  it("orders visits oldest first, then items by position, counting up", () => {
    const lines = linesFromVisitItems({
      visits: [newer, older],
      items,
      funded: false,
      firstPosition: 3,
    });
    expect(lines.map((l) => [l.name, l.position, l.visitId])).toEqual([
      ["A first", 3, "va"],
      ["A second", 4, "va"],
      ["B first", 5, "vb"],
    ]);
    expect(lines[1]).toMatchObject({ quantity: 2, unitPriceCents: 2000, priceItemId: P1 });
  });

  it("dates lines on a funded invoice and leaves self-pay lines undated", () => {
    const funded = linesFromVisitItems({
      visits: [older, newer],
      items,
      funded: true,
      firstPosition: 0,
    });
    expect(funded.map((l) => l.serviceDate)).toEqual(["2026-11-02", "2026-11-02", "2026-11-05"]);
    const selfPay = linesFromVisitItems({
      visits: [older, newer],
      items,
      funded: false,
      firstPosition: 0,
    });
    expect(selfPay.every((l) => l.serviceDate === null)).toBe(true);
  });

  it("keeps input order for visits on the same day", () => {
    const x = { id: "vx", visitDate: "2026-11-02" };
    const y = { id: "vy", visitDate: "2026-11-02" };
    const lines = linesFromVisitItems({
      visits: [y, x],
      items: [item("vx", 0, "X"), item("vy", 0, "Y")],
      funded: false,
      firstPosition: 0,
    });
    expect(lines.map((l) => l.name)).toEqual(["Y", "X"]);
  });

  it("returns nothing for no visits, or visits with no items", () => {
    expect(linesFromVisitItems({ visits: [], items, funded: true, firstPosition: 0 })).toEqual([]);
    expect(
      linesFromVisitItems({ visits: [older], items: [], funded: true, firstPosition: 0 }),
    ).toEqual([]);
  });
});

describe("linesLeavingWithVisit", () => {
  it("returns the ids of lines from that visit only", () => {
    const lines = [
      { id: "l1", visitId: "va" },
      { id: "l2", visitId: null },
      { id: "l3" },
      { id: "l4", visitId: "va" },
      { id: "l5", visitId: "vb" },
    ];
    expect(linesLeavingWithVisit(lines, "va")).toEqual(["l1", "l4"]);
    expect(linesLeavingWithVisit(lines, "none")).toEqual([]);
    expect(linesLeavingWithVisit([], "va")).toEqual([]);
  });
});

describe("visitItemsSummary", () => {
  it("joins items in position order", () => {
    expect(
      visitItemsSummary([
        { name: "Treatment", quantity: 2, position: 1 },
        { name: "Initial assessment", quantity: 1, position: 0 },
      ]),
    ).toBe("Initial assessment × 1 · Treatment × 2");
  });

  it("is empty when there are no items", () => {
    expect(visitItemsSummary([])).toBe("");
  });
});
