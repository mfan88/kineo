import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readyPatients } from "@kineo/shared";
import { createDemoState, DemoStore } from "../data/store";
import { renderApp } from "../test/render";

// Made-up demo IDs.
const JORDAN = "5eed0000-0000-4000-8000-000000000203";
const RILEY = "5eed0000-0000-4000-8000-000000000204";

beforeEach(() => {
  // Only the date is faked, so typing and clicking carry on as normal.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 12, 9, 0));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("Home", () => {
  it("lists recent patients as rows, most recently seen first, with when they were last seen", () => {
    renderApp();
    const rows = within(screen.getByRole("list", { name: "Recent patients" })).getAllByRole(
      "listitem",
    );
    expect(rows.map((row) => row.textContent)).toEqual([
      "Riley PlaceholderLast visit 6 Nov",
      "Jordan SampleLast visit 4 Nov",
      "Casey FictionalLast visit 3 Nov",
      "Morgan TestcaseLast visit 22 Oct",
    ]);
    expect(screen.getByRole("heading", { level: 2, name: "Recent" })).toBeTruthy();
  });

  it("counts what's ready to invoice and what's waiting on payment", () => {
    renderApp();
    expect(screen.getByRole("heading", { level: 2, name: "To do" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ready to invoice, 3 visits" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Waiting on payment, 1 invoice" })).toBeTruthy();
    // Drafts and the old per-invoice groups are no longer on Home.
    expect(screen.queryByText("Not sent yet")).toBeNull();
    expect(screen.queryByText("INV-0003", { exact: false })).toBeNull();
  });

  it("is all caught up when there's nothing to do", () => {
    const store = new DemoStore({
      ...createDemoState(),
      patients: [],
      visits: [],
      invoices: [],
      lineItems: [],
    });
    renderApp("/", store);
    expect(screen.getByText("You're all caught up")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "To do" })).toBeNull();
  });

  it("finds patients as you type and replaces the recent chips", async () => {
    const { user } = renderApp();
    await user.type(screen.getByRole("searchbox", { name: "Search patients" }), "jor");
    const results = within(screen.getByRole("list", { name: "Matching patients" }));
    expect(results.getAllByRole("listitem")).toHaveLength(1);
    expect(results.getByText("Jordan Sample")).toBeTruthy();
    expect(results.getByText("Shoulder rehab")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Recent patients" })).toBeNull();
  });

  it("says when no patient matches", async () => {
    const { user } = renderApp();
    await user.type(screen.getByRole("searchbox", { name: "Search patients" }), "  zed ");
    expect(screen.getByText("No patients match “zed”.")).toBeTruthy();
  });

  it("brings the recent chips back when the search is cleared", async () => {
    const { user } = renderApp();
    const search = screen.getByRole("searchbox", { name: "Search patients" });
    await user.type(search, "jor");
    await user.clear(search);
    expect(screen.getByRole("list", { name: "Recent patients" })).toBeTruthy();
  });

  describe("opening things", () => {
    it("opens a patient from the search results", async () => {
      const { user, router } = renderApp();
      await user.type(screen.getByRole("searchbox", { name: "Search patients" }), "jor");
      const results = within(screen.getByRole("list", { name: "Matching patients" }));
      await user.click(results.getByRole("button", { name: /^Jordan Sample/ }));
      expect(router.state.location.pathname).toBe(`/patients/${JORDAN}`);
      expect(screen.getByRole("heading", { level: 1, name: "Jordan Sample" })).toBeTruthy();
    });

    it("opens a patient from a recent patient chip", async () => {
      const { user, router } = renderApp();
      const rows = within(screen.getByRole("list", { name: "Recent patients" }));
      await user.click(rows.getByRole("button", { name: /^Riley Placeholder/ }));
      expect(router.state.location.pathname).toBe(`/patients/${RILEY}`);
    });
  });

  it("opens the Ready to invoice list from its card when several patients are waiting", async () => {
    const state = createDemoState();
    expect(readyPatients(state.patients, state.visits).length).toBeGreaterThan(1);
    const { user } = renderApp();
    await user.click(screen.getByRole("button", { name: "Ready to invoice, 3 visits" }));
    expect(screen.getByRole("heading", { level: 1, name: "Ready to invoice" })).toBeTruthy();
  });

  it("opens the one waiting patient's page from the Ready to invoice card", async () => {
    const state = createDemoState();
    const [first] = readyPatients(state.patients, state.visits);
    const visits = state.visits.filter(
      (visit) => visit.patientId === first?.patient.id || visit.invoiceId !== null,
    );
    const { user } = renderApp("/", new DemoStore({ ...state, visits }));
    await user.click(screen.getByRole("button", { name: /^Ready to invoice, / }));
    expect(
      screen.getByRole("heading", { level: 1, name: first?.patient.fullName ?? "" }),
    ).toBeTruthy();
  });

  it("keeps the cards as counts only when there's nothing to open", () => {
    const state = createDemoState();
    const visits = state.visits.filter((visit) => visit.invoiceId !== null);
    renderApp("/", new DemoStore({ ...state, visits }));
    expect(screen.getByRole("group", { name: "Ready to invoice, 0 visits" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Waiting on payment, 1 invoice" })).toBeTruthy();
  });
});
