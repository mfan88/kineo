import { describe, expect, it } from "vitest";
import { clerkErrorDetails } from "./clerkErrorDetails";

describe("clerkErrorDetails", () => {
  it("reads the first wrapped error", () => {
    const error = {
      message: "outer",
      errors: [{ code: "form_code_incorrect", message: "Incorrect code" }, { code: "other" }],
    };
    expect(clerkErrorDetails(error)).toEqual({
      code: "form_code_incorrect",
      message: "Incorrect code",
    });
  });

  it("reads a plain error's own code and message", () => {
    const error = Object.assign(new Error("Network failed"), { code: "network_error" });
    expect(clerkErrorDetails(error)).toEqual({ code: "network_error", message: "Network failed" });
  });

  it("falls back to the error itself when the list is empty or odd", () => {
    expect(clerkErrorDetails({ code: "x", errors: [] })).toEqual({ code: "x", message: undefined });
    expect(clerkErrorDetails({ code: "x", errors: ["text"] })).toEqual({
      code: "x",
      message: undefined,
    });
  });

  it("ignores fields of the wrong type", () => {
    expect(clerkErrorDetails({ code: 42, message: null })).toEqual({
      code: undefined,
      message: undefined,
    });
  });

  it("returns nothing for values that aren't objects", () => {
    expect(clerkErrorDetails(null)).toEqual({});
    expect(clerkErrorDetails(undefined)).toEqual({});
    expect(clerkErrorDetails("failed")).toEqual({});
  });
});
