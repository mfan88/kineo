import { WriteError } from "@kineo/data";
import { InvoiceRuleError, NoteRuleError } from "@kineo/shared";

/**
 * The message to show for an error a rule raised (a refused change), or null for
 * anything else, which callers should rethrow. Never includes patient details.
 */
export function userMessage(error: unknown): string | null {
  if (
    error instanceof WriteError ||
    error instanceof NoteRuleError ||
    error instanceof InvoiceRuleError
  ) {
    return error.message;
  }
  return null;
}
