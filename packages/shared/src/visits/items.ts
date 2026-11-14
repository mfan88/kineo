import { NoteRuleError } from "../notes/rules";
import type { LineItem, PriceItem, Visit, VisitItem } from "../types/models";

/** A visit item while it is being edited, before it is saved. */
export type VisitItemDraft = {
  priceItemId: string | null;
  name: string;
  unitPriceCents: number;
  quantity: number;
};

export const VISIT_ITEMS_ON_INVOICE =
  "This visit is on an invoice, so its items can't be changed. Change the lines on the invoice instead.";

/** Adds a price item with quantity 1, or raises the quantity of its existing row by 1. */
export function addItemToDraft(
  items: readonly VisitItemDraft[],
  priceItem: Pick<PriceItem, "id" | "name" | "unitPriceCents">,
): VisitItemDraft[] {
  const existing = items.findIndex((item) => item.priceItemId === priceItem.id);
  if (existing >= 0) {
    return items.map((item, index) =>
      index === existing ? { ...item, quantity: item.quantity + 1 } : { ...item },
    );
  }
  return [
    ...items.map((item) => ({ ...item })),
    {
      priceItemId: priceItem.id,
      name: priceItem.name,
      unitPriceCents: priceItem.unitPriceCents,
      quantity: 1,
    },
  ];
}

/** Sets a row's quantity. Throws a RangeError unless it is a whole number of at least 1. */
export function setDraftQuantity(
  items: readonly VisitItemDraft[],
  index: number,
  quantity: number,
): VisitItemDraft[] {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new RangeError("Quantity must be a whole number of at least 1.");
  }
  return items.map((item, i) => (i === index ? { ...item, quantity } : { ...item }));
}

/** Removes the row at the index. */
export function removeDraftItem(items: readonly VisitItemDraft[], index: number): VisitItemDraft[] {
  return items.filter((_, i) => i !== index).map((item) => ({ ...item }));
}

/** Throws unless the visit is off every invoice. */
export function assertVisitItemsEditable(visit: Pick<Visit, "invoiceId">): void {
  if (visit.invoiceId) throw new NoteRuleError(VISIT_ITEMS_ON_INVOICE);
}

/**
 * Invoice lines for visits being put on an invoice: visits oldest first (ties
 * keep input order), then each visit's items by position. Funded invoices get
 * the visit date as the service date.
 */
export function linesFromVisitItems(input: {
  visits: readonly Pick<Visit, "id" | "visitDate">[];
  items: readonly VisitItem[];
  funded: boolean;
  firstPosition: number;
}): Omit<LineItem, "id" | "ownerId" | "invoiceId">[] {
  const ordered = input.visits
    .map((visit, index) => ({ visit, index }))
    .toSorted((a, b) => a.visit.visitDate.localeCompare(b.visit.visitDate) || a.index - b.index);
  const lines: Omit<LineItem, "id" | "ownerId" | "invoiceId">[] = [];
  let position = input.firstPosition;
  for (const { visit } of ordered) {
    const items = input.items
      .filter((item) => item.visitId === visit.id)
      .toSorted((a, b) => a.position - b.position);
    for (const item of items) {
      lines.push({
        priceItemId: item.priceItemId,
        name: item.name,
        unitPriceCents: item.unitPriceCents,
        quantity: item.quantity,
        position,
        serviceDate: input.funded ? visit.visitDate : null,
        visitId: visit.id,
      });
      position += 1;
    }
  }
  return lines;
}

/** Ids of the lines that came from the visit, which go when it leaves the invoice. */
export function linesLeavingWithVisit(
  lines: readonly Pick<LineItem, "id" | "visitId">[],
  visitId: string,
): string[] {
  return lines.filter((line) => line.visitId === visitId).map((line) => line.id);
}

/** "Initial assessment × 1 · Treatment × 2" in position order; "" when there are none. */
export function visitItemsSummary(
  items: readonly Pick<VisitItem, "name" | "quantity" | "position">[],
): string {
  return [...items]
    .toSorted((a, b) => a.position - b.position)
    .map((item) => `${item.name} × ${item.quantity}`)
    .join(" · ");
}
