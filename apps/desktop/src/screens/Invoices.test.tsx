import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createDemoState, DemoStore } from "../data/store";
import { renderApp } from "../test/render";

describe("Invoices list", () => {
  it("opens from See all invoices on Home", async () => {
    const { user, router } = renderApp();
    await user.click(screen.getByRole("button", { name: "See all invoices" }));
    expect(router.state.location.pathname).toBe("/invoices");
    expect(screen.getByRole("heading", { level: 1, name: "Invoices" })).toBeTruthy();
  });

  it("lists every invoice newest first with number, patient, total and status", () => {
    renderApp("/invoices");
    const rows = within(screen.getByRole("list", { name: "Invoices" })).getAllByRole("button");
    expect(rows.map((row) => row.getAttribute("aria-label"))).toEqual([
      "INV-0003, Casey Fictional, $120.00, Draft",
      "INV-0002, Morgan Testcase, $215.25, Waiting on payment",
      "INV-0001, Morgan Testcase, $120.00, Paid",
    ]);
  });

  it("opens an invoice's editor", async () => {
    const { user, router } = renderApp("/invoices");
    await user.click(screen.getByRole("button", { name: /^INV-0002/ }));
    expect(router.state.location.pathname).toBe("/invoices/5eed0000-0000-4000-8000-000000000302");
    expect(screen.getByRole("heading", { level: 1, name: "Invoice INV-0002" })).toBeTruthy();
  });

  it("shows a newly created invoice at the top", () => {
    const store = new DemoStore(createDemoState());
    store.createInvoice("5eed0000-0000-4000-8000-000000000203", [
      "5eed0000-0000-4000-8000-000000000405",
    ]);
    renderApp("/invoices", store);
    const rows = within(screen.getByRole("list", { name: "Invoices" })).getAllByRole("button");
    expect(rows[0]?.getAttribute("aria-label")).toBe("INV-0004, Jordan Sample, $0.00, Draft");
  });

  it("says when there are no invoices yet", () => {
    const state = createDemoState();
    renderApp("/invoices", new DemoStore({ ...state, invoices: [], lineItems: [] }));
    expect(screen.getByText("No invoices yet")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Invoices" })).toBeNull();
  });
});
