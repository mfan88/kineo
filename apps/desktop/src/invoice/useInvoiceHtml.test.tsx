import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createDemoState } from "../data/store";
import { useInvoiceHtml } from "./useInvoiceHtml";

const state = createDemoState();
const data = {
  ...state,
  invoiceStyle: { ...state.invoiceStyle, footerLogoPath: "footer.png", logoPath: null },
};

vi.mock("../data/PracticeStoreProvider", () => ({ usePracticeData: () => data }));
vi.mock("../data/useLogoSrc", () => ({
  useLogoSrc: (path: string | null) =>
    path === "footer.png" ? "data:image/png;base64,AAAA" : null,
}));

describe("useInvoiceHtml", () => {
  it("passes the footer logo through to the invoice", () => {
    const invoice = state.invoices[0];
    const { result } = renderHook(() => useInvoiceHtml(invoice));
    expect(result.current).toContain('class="footer-logo"');
    expect(result.current).toContain("data:image/png;base64,AAAA");
  });

  it("is empty without an invoice", () => {
    const { result } = renderHook(() => useInvoiceHtml(undefined));
    expect(result.current).toBe("");
  });
});
