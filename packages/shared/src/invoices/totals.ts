import { addCents, multiplyCents, taxCents } from "../money";
import type { Invoice, LineItem, PriceItem } from "../types/models";

/** The parts of a line item that its amount depends on. */
export type PricedLine = Pick<LineItem, "unitPriceCents" | "quantity">;

/** The parts of an invoice that its tax depends on. */
export type InvoiceTaxSettings = Pick<Invoice, "taxEnabled" | "taxRateBasisPoints">;

export interface InvoiceTotals {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
}

/** The fields a new line item copies from a price list item. */
export type LineFromPriceItem = Pick<
  LineItem,
  "priceItemId" | "name" | "unitPriceCents" | "quantity"
>;

/**
 * Copies a price list item's name and price into a new line, so later price
 * list changes never alter the invoice. Quantity defaults to 1.
 */
export function lineFromPriceItem(
  priceItem: Pick<PriceItem, "id" | "name" | "unitPriceCents">,
  quantity = 1,
): LineFromPriceItem {
  // Validates the price and quantity before anything is stored.
  multiplyCents(priceItem.unitPriceCents, quantity);
  return {
    priceItemId: priceItem.id,
    name: priceItem.name,
    unitPriceCents: priceItem.unitPriceCents,
    quantity,
  };
}

/** Unit price times quantity, in cents. */
export function lineTotalCents(line: PricedLine): number {
  return multiplyCents(line.unitPriceCents, line.quantity);
}

/**
 * Subtotal, tax and total for an invoice, in cents. Tax is worked out once on
 * the subtotal (rounded half up) and is 0 when tax is off for the invoice.
 */
export function invoiceTotals(
  lines: readonly PricedLine[],
  settings: InvoiceTaxSettings,
): InvoiceTotals {
  const subtotalCents = addCents(...lines.map(lineTotalCents));
  const taxAmount = settings.taxEnabled ? taxCents(subtotalCents, settings.taxRateBasisPoints) : 0;
  return {
    subtotalCents,
    taxCents: taxAmount,
    totalCents: addCents(subtotalCents, taxAmount),
  };
}
