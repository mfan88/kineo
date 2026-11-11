import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createDemoState, DemoStore } from "../data/store";
import { renderApp } from "../test/render";

// Made-up demo patients.
const morgan = "5eed0000-0000-4000-8000-000000000201";
const riley = "5eed0000-0000-4000-8000-000000000204";
const jordan = "5eed0000-0000-4000-8000-000000000203";

function visitItem(date: string) {
  return within(screen.getByRole("listitem", { name: date }));
}

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

describe("Patient, part 2", () => {
  const casey = "5eed0000-0000-4000-8000-000000000202";

  it("lists visits newest first with their invoice status", () => {
    renderApp(`/patients/${morgan}`);
    const items = within(screen.getByRole("list", { name: "Visits" })).getAllByRole("listitem");
    expect(items.map((item) => item.getAttribute("aria-label"))).toEqual([
      "Thu, October 22, 2026",
      "Thu, October 15, 2026",
      "Thu, October 1, 2026",
    ]);
    expect(visitItem("Thu, October 22, 2026").getByText("Sent")).toBeTruthy();
    expect(visitItem("Thu, October 1, 2026").getByText("Paid")).toBeTruthy();
  });

  it("tags a visit on a draft invoice", () => {
    renderApp(`/patients/${casey}`);
    expect(visitItem("Tue, November 3, 2026").getByText("Draft")).toBeTruthy();
  });

  it("tags visits not on an invoice", () => {
    renderApp(`/patients/${jordan}`);
    expect(screen.getAllByText("Not invoiced")).toHaveLength(2);
  });

  it("adds the note box text to an earlier visit's note", async () => {
    const { user, store } = renderApp(`/patients/${morgan}`);
    await user.type(noteBox(), "Added later.");
    await user.click(
      visitItem("Thu, October 22, 2026").getByRole("button", { name: "Add to note" }),
    );

    const visit = store
      .getState()
      .visits.find((v) => v.id === "5eed0000-0000-4000-8000-000000000403");
    expect(visit?.note).toBe("Made-up note.\n\nAdded later.");
    expect(await screen.findByText("Note saved")).toBeTruthy();
    expect(noteBox()).toHaveProperty("value", "");
  });

  it("replaces an earlier visit's note with the note box text", async () => {
    const { user, store } = renderApp(`/patients/${morgan}`);
    await user.type(noteBox(), "Rewritten.");
    await user.click(
      visitItem("Thu, October 15, 2026").getByRole("button", { name: "Replace note" }),
    );
    const visit = store
      .getState()
      .visits.find((v) => v.id === "5eed0000-0000-4000-8000-000000000402");
    expect(visit?.note).toBe("Rewritten.");
  });

  it("needs text in the note box before adding or replacing", () => {
    renderApp(`/patients/${morgan}`);
    const item = visitItem("Thu, October 22, 2026");
    expect(item.getByRole("button", { name: "Add to note" })).toHaveProperty("disabled", true);
    expect(item.getByRole("button", { name: "Replace note" })).toHaveProperty("disabled", true);
  });

  it("locks the note on a paid visit", () => {
    renderApp(`/patients/${morgan}`);
    const paid = visitItem("Thu, October 1, 2026");
    expect(paid.queryByRole("button", { name: "Add to note" })).toBeNull();
    expect(paid.queryByRole("button", { name: "Replace note" })).toBeNull();
    expect(paid.getByText("This note is on a paid invoice and can't be changed.")).toBeTruthy();
  });

  it("invoices the visits not yet on an invoice as a new draft", async () => {
    const { user, store, router } = renderApp(`/patients/${jordan}`);
    await user.click(screen.getByRole("button", { name: "Invoice 2 visits" }));

    const invoice = store.getState().invoices.at(-1);
    expect(invoice).toMatchObject({ patientId: jordan, status: "draft", number: 4 });
    const onIt = store.getState().visits.filter((v) => v.invoiceId === invoice?.id);
    expect(onIt).toHaveLength(2);
    expect(router.state.location.pathname).toBe(`/invoices/${invoice?.id ?? ""}`);
    expect(screen.getByRole("heading", { level: 1, name: "Invoice INV-0004" })).toBeTruthy();
  });

  it("uses the singular for one visit", () => {
    renderApp(`/patients/${riley}`);
    expect(screen.getByRole("button", { name: "Invoice 1 visit" })).toBeTruthy();
  });

  it("hides the button when every visit is invoiced", () => {
    renderApp(`/patients/${morgan}`);
    expect(screen.queryByRole("button", { name: /^Invoice \d/ })).toBeNull();
  });
});
