import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createDemoState, DemoStore } from "../data/store";
import { renderApp } from "../test/render";

// Made-up demo patients.
const morgan = "5eed0000-0000-4000-8000-000000000201";
const riley = "5eed0000-0000-4000-8000-000000000204";
const jordan = "5eed0000-0000-4000-8000-000000000203";

function noteBox() {
  return screen.getByRole("textbox", { name: "Today's note" });
}

describe("Patient, part 1", () => {
  it("shows the name, condition and last visit", () => {
    renderApp(`/patients/${jordan}`);
    expect(screen.getByRole("heading", { level: 1, name: "Jordan Sample" })).toBeTruthy();
    expect(screen.getByText("Shoulder rehab")).toBeTruthy();
    const last = within(screen.getByRole("region", { name: "Last visit" }));
    expect(last.getByText(/Last visit · Wed, November 4, 2026/)).toBeTruthy();
    expect(last.getByText("Made-up note.")).toBeTruthy();
  });

  it("says when the last visit has no note, and can't copy it", () => {
    renderApp(`/patients/${riley}`);
    expect(screen.getByText("No note was written.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy last note" })).toHaveProperty("disabled", true);
  });

  it("says when there are no visits yet", () => {
    const state = createDemoState();
    const store = new DemoStore({
      ...state,
      visits: state.visits.filter((v) => v.patientId !== jordan),
    });
    renderApp(`/patients/${jordan}`, store);
    expect(screen.getByText("No visits yet. Today's note will be the first.")).toBeTruthy();
  });

  it("saves the note as today's visit, confirms it and clears the box", async () => {
    const { user, store } = renderApp(`/patients/${morgan}`);
    await user.type(noteBox(), "Made-up note for today.");
    await user.click(screen.getByRole("button", { name: "Save as today's visit" }));

    const saved = store.getState().visits.at(-1);
    expect(saved).toMatchObject({
      patientId: morgan,
      note: "Made-up note for today.",
      invoiceId: null,
    });
    expect(await screen.findByText("Note saved")).toBeTruthy();
    expect(noteBox()).toHaveProperty("value", "");
    // The new visit is now the last visit.
    const last = within(screen.getByRole("region", { name: "Last visit" }));
    expect(last.getByText("Made-up note for today.")).toBeTruthy();
  });

  it("won't save an empty note and says what to do", async () => {
    const { user, store } = renderApp(`/patients/${morgan}`);
    await user.type(noteBox(), "   ");
    await user.click(screen.getByRole("button", { name: "Save as today's visit" }));
    expect(screen.getByRole("alert").textContent).toBe("Write a note before saving the visit.");
    expect(store.getState().visits).toHaveLength(7);

    await user.type(noteBox(), "x");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("copies the last note into the box and clears it", async () => {
    const { user } = renderApp(`/patients/${jordan}`);
    await user.click(screen.getByRole("button", { name: "Copy last note" }));
    expect(noteBox()).toHaveProperty("value", "Made-up note.");
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(noteBox()).toHaveProperty("value", "");
    expect(screen.getByRole("button", { name: "Clear" })).toHaveProperty("disabled", true);
  });

  it("goes Home for a patient that doesn't exist", () => {
    const { router } = renderApp("/patients/missing");
    expect(router.state.location.pathname).toBe("/");
  });
});
