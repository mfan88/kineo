import { formatEdited } from "@kineo/shared";
import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoState, DemoStore } from "../data/store";
import { renderApp } from "../test/render";

// Made-up demo patients.
const morgan = "5eed0000-0000-4000-8000-000000000201";
const casey = "5eed0000-0000-4000-8000-000000000202";
const jordan = "5eed0000-0000-4000-8000-000000000203";
const riley = "5eed0000-0000-4000-8000-000000000204";

beforeEach(() => {
  // Only the date is faked (to Thursday 12 November 2026), so typing and clicking carry on as normal.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 12, 10, 42));
});
afterEach(() => {
  vi.useRealTimers();
});

function visitItem(date: string) {
  return within(screen.getByRole("listitem", { name: date }));
}

function noteBox() {
  return screen.getByRole("textbox", { name: "Today, 12 November" });
}

/** The note box's own buttons (older visits have Add to note and Replace note too). */
function noteSection() {
  return within(screen.getByRole("region", { name: "Today's note" }));
}

/** A store where `patientId` already has a note saved today. */
function storeWithTodaysNote(patientId: string, note = "Morning session.") {
  const store = new DemoStore(createDemoState());
  const visit = store.saveVisit(patientId, note);
  return { store, visit };
}

describe("Patient: the note box", () => {
  it("shows the name with when they were last seen and why", () => {
    renderApp(`/patients/${jordan}`);
    expect(screen.getByRole("heading", { level: 1, name: "Jordan Sample" })).toBeTruthy();
    expect(screen.getByText("Last visit 4 Nov · Shoulder rehab")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
  });

  it("has a note box titled with today's date, and no Copy last note or Clear", () => {
    renderApp(`/patients/${jordan}`);
    expect(noteBox()).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save note" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Copy last note" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
    expect(screen.queryByText(/Saved on this device/)).toBeNull();
  });

  it("says when there are no visits yet", () => {
    const state = createDemoState();
    const store = new DemoStore({
      ...state,
      visits: state.visits.filter((v) => v.patientId !== jordan),
    });
    renderApp(`/patients/${jordan}`, store);
    expect(screen.getByText("No visits yet. Today's note will be the first.")).toBeTruthy();
    expect(screen.queryByText(/^Last visit/)).toBeNull();
    expect(screen.getByText("Shoulder rehab")).toBeTruthy();
  });

  it("saves the note as today's visit, confirms it, and then shows when it was edited", async () => {
    const { user, store } = renderApp(`/patients/${morgan}`);
    await user.type(noteBox(), "Made-up note for today.");
    await user.click(screen.getByRole("button", { name: "Save note" }));

    const saved = store.getState().visits.at(-1);
    expect(saved).toMatchObject({
      patientId: morgan,
      visitDate: "2026-11-12",
      note: "Made-up note for today.",
      invoiceId: null,
    });
    expect(await screen.findByText("Note saved")).toBeTruthy();
    expect(noteBox()).toHaveProperty("value", "");
    expect(visitItem("Today, 12 Nov").getByText("Made-up note for today.")).toBeTruthy();
    expect(
      screen.getByText(
        `Saved on this device · ${formatEdited(saved?.noteEditedAt ?? "").toLowerCase()}`,
      ),
    ).toBeTruthy();
    // Save note stays filled, as in the storyboard, next to Replace note.
    expect(noteSection().getByRole("button", { name: "Save note" })).toBeTruthy();
  });

  it("won't save an empty note and says what to do", async () => {
    const { user, store } = renderApp(`/patients/${morgan}`);
    await user.type(noteBox(), "   ");
    await user.click(screen.getByRole("button", { name: "Save note" }));
    expect(screen.getByRole("alert").textContent).toBe("Write a note before saving the visit.");
    expect(store.getState().visits).toHaveLength(7);

    await user.type(noteBox(), "x");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("replaces the latest visit's note with the typed text", async () => {
    const { store, visit } = storeWithTodaysNote(morgan);
    const { user } = renderApp(`/patients/${morgan}`, store);
    await user.type(noteBox(), "Rewritten.");
    await user.click(noteSection().getByRole("button", { name: "Replace note" }));
    expect(store.getState().visits.find((v) => v.id === visit.id)?.note).toBe("Rewritten.");
    expect(await screen.findByText("Note saved")).toBeTruthy();
    expect(noteBox()).toHaveProperty("value", "");
  });

  it("before anything is saved today, Replace note changes the last visit", async () => {
    const { user, store } = renderApp(`/patients/${jordan}`);
    await user.type(noteBox(), "Rewritten.");
    await user.click(noteSection().getByRole("button", { name: "Replace note" }));
    // Jordan's newest visit is 4 Nov.
    const newest = store
      .getState()
      .visits.filter((v) => v.patientId === jordan)
      .toSorted((a, b) => b.visitDate.localeCompare(a.visitDate))[0];
    expect(newest?.note).toBe("Rewritten.");
  });

  it("needs text before Replace note works, and has nothing to replace for a new patient", () => {
    renderApp(`/patients/${jordan}`);
    expect(noteSection().getByRole("button", { name: "Replace note" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("can't replace a note that's locked on a paid invoice", async () => {
    const state = createDemoState();
    const store = new DemoStore({
      ...state,
      visits: state.visits.filter((v) => v.patientId !== morgan || v.visitDate === "2026-10-01"),
    });
    const { user } = renderApp(`/patients/${morgan}`, store);
    await user.type(noteBox(), "x");
    expect(noteSection().getByRole("button", { name: "Replace note" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("goes Home for a patient that doesn't exist", () => {
    const { router } = renderApp("/patients/missing");
    expect(router.state.location.pathname).toBe("/");
  });
});

describe("Patient: visits", () => {
  it("lists visits newest first with their invoice status and a line of the note", () => {
    renderApp(`/patients/${morgan}`);
    const items = within(screen.getByRole("list", { name: "Visits" })).getAllByRole("listitem");
    expect(items.map((item) => item.getAttribute("aria-label"))).toEqual([
      "22 Oct",
      "15 Oct",
      "1 Oct",
    ]);
    expect(visitItem("22 Oct").getByText("Waiting on payment")).toBeTruthy();
    expect(visitItem("22 Oct").getByText("Made-up note.")).toBeTruthy();
    expect(visitItem("1 Oct").getByText("Paid")).toBeTruthy();
  });

  it("says when a visit has no note", () => {
    renderApp(`/patients/${riley}`);
    expect(visitItem("6 Nov").getByText("No note.")).toBeTruthy();
  });

  it("tags a visit on a draft invoice", () => {
    renderApp(`/patients/${casey}`);
    expect(visitItem("3 Nov").getByText("Draft")).toBeTruthy();
  });

  it("tags visits not on an invoice", () => {
    renderApp(`/patients/${jordan}`);
    expect(screen.getAllByText("Not invoiced")).toHaveLength(2);
  });

  it("adds the note box text to an earlier visit's note", async () => {
    const { user, store } = renderApp(`/patients/${morgan}`);
    await user.type(noteBox(), "Added later.");
    await user.click(visitItem("22 Oct").getByRole("button", { name: "Add to note" }));

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
    await user.click(visitItem("15 Oct").getByRole("button", { name: "Replace note" }));
    const visit = store
      .getState()
      .visits.find((v) => v.id === "5eed0000-0000-4000-8000-000000000402");
    expect(visit?.note).toBe("Rewritten.");
  });

  it("needs text in the note box before adding or replacing", () => {
    renderApp(`/patients/${morgan}`);
    const item = visitItem("22 Oct");
    expect(item.getByRole("button", { name: "Add to note" })).toHaveProperty("disabled", true);
    expect(item.getByRole("button", { name: "Replace note" })).toHaveProperty("disabled", true);
  });

  it("locks the note on a paid visit", () => {
    renderApp(`/patients/${morgan}`);
    const paid = visitItem("1 Oct");
    expect(paid.getByText(/locked/)).toBeTruthy();
    expect(paid.queryByRole("button", { name: "Add to note" })).toBeNull();
    expect(paid.queryByRole("button", { name: "Replace note" })).toBeNull();
  });
});

describe("Patient: Create invoice", () => {
  it("sits at the top right with the number of visits, and makes a new draft", async () => {
    const { user, store, router } = renderApp(`/patients/${jordan}`);
    await user.click(screen.getByRole("button", { name: "Create invoice (2 visits)" }));
    // Creating the invoice is async; the screen moves on once it's done.
    expect(await screen.findByRole("heading", { level: 1, name: "INV-0004" })).toBeTruthy();

    const invoice = store.getState().invoices.at(-1);
    expect(invoice).toMatchObject({ patientId: jordan, status: "draft", number: 4 });
    const onIt = store.getState().visits.filter((v) => v.invoiceId === invoice?.id);
    expect(onIt).toHaveLength(2);
    expect(router.state.location.pathname).toBe(`/invoices/${invoice?.id ?? ""}`);
  });

  it("uses the singular for one visit", () => {
    renderApp(`/patients/${riley}`);
    expect(screen.getByRole("button", { name: "Create invoice (1 visit)" })).toBeTruthy();
  });

  it("is hidden when every visit is invoiced", () => {
    renderApp(`/patients/${morgan}`);
    expect(screen.queryByRole("button", { name: /^Create invoice/ })).toBeNull();
  });

  it("counts a note just saved today", async () => {
    const { user } = renderApp(`/patients/${morgan}`);
    await user.type(noteBox(), "New.");
    await user.click(screen.getByRole("button", { name: "Save note" }));
    expect(await screen.findByRole("button", { name: "Create invoice (1 visit)" })).toBeTruthy();
  });
});

const billing = () => within(screen.getByRole("region", { name: "Billing" }));

describe("Patient: Billing", () => {
  const icbc = "5eed0000-0000-4000-8000-000000000703";
  const icbcClaim = "5eed0000-0000-4000-8000-000000000704";
  const caseyFunding = "5eed0000-0000-4000-8000-000000000801";

  it("shows the funding with its number, period and who invoices go to, above the visits", () => {
    renderApp(`/patients/${casey}`);
    const card = billing();
    expect(card.getByRole("heading", { name: "Billing" })).toBeTruthy();
    const funding = within(card.getByRole("group", { name: "Autism Funding" }));
    expect(funding.getByText("Autism Funding")).toBeTruthy();
    expect(funding.getByText("Billing number")).toBeTruthy();
    expect(funding.getByText("4821")).toBeTruthy();
    expect(
      funding.getByText(
        "1 Apr 2026 \u2013 31 Mar 2027 \u00b7 invoices go to Autism Funding Branch, Ministry of Children and Family Development",
      ),
    ).toBeTruthy();
    expect(card.queryByText("Self-pay")).toBeNull();
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings.indexOf("Billing")).toBeLessThan(headings.indexOf("Visits"));
  });

  it("starts the line with a capital when there's no period", () => {
    const state = createDemoState();
    const store = new DemoStore({
      ...state,
      patientFundings: state.patientFundings.map((f) => ({
        ...f,
        periodStart: null,
        periodEnd: null,
      })),
    });
    renderApp(`/patients/${casey}`, store);
    expect(
      billing().getByText(
        "Invoices go to Autism Funding Branch, Ministry of Children and Family Development",
      ),
    ).toBeTruthy();
  });

  it("says a patient with no funding is self-pay, and who invoices go to", () => {
    renderApp(`/patients/${morgan}`);
    expect(billing().getByText("Self-pay")).toBeTruthy();
    expect(billing().getByText("Invoices go to Morgan Testcase.")).toBeTruthy();
    expect(billing().queryByRole("button", { name: /^Edit/ })).toBeNull();
    expect(billing().getByRole("button", { name: "Add funding" })).toBeTruthy();
  });

  it("explains what happens with one funding", () => {
    renderApp(`/patients/${casey}`);
    expect(
      billing().getByText("No other funding. Self-pay applies if this one ends."),
    ).toBeTruthy();
    expect(billing().queryByText("You pick who to bill on each invoice.")).toBeNull();
  });

  it("says nothing in the footer for a self-pay patient", () => {
    renderApp(`/patients/${morgan}`);
    expect(billing().queryByText(/^No other funding/)).toBeNull();
    expect(billing().queryByText(/^You pick who/)).toBeNull();
  });

  it("says you pick who to bill on each invoice when there are two fundings", () => {
    const state = createDemoState();
    const [first] = state.patientFundings;
    if (!first) throw new Error("The demo has no patient funding.");
    const store = new DemoStore({
      ...state,
      patientFundings: [
        first,
        {
          ...first,
          id: "5eed0000-0000-4000-8000-000000000802",
          fundingTypeId: icbc,
          detailValues: { [icbcClaim]: "K1" },
        },
      ],
    });
    renderApp(`/patients/${casey}`, store);
    expect(billing().getByText("You pick who to bill on each invoice.")).toBeTruthy();
    expect(billing().getAllByRole("button", { name: /^Edit / })).toHaveLength(2);
  });

  it("ends a funding with a toast that offers Undo, and Undo brings it back", async () => {
    const { user, store } = renderApp(`/patients/${casey}`);
    await user.click(billing().getByRole("button", { name: "End Autism Funding" }));
    expect(await screen.findByText("Funding ended")).toBeTruthy();
    expect(store.getState().patientFundings[0]).toMatchObject({
      id: caseyFunding,
      endedOn: "2026-11-12",
    });
    // Now self-pay, with the ended funding listed.
    expect(billing().getByText("Self-pay")).toBeTruthy();
    expect(billing().getByText("Ended 12 Nov 2026")).toBeTruthy();

    await user.click(await screen.findByRole("button", { name: "Undo" }));
    expect(store.getState().patientFundings[0]?.endedOn).toBeNull();
    expect(billing().getByRole("group", { name: "Autism Funding" })).toBeTruthy();
  });

  it("opens the dialog to add a funding, or to edit one", async () => {
    const { user } = renderApp(`/patients/${casey}`);
    await user.click(billing().getByRole("button", { name: "Add funding" }));
    expect(
      await screen.findByRole("dialog", { name: "Add funding for Casey Fictional" }),
    ).toBeTruthy();
    await user.keyboard("{Escape}");
    await user.click(billing().getByRole("button", { name: "Edit Autism Funding" }));
    expect(
      await screen.findByRole("dialog", { name: "Edit funding for Casey Fictional" }),
    ).toBeTruthy();
  });
});
