import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createDemoState, DemoStore } from "../data/store";
import { renderApp } from "../test/render";

// Made-up demo IDs.
const sentInvoice = "5eed0000-0000-4000-8000-000000000302";
const draftInvoice = "5eed0000-0000-4000-8000-000000000303";
const jordan = "5eed0000-0000-4000-8000-000000000203";

/** The invoice HTML shown in the preview frame. */
function invoiceHtml(): string {
  const frame = screen.getByTitle(/as the patient sees it$/);
  return frame.getAttribute("srcdoc") ?? "";
}

describe("Invoice preview", () => {
  it("shows the invoice from the shared template", () => {
    renderApp(`/invoices/${sentInvoice}/preview`);
    const html = invoiceHtml();
    expect(html).toContain("<title>Invoice INV-0002</title>");
    expect(html).toContain("Alex Example");
    expect(html).not.toContain("604-555-0100");
    expect(html).toContain("Morgan Testcase");
    expect(html).toContain("Visits on October 15, 2026, October 22, 2026");
    expect(html).toContain("<dt>Tax (5%)</dt><dd>$10.25</dd>");
    expect(html).toContain('<dt class="total">Total</dt><dd>$215.25</dd>');
    expect(html).toContain("Please keep this receipt");
  });

  it("uses the invoice style and the bundled Inter font", () => {
    const state = createDemoState();
    const store = new DemoStore({
      ...state,
      invoiceStyle: { ...state.invoiceStyle, accentColor: "forest", headerLayout: "centred" },
    });
    renderApp(`/invoices/${sentInvoice}/preview`, store);
    const html = invoiceHtml();
    expect(html).toContain("color: #166534");
    expect(html).toContain('<header class="header centred">');
    expect(html).toContain('font-family: "Inter Variable"');
  });

  it("offers Download PDF, which prints just the invoice frame", async () => {
    const { user } = renderApp(`/invoices/${sentInvoice}/preview`);
    const frame = screen.getByTitle(/as the patient sees it$/);
    if (!(frame instanceof HTMLIFrameElement) || !frame.contentWindow) throw new Error("No frame");
    const print = vi.spyOn(frame.contentWindow, "print").mockImplementation(() => {});
    await user.click(screen.getByRole("button", { name: "Download PDF" }));
    expect(print).toHaveBeenCalledTimes(1);
  });

  it("marks a draft as sent, confirms it and returns to the invoice", async () => {
    const { user, store, router } = renderApp(`/invoices/${draftInvoice}/preview`);
    await user.click(screen.getByRole("button", { name: "Mark as sent" }));
    // Sending is async: wait for the confirmation, then check.
    expect(await screen.findByText("Invoice sent")).toBeTruthy();
    expect(store.getState().invoices.find((i) => i.id === draftInvoice)?.status).toBe("sent");
    expect(await screen.findByText("Sent invoices can't be changed.")).toBeTruthy();
    expect(router.state.location.pathname).toBe(`/invoices/${draftInvoice}`);
  });

  it("opens from the editor's Preview and send", async () => {
    const { user, router } = renderApp(`/invoices/${draftInvoice}`);
    await user.click(screen.getByRole("button", { name: "Preview and send" }));
    expect(router.state.location.pathname).toBe(`/invoices/${draftInvoice}/preview`);
    expect(screen.getByRole("button", { name: "Mark as sent" })).toBeTruthy();
  });

  it("won't send without line items and says what to do", () => {
    const store = new DemoStore(createDemoState());
    const invoice = store.createInvoice(jordan, ["5eed0000-0000-4000-8000-000000000405"]);
    renderApp(`/invoices/${invoice.id}/preview`, store);
    expect(screen.getByRole("alert").textContent).toContain(
      "Add at least one line item before sending.",
    );
    expect(screen.getByRole("button", { name: "Mark as sent" })).toHaveProperty("disabled", true);
  });

  it("won't send while a field shown on invoices is empty", () => {
    const state = createDemoState();
    const store = new DemoStore({
      ...state,
      profile: { ...state.profile, clinicName: { value: "", showOnInvoice: true } },
    });
    renderApp(`/invoices/${draftInvoice}/preview`, store);
    expect(screen.getByRole("alert").textContent).toContain(
      "Fill in your clinic name in Settings, or stop showing it on invoices.",
    );
    expect(screen.getByRole("button", { name: "Mark as sent" })).toHaveProperty("disabled", true);
  });

  it("has no Mark as sent once sent", () => {
    renderApp(`/invoices/${sentInvoice}/preview`);
    expect(screen.queryByRole("button", { name: "Mark as sent" })).toBeNull();
    expect(screen.getByText("This invoice has been sent.")).toBeTruthy();
  });
});
