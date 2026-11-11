/**
 * Money helpers. Every amount is a whole number of cents (CAD).
 * Never use floating point for money; convert to dollars only when formatting.
 *
 * Tax rule: tax is worked out once on the invoice subtotal and rounded to the
 * nearest cent, with exactly half a cent rounding up. Tax rates are stored in
 * basis points (5% = 500, 12.5% = 1250).
 */

/** Largest tax rate accepted: 100% (10,000 basis points). */
export const MAX_TAX_RATE_BASIS_POINTS = 10_000;

const BASIS_POINTS_PER_WHOLE = 10_000n;

/** Throws unless `amount` is a whole number of cents within the safe integer range. */
export function assertCents(amount: number): void {
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError("Amount must be a whole number of cents.");
  }
}

/** Throws unless `rate` is a whole number of basis points from 0 to 10,000. */
export function assertTaxRate(rate: number): void {
  if (!Number.isInteger(rate) || rate < 0 || rate > MAX_TAX_RATE_BASIS_POINTS) {
    throw new RangeError("Tax rate must be a whole number of basis points from 0 to 10000.");
  }
}

function toSafeCents(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError("Amount is too large.");
  }
  return Number(value);
}

/** Adds amounts in cents. An empty list adds up to 0. */
export function addCents(...amounts: readonly number[]): number {
  let total = 0n;
  for (const amount of amounts) {
    assertCents(amount);
    total += BigInt(amount);
  }
  return toSafeCents(total);
}

/** Multiplies a unit price in cents by a quantity, which must be a whole number of at least 1. */
export function multiplyCents(unitPrice: number, quantity: number): number {
  assertCents(unitPrice);
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw new RangeError("Quantity must be a whole number of at least 1.");
  }
  return toSafeCents(BigInt(unitPrice) * BigInt(quantity));
}

/**
 * Tax in cents on a subtotal, rounded half up to the nearest cent.
 * The subtotal must not be negative.
 */
export function taxCents(subtotal: number, rateBasisPoints: number): number {
  assertCents(subtotal);
  if (subtotal < 0) {
    throw new RangeError("Subtotal must not be negative.");
  }
  assertTaxRate(rateBasisPoints);
  const scaled = BigInt(subtotal) * BigInt(rateBasisPoints);
  // Half up for non-negative values: add half the divisor, then floor.
  return toSafeCents((scaled + BASIS_POINTS_PER_WHOLE / 2n) / BASIS_POINTS_PER_WHOLE);
}

/** Subtotal plus tax, using the same rounding as `taxCents`. */
export function applyTax(subtotal: number, rateBasisPoints: number): number {
  return addCents(subtotal, taxCents(subtotal, rateBasisPoints));
}

const cadFormatter = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });

/** Formats cents as Canadian dollars, e.g. 123456 → "$1,234.56". */
export function formatCad(amount: number): string {
  assertCents(amount);
  const negative = amount < 0;
  const absolute = BigInt(Math.abs(amount));
  const dollars = absolute / 100n;
  const cents = (absolute % 100n).toString().padStart(2, "0");
  // Pass a decimal string so no floating point is involved.
  const decimal = `${negative ? "-" : ""}${dollars.toString()}.${cents}`;
  if (!isDecimalString(decimal)) {
    throw new RangeError("Amount could not be formatted.");
  }
  return cadFormatter.format(decimal);
}

function isDecimalString(value: string): value is `${number}` {
  return /^-?\d+\.\d{2}$/.test(value);
}
