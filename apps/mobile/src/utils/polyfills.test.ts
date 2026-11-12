import { describe, expect, it } from "vitest";
import { toSorted } from "./polyfills";

// The polyfill typed for each element type the tests use.
const sortNumbers: (
  this: readonly number[],
  compare?: (a: number, b: number) => number,
) => number[] = toSorted;
const sortStrings: (
  this: readonly string[],
  compare?: (a: string, b: string) => number,
) => string[] = toSorted;

describe("toSorted polyfill", () => {
  it("returns a sorted copy and leaves the original alone", () => {
    const original = [3, 1, 2];
    const sorted = sortNumbers.call(original, (a, b) => a - b);
    expect(sorted).toEqual([1, 2, 3]);
    expect(original).toEqual([3, 1, 2]);
    expect(sorted).not.toBe(original);
  });

  it("sorts as text without a compare function, like Array.prototype.sort", () => {
    expect(sortNumbers.call([10, 9, 1])).toEqual([1, 10, 9]);
  });

  it("matches the built-in where there is one", () => {
    const values = ["pear", "apple", "fig", "apple"];
    expect(sortStrings.call(values, (a, b) => a.localeCompare(b))).toEqual(
      values.toSorted((a, b) => a.localeCompare(b)),
    );
  });

  it("handles empty and one-item lists", () => {
    expect(sortNumbers.call([])).toEqual([]);
    expect(sortStrings.call(["only"])).toEqual(["only"]);
  });
});
