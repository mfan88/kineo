import { describe, expect, it } from "vitest";
import { readyLine } from "./ready-line";

describe("readyLine", () => {
  it("formats the sample amount with the shared money code", () => {
    expect(readyLine()).toBe("Shared invoice maths is working: $125.50");
  });

  it("formats zero and whole dollars", () => {
    expect(readyLine(0)).toBe("Shared invoice maths is working: $0.00");
    expect(readyLine(9_500)).toBe("Shared invoice maths is working: $95.00");
  });
});
