import { describe, expect, it } from "vitest";
import { createDemoState } from "../data/store";
import { stylePreviewInput } from "./styleSample";

describe("stylePreviewInput", () => {
  const state = createDemoState();

  it("passes the footer logo for the latest invoice", () => {
    const input = stylePreviewInput(state, state.invoiceStyle, null, "data:footer");
    expect(input.footerLogoSrc).toBe("data:footer");
  });

  it("passes the footer logo for the sample invoice", () => {
    const empty = { ...state, invoices: [] };
    const input = stylePreviewInput(empty, state.invoiceStyle, "data:logo", "data:footer");
    expect(input.footerLogoSrc).toBe("data:footer");
    expect(input.logoSrc).toBe("data:logo");
  });

  it("defaults to no footer logo", () => {
    expect(stylePreviewInput(state, state.invoiceStyle, null).footerLogoSrc).toBeNull();
  });
});
