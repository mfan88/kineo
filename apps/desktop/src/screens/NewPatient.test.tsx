import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "../test/render";

/** Fills in the email and phone every new patient needs (made-up values). */
async function fillContact(user: ReturnType<typeof renderApp>["user"], prefix = "") {
  await user.type(
    screen.getByRole("textbox", { name: new RegExp(`^${prefix}Email`, "i") }),
    "sky@example.com",
  );
  await user.type(
    screen.getByRole("textbox", { name: new RegExp(`^${prefix}Phone`, "i") }),
    "604-555-0100",
  );
}

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
    await fillContact(user);
    await user.click(screen.getByRole("button", { name: "Add patient" }));

    const added = store.getState().patients.find((p) => p.fullName === "Sky Example");
    expect(added).toMatchObject({
      reasonForVisit: "Knee pain",
      email: "sky@example.com",
      emailOnInvoice: false,
      phone: "604-555-0100",
      phoneOnInvoice: false,
      isChild: false,
      parentNames: [],
      customDetails: [],
      detailsRequired: true,
    });
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

    expect(screen.getByText("Add the patient's name.")).toBeTruthy();
    expect(store.getState().patients).toHaveLength(4);

    await user.type(screen.getByRole("textbox", { name: /Full name/ }), "Sky");
    expect(screen.queryByText("Add the patient's name.")).toBeNull();
  });

  it("needs an email and phone, says so under each, and clears each as it's typed", async () => {
    const { user, store } = renderApp("/patients/new");
    await user.type(screen.getByRole("textbox", { name: /Full name/ }), "Sky Example");
    await user.click(screen.getByRole("button", { name: "Add patient" }));

    expect(screen.getByText("Add an email so you can reach this patient.")).toBeTruthy();
    expect(screen.getByText("Add a phone number so you can reach this patient.")).toBeTruthy();
    expect(store.getState().patients).toHaveLength(4);

    await user.type(screen.getByRole("textbox", { name: /^Email/ }), "not-an-email");
    expect(screen.queryByText("Add an email so you can reach this patient.")).toBeNull();
    expect(screen.getByText("Add a phone number so you can reach this patient.")).toBeTruthy();
    await user.type(screen.getByRole("textbox", { name: /^Phone/ }), "604-555-0100");
    await user.click(screen.getByRole("button", { name: "Add patient" }));
    expect(screen.getByText("Enter an email like name@example.com.")).toBeTruthy();
    expect(store.getState().patients).toHaveLength(4);
  });

  it("asks for a child's parents, adds and removes them, and saves the shown ones", async () => {
    const { user, store } = renderApp("/patients/new");
    await user.type(screen.getByRole("textbox", { name: /Full name/ }), "Sky Example");
    expect(screen.queryByRole("textbox", { name: "Parent name" })).toBeNull();
    await user.click(screen.getByRole("switch", { name: "Patient is a child" }));

    // One parent to start with, and no way to remove the last one.
    const parents = within(screen.getByRole("group", { name: "Parents" }));
    expect(parents.getByRole("textbox", { name: "Parent name" })).toBeTruthy();
    expect(parents.queryByRole("button", { name: "Remove parent" })).toBeNull();
    expect(screen.getByRole("textbox", { name: /^Parent email/ })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: /^Parent phone/ })).toBeTruthy();

    await fillContact(user, "Parent ");
    await user.click(screen.getByRole("button", { name: "Add patient" }));
    expect(screen.getByText("Add a parent's name.")).toBeTruthy();

    await user.type(parents.getByRole("textbox", { name: "Parent name" }), "Robin Example");
    await user.click(parents.getByRole("button", { name: "Add parent" }));
    await user.type(parents.getByRole("textbox", { name: "Parent name 2" }), "Ash Example");
    await user.click(parents.getByRole("button", { name: "Add parent" }));
    expect(parents.getAllByRole("button", { name: "Remove parent" })).toHaveLength(3);
    await user.click(parents.getAllByRole("button", { name: "Remove parent" })[2]!);
    await user.click(parents.getByRole("button", { name: "Add parent" }));
    await user.click(parents.getByRole("button", { name: "Add parent" }));
    // Four at most.
    expect(parents.queryByRole("button", { name: "Add parent" })).toBeNull();
    await user.click(screen.getByRole("switch", { name: "Show parent names on invoice" }));
    await user.click(screen.getByRole("button", { name: "Add patient" }));

    const added = store.getState().patients.find((p) => p.fullName === "Sky Example");
    expect(added).toMatchObject({
      isChild: true,
      parentNames: ["Robin Example", "Ash Example"],
      parentNamesOnInvoice: true,
    });
  });

  it("drops the parents when the child switch is turned off again", async () => {
    const { user, store } = renderApp("/patients/new");
    await user.type(screen.getByRole("textbox", { name: /Full name/ }), "Sky Example");
    await user.click(screen.getByRole("switch", { name: "Patient is a child" }));
    await user.type(screen.getByRole("textbox", { name: "Parent name" }), "Robin Example");
    await user.click(screen.getByRole("switch", { name: "Patient is a child" }));
    expect(screen.queryByRole("textbox", { name: "Parent name" })).toBeNull();
    await fillContact(user);
    await user.click(screen.getByRole("button", { name: "Add patient" }));

    const added = store.getState().patients.find((p) => p.fullName === "Sky Example");
    expect(added).toMatchObject({ isChild: false, parentNames: [] });
  });

  it("adds and removes custom details, each needing a label and value", async () => {
    const { user, store } = renderApp("/patients/new");
    await user.type(screen.getByRole("textbox", { name: /Full name/ }), "Sky Example");
    await fillContact(user);
    await user.click(screen.getByRole("button", { name: "Add detail" }));
    await user.click(screen.getByRole("button", { name: "Add detail" }));
    await user.type(
      screen.getByRole("textbox", { name: "Label for detail 1" }),
      "Referring doctor",
    );
    await user.click(screen.getByRole("button", { name: "Add patient" }));
    expect(screen.getByText("Give each detail a label and a value.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Remove detail 2" }));
    expect(screen.queryByRole("textbox", { name: "Label for detail 2" })).toBeNull();
    await user.type(screen.getByRole("textbox", { name: "Value for detail 1" }), "Dr. Example");
    await user.click(screen.getByRole("switch", { name: "Show detail 1 on invoice" }));
    await user.click(screen.getByRole("switch", { name: "Show email on invoice" }));
    await user.click(screen.getByRole("button", { name: "Add patient" }));

    const added = store.getState().patients.find((p) => p.fullName === "Sky Example");
    expect(added?.emailOnInvoice).toBe(true);
    expect(added?.customDetails).toEqual([
      expect.objectContaining({
        label: "Referring doctor",
        value: "Dr. Example",
        showOnInvoice: true,
      }),
    ]);
  });

  it("has a back arrow and only one primary button", () => {
    renderApp("/patients/new");
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Add patient" })).toHaveLength(1);
  });
});
