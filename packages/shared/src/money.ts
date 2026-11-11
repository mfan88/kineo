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

/**
 * Reads a price typed in dollars ("95", "95.5", "$1,200.00") as whole cents, using
 * only string and integer maths. Returns null if it isn't a valid amount of zero or
 * more with at most two decimal places.
 */
export function parseCad(text: string): number | null {
  const cleaned = text.trim().replace(/^\$/, "").replaceAll(",", "").trim();
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(cleaned) ?? /^\.(\d{1,2})$/.exec(cleaned);
  if (!match) return null;
  const [dollars, cents] = match[0].startsWith(".")
    ? ["0", match[1] ?? ""]
    : [match[1] ?? "0", match[2] ?? ""];
  const value = BigInt(dollars) * 100n + BigInt(cents.padEnd(2, "0") || "0");
  return value > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(value);
}

/** Cents as plain dollars for an input box, e.g. 9500 → "95.00". */
export function centsToInput(amount: number): string {
  assertCents(amount);
  const sign = amount < 0 ? "-" : "";
  const absolute = Math.abs(amount);
  return `${sign}${Math.trunc(absolute / 100)}.${(absolute % 100).toString().padStart(2, "0")}`;
}

/**
 * Reads a tax rate typed as a percent ("5", "12.5", "7%") as basis points. Returns
 * null unless it's from 0 to 100 with at most two decimal places.
 */
export function parsePercent(text: string): number | null {
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(text.trim().replace(/%$/, "").trim());
  if (!match) return null;
  const basisPoints = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0") || "0");
  return basisPoints <= MAX_TAX_RATE_BASIS_POINTS ? basisPoints : null;
}

/** Basis points as a percent for display or an input box, e.g. 500 → "5", 1250 → "12.5". */
export function formatPercent(basisPoints: number): string {
  assertTaxRate(basisPoints);
  const whole = Math.trunc(basisPoints / 100);
  const fraction = (basisPoints % 100).toString().padStart(2, "0").replace(/0+$/, "");
  return fraction === "" ? `${whole}` : `${whole}.${fraction}`;
}
