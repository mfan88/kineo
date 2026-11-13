import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createDemoState, DemoStore } from "../data/store";
import { renderApp } from "../test/render";

// Made-up demo IDs.
const sentInvoice = "5eed0000-0000-4000-8000-000000000302";
const draftInvoice = "5eed0000-0000-4000-8000-000000000303";
const jordan = "5eed0000-0000-4000-8000-000000000203";

/** The invoice HTML shown in the frame beside the form or the detail. */
function invoiceHtml(): string {
  const frame = screen.getByTitle(/as the patient sees it$/);
  return frame.getAttribute("srcdoc") ?? "";
}

/** Spies on printing the invoice frame (the system dialog's "Save as PDF"). */
function spyOnPrint() {
  const frame = screen.getByTitle(/as the patient sees it$/);
  if (!(frame instanceof HTMLIFrameElement) || !frame.contentWindow) throw new Error("No frame");
  return vi.spyOn(frame.contentWindow, "print").mockImplementation(() => {});
}

describe("The invoice beside the form", () => {
  it("shows a sent invoice from the shared template", () => {
    renderApp(`/invoices/${sentInvoice}`);
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
    renderApp(`/invoices/${sentInvoice}`, store);
    const html = invoiceHtml();
    expect(html).toContain("color: #166534");
    expect(html).toContain('<header class="header centred">');
    expect(html).toContain('font-family: "Inter Variable"');
  });

  it("follows a draft's changes live, and says notes never appear", async () => {
    const { user } = renderApp(`/invoices/${draftInvoice}`);
    expect(screen.getByRole("heading", { level: 2, name: "Live preview" })).toBeTruthy();
    expect(
      screen.getByText("Visit dates and services only. Notes never appear on invoices."),
    ).toBeTruthy();
    expect(invoiceHtml()).toContain('<dt class="total">Total</dt><dd>$120.00</dd>');
    await user.click(screen.getByRole("button", { name: /Increase/ }));
    expect(invoiceHtml()).toContain('<dt class="total">Total</dt><dd>$240.00</dd>');
  });

  it("downloads a sent invoice's PDF from its detail", async () => {
    const { user } = renderApp(`/invoices/${sentInvoice}`);
    const print = spyOnPrint();
    await user.click(screen.getByRole("button", { name: "Download PDF" }));
    expect(print).toHaveBeenCalledTimes(1);
  });
});

describe("Sending a draft", () => {
  it("asks first, then marks it sent and shows its detail", async () => {
    const { user, store, router } = renderApp(`/invoices/${draftInvoice}`);
    await user.click(screen.getByRole("button", { name: "Send invoice" }));
    const dialog = within(screen.getByRole("alertdialog", { name: "Send INV-0003?" }));
    expect(dialog.getByRole("heading", { name: "Send INV-0003?" })).toBeTruthy();
    expect(
      dialog.getByText(
        "Download the PDF and send it to Casey Fictional. Once it's marked as sent, it can't be changed.",
      ),
    ).toBeTruthy();
    expect(store.getState().invoices.find((i) => i.id === draftInvoice)?.status).toBe("draft");

    await user.click(dialog.getByRole("button", { name: "Mark as sent" }));
    expect(await screen.findByText("Invoice sent")).toBeTruthy();
    expect(store.getState().invoices.find((i) => i.id === draftInvoice)?.status).toBe("sent");
    expect(await screen.findByRole("button", { name: "Record payment" })).toBeTruthy();
    // The toast is an alert dialog too; the Send dialog itself has closed.
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog", { name: "Send INV-0003?" })).toBeNull(),
    );
    expect(router.state.location.pathname).toBe(`/invoices/${draftInvoice}`);
  });

  it("sends a complete funded draft, with Bill to and dated rows on the invoice", async () => {
    const store = new DemoStore(createDemoState());
    store.addPatientFunding({
      patientId: jordan,
      fundingTypeId: "5eed0000-0000-4000-8000-000000000701",
      detailValues: { "5eed0000-0000-4000-8000-000000000702": "4821" },
      periodStart: null,
      periodEnd: null,
    });
    const invoice = store.createInvoice(jordan, [
      "5eed0000-0000-4000-8000-000000000405",
      "5eed0000-0000-4000-8000-000000000406",
    ]);
    store.addLine(invoice.id, "5eed0000-0000-4000-8000-000000000102");
    const { user } = renderApp(`/invoices/${invoice.id}`, store);

    expect(screen.queryByRole("alert")).toBeNull();
    const html = invoiceHtml();
    expect(html).toContain("Autism Funding Branch, Ministry of Children and Family Development");
    expect(html).toContain("Client");
    expect(html).toContain("Billing number");
    expect(html).toContain("4821");
    expect(html).toContain("28 Oct 2026");
    expect(html).toContain("4 Nov 2026");

    await user.click(screen.getByRole("button", { name: "Send invoice" }));
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Mark as sent" }),
    );
    expect(await screen.findByText("Invoice sent")).toBeTruthy();
    expect(store.getState().invoices.find((i) => i.id === invoice.id)?.status).toBe("sent");
  });

  it("downloads the PDF from the dialog without sending", async () => {
    const { user, store } = renderApp(`/invoices/${draftInvoice}`);
    const print = spyOnPrint();
    await user.click(screen.getByRole("button", { name: "Send invoice" }));
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Download PDF" }),
    );
    expect(print).toHaveBeenCalledTimes(1);
    expect(store.getState().invoices.find((i) => i.id === draftInvoice)?.status).toBe("draft");
  });

  it("offers Download PDF and Mark as sent in the menu beside Send invoice", async () => {
    const { user, store } = renderApp(`/invoices/${draftInvoice}`);
    const print = spyOnPrint();
    await user.click(screen.getByRole("button", { name: "More ways to send" }));
    await user.click(await screen.findByRole("menuitem", { name: "Download PDF" }));
    expect(print).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "More ways to send" }));
    await user.click(await screen.findByRole("menuitem", { name: "Mark as sent" }));
    // Mark as sent asks first too: it can't be undone.
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(store.getState().invoices.find((i) => i.id === draftInvoice)?.status).toBe("draft");
  });

  it("won't send without line items and says what to do", () => {
    const store = new DemoStore(createDemoState());
    const invoice = store.createInvoice(jordan, ["5eed0000-0000-4000-8000-000000000405"]);
    renderApp(`/invoices/${invoice.id}`, store);
    expect(screen.getByRole("alert").textContent).toBe(
      "Add at least one line item before sending.",
    );
    expect(screen.getByRole("button", { name: "Send invoice" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "More ways to send" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("won't send while a field shown on invoices is empty, and links to Your profile", async () => {
    const state = createDemoState();
    const store = new DemoStore({
      ...state,
      profile: { ...state.profile, clinicName: { value: "", showOnInvoice: true } },
    });
    const { user, router } = renderApp(`/invoices/${draftInvoice}`, store);
    const alert = within(screen.getByRole("alert"));
    expect(
      alert.getByText(/^Add your clinic name before sending\. It's shown on invoices\./),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send invoice" })).toHaveProperty("disabled", true);
    await user.click(alert.getByRole("link", { name: "Open Your profile" }));
    expect(router.state.location.pathname).toBe("/settings/profile");
  });

  it("has no preview screen of its own any more", () => {
    const { router } = renderApp(`/invoices/${draftInvoice}/preview`);
    expect(router.state.location.pathname).toBe("/");
  });
});
