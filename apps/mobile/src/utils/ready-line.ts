import { formatCad } from "@kineo/shared";

/** A made-up amount, formatted by @kineo/shared, to show the shared code runs here. */
export const SAMPLE_AMOUNT_CENTS = 12_550;

/**
 * The first screen's line (M1): proves `@kineo/shared` works in the phone app.
 * Replaced by Home in M3.
 */
export function readyLine(cents: number = SAMPLE_AMOUNT_CENTS): string {
  return `Shared invoice maths is working: ${formatCad(cents)}`;
}
