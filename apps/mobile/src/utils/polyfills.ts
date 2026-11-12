/**
 * Standard JavaScript the shared packages use that React Native's engine (Hermes)
 * doesn't have yet. Each is added only if missing, and behaves as the standard says.
 * Imported first in src/app/_layout.tsx.
 */

/** Array.prototype.toSorted (ES2023): a sorted copy; the original is left as it was. */
// A method body by design (it's installed on Array.prototype, where `this` is the
// array), and the one place sort() is right: it sorts a fresh copy.
export function toSorted<T>(this: readonly T[], compare?: (a: T, b: T) => number): T[] {
  // oxlint-disable-next-line oxc/no-this-in-exported-function
  const copy: T[] = [...this];
  // oxlint-disable-next-line unicorn/no-array-sort
  return copy.sort(compare);
}

export function installPolyfills(): void {
  if (typeof Array.prototype.toSorted !== "function") {
    // Adding a missing standard method is what a polyfill is for.
    // oxlint-disable-next-line eslint/no-extend-native
    Object.defineProperty(Array.prototype, "toSorted", {
      value: toSorted,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
}

installPolyfills();
