import { parseCad } from "@kineo/shared";

/** A price list item as typed: its name and its price in dollars. */
export interface ItemDraft {
  name: string;
  price: string;
}

export interface ItemErrors {
  name?: string;
  price?: string;
}

/** Checks an item form; returns the cents to save, or the errors to show under each field. */
export function checkItem(draft: ItemDraft): { cents: number } | { errors: ItemErrors } {
  const errors: ItemErrors = {};
  if (draft.name.trim() === "") errors.name = "Give the item a name.";
  const cents = parseCad(draft.price);
  if (cents === null) errors.price = "Enter a price in dollars, like 95 or 95.50.";
  if (errors.name || errors.price || cents === null) return { errors };
  return { cents };
}
