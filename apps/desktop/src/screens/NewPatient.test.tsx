import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "../test/render";

describe("New patient", () => {
  it("opens from Home's no-match search with the name filled in", async () => {
    const { user, router } = renderApp();
    await user.type(screen.getByRole("searchbox", { name: "Search patients" }), " Sky Example ");
    await user.click(screen.getByRole("button", { name: "Add “Sky Example” as a new patient" }));

    expect(router.state.location.pathname).toBe("/patients/new");
    expect(screen.getByRole("heading", { level: 1, name: "New patient" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: /Full name/ })).toHaveProperty(
      "value",
      "Sky Example",
    );
  });

  it("adds the patient, confirms it and moves on to their screen", async () => {
    const { user, router, store } = renderApp("/patients/new");
    await user.type(screen.getByRole("textbox", { name: /Full name/ }), "Sky Example");
    await user.type(
      screen.getByRole("textbox", { name: "Reason for visit (optional)" }),
      "Knee pain",
    );
    await user.click(screen.getByRole("button", { name: "Add patient" }));

    const added = store.getState().patients.find((p) => p.fullName === "Sky Example");
    expect(added?.reasonForVisit).toBe("Knee pain");
    expect(await screen.findByText("Patient added")).toBeTruthy();
    expect(router.state.location.pathname).toBe(`/patients/${added?.id ?? ""}`);
    // The patient's page draws just after the move; wait for it.
    expect(await screen.findByRole("heading", { level: 1, name: "Sky Example" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: /^Today, \d+ \w+$/ })).toBeTruthy();
  });

  it("needs a full name and says so under the field", async () => {
    const { user, store } = renderApp("/patients/new");
    await user.type(screen.getByRole("textbox", { name: /Full name/ }), "   ");
    await user.click(screen.getByRole("button", { name: "Add patient" }));

    expect(screen.getByText("Add the patient's full name.")).toBeTruthy();
    expect(store.getState().patients).toHaveLength(4);

    await user.type(screen.getByRole("textbox", { name: /Full name/ }), "Sky");
    expect(screen.queryByText("Add the patient's full name.")).toBeNull();
  });

  it("has a back arrow and only one primary button", () => {
    renderApp("/patients/new");
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Add patient" })).toHaveLength(1);
  });
});
