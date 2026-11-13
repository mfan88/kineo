import { readyPatients } from "@kineo/shared";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createDemoState, DemoStore } from "../data/store";
import { renderApp } from "../test/render";

describe("Ready to invoice", () => {
  it("lists patients with visits waiting, the one waiting longest first, with their counts", () => {
    const state = createDemoState();
    renderApp("/ready-to-invoice");
    const rows = within(
      screen.getByRole("list", { name: "Patients ready to invoice" }),
    ).getAllByRole("button");
    expect(rows.map((row) => row.getAttribute("aria-label"))).toEqual(
      readyPatients(state.patients, state.visits).map(
        ({ patient, visitCount }) =>
          `${patient.fullName}, ${visitCount} ${visitCount === 1 ? "visit" : "visits"}`,
      ),
    );
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
  });

  it("opens a patient's page, where Create invoice starts the draft", async () => {
    const state = createDemoState();
    const [first] = readyPatients(state.patients, state.visits);
    const { user } = renderApp("/ready-to-invoice");
    await user.click(
      screen.getByRole("button", { name: new RegExp(`^${first?.patient.fullName}`) }),
    );
    expect(
      screen.getByRole("heading", { level: 1, name: first?.patient.fullName ?? "" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Create invoice/ })).toBeTruthy();
  });

  it("is all caught up when every visit is invoiced", () => {
    const state = createDemoState();
    const visits = state.visits.filter((visit) => visit.invoiceId !== null);
    renderApp("/ready-to-invoice", new DemoStore({ ...state, visits }));
    expect(screen.getByText("You're all caught up")).toBeTruthy();
  });
});
