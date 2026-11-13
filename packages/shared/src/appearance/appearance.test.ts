import { describe, expect, it } from "vitest";
import {
  APPEARANCE_LABELS,
  APPEARANCE_SETTINGS,
  appearanceSummary,
  parseAppearance,
  resolveAppearance,
} from "./appearance";

describe("parseAppearance", () => {
  it.each(["system", "light", "dark"] as const)("keeps %s", (value) => {
    expect(parseAppearance(value)).toBe(value);
  });

  it("trims what was saved", () => {
    expect(parseAppearance(" dark\n")).toBe("dark");
  });

  it.each([undefined, null, "", "Dark", "sepia", 1, {}])("falls back to system for %s", (raw) => {
    expect(parseAppearance(raw)).toBe("system");
  });
});

describe("resolveAppearance", () => {
  it("follows the system when matching it", () => {
    expect(resolveAppearance("system", true)).toBe("dark");
    expect(resolveAppearance("system", false)).toBe("light");
  });

  it("ignores the system for a fixed choice", () => {
    expect(resolveAppearance("light", true)).toBe("light");
    expect(resolveAppearance("dark", false)).toBe("dark");
  });
});

describe("appearanceSummary", () => {
  it("says what the system is showing now", () => {
    expect(appearanceSummary("system", false)).toBe("Match system · light now");
    expect(appearanceSummary("system", true)).toBe("Match system · dark now");
  });

  it("names a fixed choice", () => {
    expect(appearanceSummary("light", true)).toBe("Light");
    expect(appearanceSummary("dark", false)).toBe("Dark");
  });

  it("has a label for every setting, Match system first", () => {
    expect(APPEARANCE_SETTINGS.map((s) => APPEARANCE_LABELS[s])).toEqual([
      "Match system",
      "Light",
      "Dark",
    ]);
  });
});
