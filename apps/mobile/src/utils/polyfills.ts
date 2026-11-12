/**
 * Standard JavaScript the shared packages use that React Native's engine (Hermes)
 * doesn't have yet. Each is added only if missing, and behaves as the standard says.
 * Imported first in src/app/_layout.tsx.
 */

/** Array.prototype.toSorted (ES2023): a sorted copy; the original is left as it was. */
export function toSorted<T>(this: readonly T[], compare?: (a: T, b: T) => number): T[] {
  return Array.prototype.slice.call(this).sort(compare) as T[];
}

export function installPolyfills(): void {
  if (typeof Array.prototype.toSorted !== "function") {
    Object.defineProperty(Array.prototype, "toSorted", {
      value: toSorted,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
}

installPolyfills();
