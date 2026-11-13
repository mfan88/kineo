import { describe, expect, it } from "vitest";
import { colorSchemeOf } from "./color-scheme";

describe("colorSchemeOf", () => {
  it("is dark only for Uniwind's dark theme", () => {
    expect(colorSchemeOf("dark")).toBe("dark");
    expect(colorSchemeOf("light")).toBe("light");
    expect(colorSchemeOf("")).toBe("light");
  });
});
