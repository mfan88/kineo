import { parseCad } from "../money";

/** A price list item as typed: its name and its price in dollars. */
export interface PriceItemDraft {
  name: string;
  price: string;
}

/** The message under each field that can't be saved as typed. */
export interface PriceItemErrors {
  name?: string;
  price?: string;
}

/** Checks a price list item form; returns the cents to save, or the errors to show under each field. */
export function checkPriceItem(
  draft: PriceItemDraft,
): { cents: number } | { errors: PriceItemErrors } {
  const errors: PriceItemErrors = {};
  if (draft.name.trim() === "") errors.name = "Give the item a name.";
  const cents = parseCad(draft.price);
  if (cents === null) errors.price = "Enter a price in dollars, like 95 or 95.50.";
  if (errors.name || errors.price || cents === null) return { errors };
  return { cents };
}
