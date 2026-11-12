import { describe, expect, it } from "vitest";
import { localDate } from "./local-date";

describe("localDate", () => {
  it("formats the local day as YYYY-MM-DD, padding month and day", () => {
    expect(localDate(new Date(2026, 0, 5, 12))).toBe("2026-01-05");
    expect(localDate(new Date(2026, 10, 12, 12))).toBe("2026-11-12");
  });

  it("uses the local day, not the UTC one, at either end of the day", () => {
    expect(localDate(new Date(2026, 10, 12, 0, 0, 1))).toBe("2026-11-12");
    expect(localDate(new Date(2026, 10, 12, 23, 59, 59))).toBe("2026-11-12");
  });
});
