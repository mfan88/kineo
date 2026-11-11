import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createDemoState, DemoStore } from "../data/store";
import { renderApp } from "../test/render";

// Made-up demo IDs.
const sentInvoice = "5eed0000-0000-4000-8000-000000000302";
const draftInvoice = "5eed0000-0000-4000-8000-000000000303";
const jordan = "5eed0000-0000-4000-8000-000000000203";

function page() {
  return within(screen.getByRole("article"));
}

describe("Invoice preview", () => {
  it("shows the invoice as the patient sees it", () => {
    renderApp(`/invoices/${sentInvoice}/preview`);
    const invoice = page();
    // Profile fields shown on invoices; the phone is hidden in the demo profile.
    expect(invoice.getByText("Alex Example")).toBeTruthy();
    expect(invoice.getByText("Registered Physiotherapist")).toBeTruthy();
    expect(invoice.getByText("Example Physiotherapy")).toBeTruthy();
    expect(invoice.queryByText("604-555-0100")).toBeNull();
    // Number, patient, visits, lines, totals and footer.
    expect(invoice.getByText("INV-0002")).toBeTruthy();
    expect(invoice.getByText("Morgan Testcase")).toBeTruthy();
    expect(invoice.getByText("Visits on October 15, 2026, October 22, 2026")).toBeTruthy();
    expect(
      invoice.getByRole("row", { name: /Follow-up treatment 2 \$95\.00 \$190\.00/ }),
    ).toBeTruthy();
    expect(invoice.getByText("Tax (5%)").nextElementSibling?.textContent).toBe("$10.25");
    expect(invoice.getByText("Total").nextElementSibling?.textContent).toBe("$215.25");
    expect(invoice.getByText(/Please keep this receipt/)).toBeTruthy();
  });

  it("uses the invoice style's accent, font and header layout", () => {
    const state = createDemoState();
    const store = new DemoStore({
      ...state,
      invoiceStyle: {
        ...state.invoiceStyle,
        accentColor: "forest",
        font: "serif",
        headerLayout: "centred",
        footerNote: "",
      },
    });
    renderApp(`/invoices/${sentInvoice}/preview`, store);
    const article = screen.getByRole("article");
    expect(article.style.fontFamily).toContain("Georgia");
    expect(within(article).getByText("Invoice").style.color).toBe("rgb(22, 101, 52)");
    expect(within(article).getByText("Alex Example").parentElement?.className).toContain(
      "items-center",
    );
    expect(within(article).queryByText(/Please keep this receipt/)).toBeNull();
  });

  it("marks a draft as sent, confirms it and returns to the invoice", async () => {
    const { user, store, router } = renderApp(`/invoices/${draftInvoice}/preview`);
    await user.click(screen.getByRole("button", { name: "Mark as sent" }));
    expect(store.getState().invoices.find((i) => i.id === draftInvoice)?.status).toBe("sent");
    expect(await screen.findByText("Invoice sent")).toBeTruthy();
    expect(router.state.location.pathname).toBe(`/invoices/${draftInvoice}`);
    expect(screen.getByText("Sent invoices can't be changed.")).toBeTruthy();
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
