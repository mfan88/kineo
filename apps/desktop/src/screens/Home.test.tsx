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

function emptyStore(overrides: Partial<ReturnType<typeof createDemoState>> = {}) {
  return new DemoStore({
    ...createDemoState(),
    patients: [],
    visits: [],
    invoices: [],
    lineItems: [],
    ...overrides,
  });
}

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
    expect(screen.getByRole("button", { name: "Waiting on payment, 1 invoice" })).toBeTruthy();
    // Drafts and the old per-invoice groups are no longer on Home.
    expect(screen.queryByText("Not sent yet")).toBeNull();
    expect(screen.queryByText("INV-0003", { exact: false })).toBeNull();
  });

  it("is all caught up when there's nothing to do", () => {
    const state = createDemoState();
    const store = new DemoStore({
      ...state,
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

  it("keeps Ready to invoice as a count only when there's nothing to invoice", () => {
    const state = createDemoState();
    const visits = state.visits.filter((visit) => visit.invoiceId !== null);
    renderApp("/", new DemoStore({ ...state, visits }));
    expect(screen.getByRole("group", { name: "Ready to invoice, 0 visits" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Waiting on payment, 1 invoice" })).toBeTruthy();
  });

  it("opens the Waiting on payment group of Invoices from its card", async () => {
    const { user, router } = renderApp();
    await user.click(screen.getByRole("button", { name: "Waiting on payment, 1 invoice" }));
    expect(router.state.location.pathname).toBe("/invoices");
    expect(router.state.location.search).toBe("?group=waiting");
    expect(
      screen
        .getByRole("button", { name: "Waiting on payment, 1 invoice" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("no longer has See all invoices; the tab bar leads to Invoices", () => {
    renderApp();
    expect(screen.queryByRole("button", { name: "See all invoices" })).toBeNull();
    expect(
      within(screen.getByRole("navigation", { name: "Main" })).getByRole("link", {
        name: "Invoices",
      }),
    ).toBeTruthy();
  });

  describe("adding patients", () => {
    it("offers a quiet Add patient button beside search once there are patients", async () => {
      const { user, router } = renderApp();
      await user.click(screen.getByRole("button", { name: "Add patient" }));
      expect(router.state.location.pathname).toBe("/patients/new");
    });

    it("shows an empty state with one primary Add patient button when there are no patients", async () => {
      const { user, router } = renderApp("/", emptyStore());
      expect(screen.getByRole("heading", { level: 2, name: "No patients yet" })).toBeTruthy();
      expect(screen.getByText("Add your first patient to start a note.")).toBeTruthy();
      expect(screen.queryByRole("heading", { name: "Recent" })).toBeNull();
      expect(screen.queryByRole("heading", { name: "To do" })).toBeNull();
      expect(screen.queryByText("You're all caught up")).toBeNull();
      expect(screen.getAllByRole("button", { name: "Add patient" })).toHaveLength(1);
      await user.click(screen.getByRole("button", { name: "Add patient" }));
      expect(router.state.location.pathname).toBe("/patients/new");
    });

    it("lists only what is missing before sending an invoice", async () => {
      const demo = createDemoState();
      const emptyProfile = {
        ...demo.profile,
        fullName: { ...demo.profile.fullName, value: "", showOnInvoice: true },
      };
      const { user, router } = renderApp(
        "/",
        emptyStore({ profile: emptyProfile, priceItems: [] }),
      );
      expect(screen.getByText(/Before you send an invoice:/).textContent).toBe(
        "Before you send an invoice: Fill in your profile · Add a price list item",
      );
      await user.click(screen.getByRole("button", { name: "Add a price list item" }));
      expect(router.state.location.pathname).toBe("/settings/price-list");
    });

    it("links to the profile when only that is missing, and shows nothing when all is set", async () => {
      const demo = createDemoState();
      const emptyProfile = {
        ...demo.profile,
        fullName: { ...demo.profile.fullName, value: "", showOnInvoice: true },
      };
      const first = renderApp("/", emptyStore({ profile: emptyProfile }));
      expect(screen.queryByRole("button", { name: "Add a price list item" })).toBeNull();
      await first.user.click(screen.getByRole("button", { name: "Fill in your profile" }));
      expect(first.router.state.location.pathname).toBe("/settings/profile");
    });

    it("hides the missing-items line when the profile and price list are done", () => {
      renderApp("/", emptyStore());
      expect(screen.queryByText(/Before you send an invoice:/)).toBeNull();
    });

    it("still offers to add a searched name as a new patient", async () => {
      const { user, router } = renderApp();
      await user.type(screen.getByRole("searchbox", { name: "Search patients" }), "zed");
      await user.click(screen.getByRole("button", { name: "Add “zed” as a new patient" }));
      expect(router.state.location.pathname).toBe("/patients/new");
    });
  });

  it("keeps Waiting on payment as a count only when nothing is waiting", () => {
    const state = createDemoState();
    const invoices = state.invoices.filter((invoice) => invoice.status !== "sent");
    renderApp("/", new DemoStore({ ...state, invoices }));
    expect(screen.getByRole("group", { name: "Waiting on payment, 0 invoices" })).toBeTruthy();
  });

  it("shows No visits yet for a patient who hasn't been seen", () => {
    const state = createDemoState();
    const visits = state.visits.filter((visit) => visit.patientId !== JORDAN);
    renderApp("/", new DemoStore({ ...state, visits }));
    expect(screen.getByRole("button", { name: "Jordan Sample, No visits yet" })).toBeTruthy();
  });
});
