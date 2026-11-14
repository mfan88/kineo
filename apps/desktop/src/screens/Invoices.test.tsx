import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createDemoState, DemoStore } from "../data/store";
import { renderApp } from "../test/render";

const tab = (name: RegExp) => screen.getByRole("tab", { name });
const rowLabels = (group: string) =>
  within(screen.getByRole("list", { name: `Invoices: ${group}` }))
    .getAllByRole("button")
    .map((row) => row.getAttribute("aria-label"));

describe("Invoices list", () => {
  it("opens from Invoices in the tab bar", async () => {
    const { user, router } = renderApp();
    await user.click(screen.getByRole("link", { name: "Invoices" }));
    expect(router.state.location.pathname).toBe("/invoices");
    expect(screen.getByRole("heading", { level: 1, name: "Invoices" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Invoices" }).getAttribute("aria-current")).toBe(
      "page",
    );
  });

  it("shows the four groups as pills with counts, opening on the first with invoices", () => {
    renderApp("/invoices");
    const pills = within(screen.getByRole("tablist", { name: "Invoice groups" })).getAllByRole(
      "tab",
    );
    expect(pills.map((pill) => [pill.textContent, pill.getAttribute("aria-label")])).toEqual([
      ["Not sent yet · 1", "Not sent yet, 1 invoice"],
      ["Waiting · 1", "Waiting on payment, 1 invoice"],
      ["Paid · 1", "Paid, 1 invoice"],
      ["Cancelled · 0", "Cancelled, 0 invoices"],
    ]);
    expect(tab(/^Not sent yet/).getAttribute("aria-selected")).toBe("true");
    expect(rowLabels("Not sent yet")).toEqual(["INV-0003, Casey Fictional, $120.00, Draft"]);
  });

  it("switches group from its pill, keeping it in the address", async () => {
    const { user, router } = renderApp("/invoices");
    await user.click(tab(/^Paid/));
    expect(router.state.location.search).toBe("?group=paid");
    expect(rowLabels("Paid")).toEqual(["INV-0001, Morgan Testcase, $120.00, Paid"]);
    await user.click(tab(/^Waiting on payment/));
    expect(rowLabels("Waiting on payment")).toEqual([
      "INV-0002, Morgan Testcase, $215.25, Waiting on payment",
    ]);
  });

  it("keeps a cancelled invoice in its own Cancelled group, with its number", () => {
    const store = new DemoStore(createDemoState());
    store.cancelInvoice("5eed0000-0000-4000-8000-000000000302");
    renderApp("/invoices?group=cancelled", store);
    expect(tab(/^Cancelled/).textContent).toBe("Cancelled · 1");
    expect(tab(/^Waiting on payment/).textContent).toBe("Waiting · 0");
    expect(rowLabels("Cancelled")).toEqual(["INV-0002, Morgan Testcase, $215.25, Cancelled"]);
  });

  it("says so when no invoice is cancelled", () => {
    renderApp("/invoices?group=cancelled");
    expect(screen.getByText("No cancelled invoices")).toBeTruthy();
    expect(screen.getByText("Invoices you cancel stay here as a record.")).toBeTruthy();
  });

  it("opens a sent invoice's detail", async () => {
    const { user, router } = renderApp("/invoices?group=waiting");
    await user.click(screen.getByRole("button", { name: /^INV-0002/ }));
    expect(router.state.location.pathname).toBe("/invoices/5eed0000-0000-4000-8000-000000000302");
    expect(screen.getByRole("heading", { level: 1, name: "$215.25" })).toBeTruthy();
  });

  it("shows a newly created invoice first in Not sent yet", () => {
    const store = new DemoStore(createDemoState());
    store.createInvoice("5eed0000-0000-4000-8000-000000000203", [
      "5eed0000-0000-4000-8000-000000000405",
    ]);
    renderApp("/invoices", store);
    expect(rowLabels("Not sent yet")[0]).toBe("INV-0004, Jordan Sample, $310.00, Draft");
  });

  it("says so when a group is empty", () => {
    const state = createDemoState();
    renderApp(
      "/invoices?group=waiting",
      new DemoStore({
        ...state,
        invoices: state.invoices.filter((invoice) => invoice.status !== "sent"),
      }),
    );
    expect(tab(/^Waiting on payment/).textContent).toBe("Waiting · 0");
    expect(screen.getByText("You're all caught up")).toBeTruthy();
    expect(screen.getByText("Sent invoices waiting on payment show up here.")).toBeTruthy();
  });

  it("says when there are no invoices yet, without pills", () => {
    const state = createDemoState();
    renderApp("/invoices", new DemoStore({ ...state, invoices: [], lineItems: [] }));
    expect(screen.getByText("No invoices yet")).toBeTruthy();
    expect(screen.queryByRole("tablist")).toBeNull();
  });
});
