import { WriteError } from "@kineo/data";
import { InvoiceRuleError, NoteRuleError } from "@kineo/shared";
import { LogoError } from "../data/logos";
import { StoreError } from "../data/store";

/**
 * The message to show for an error a rule raised (a refused change), or null for
 * anything else, which callers should rethrow. Never includes patient details.
 */
export function userMessage(error: unknown): string | null {
  if (
    error instanceof WriteError ||
    error instanceof StoreError ||
    error instanceof NoteRuleError ||
    error instanceof InvoiceRuleError ||
    error instanceof LogoError
  ) {
    return error.message;
  }
  return null;
}
