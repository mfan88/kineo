import { formatDayMonth, formatEdited } from "@kineo/shared";
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

describe("Patient: Edit details", () => {
  it("corrects the name and reason for visit, and says so", async () => {
    const { user, store } = renderApp(`/patients/${jordan}`);
    await user.click(screen.getByRole("button", { name: "Edit details" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Edit details" }));
    const name = dialog.getByRole("textbox", { name: "Full name" });
    expect(name).toHaveProperty("value", "Jordan Sample");
    await user.clear(name);
    await user.type(name, "Jordan Samples");
    const reason = dialog.getByRole("textbox", { name: "Reason for visit (optional)" });
    await user.clear(reason);
    await user.type(reason, "Shoulder");
    await user.click(dialog.getByRole("button", { name: "Save details" }));

    expect(await screen.findByText("Patient updated")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Jordan Samples" })).toBeTruthy();
    expect(store.getState().patients.find((p) => p.id === jordan)).toMatchObject({
      fullName: "Jordan Samples",
      reasonForVisit: "Shoulder",
    });
  });

  it("won't save without a name, and Cancel changes nothing", async () => {
    const { user, store } = renderApp(`/patients/${jordan}`);
    await user.click(screen.getByRole("button", { name: "Edit details" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Edit details" }));
    await user.clear(dialog.getByRole("textbox", { name: "Full name" }));
    await user.click(dialog.getByRole("button", { name: "Save details" }));
    expect(dialog.getByText("Add the patient's full name.")).toBeTruthy();
    await user.click(dialog.getByRole("button", { name: "Cancel" }));
    expect(store.getState().patients.find((p) => p.id === jordan)?.fullName).toBe("Jordan Sample");
  });

  it("gives a draft billed to the patient the new name", async () => {
    const store = new DemoStore(createDemoState());
    const draft = store.getState().invoices.find((invoice) => invoice.status === "draft");
    if (!draft) throw new Error("No demo draft");
    const { user } = renderApp(`/patients/${draft.patientId}`, store);
    await user.click(screen.getByRole("button", { name: "Edit details" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Edit details" }));
    const name = dialog.getByRole("textbox", { name: "Full name" });
    await user.clear(name);
    await user.type(name, "Renamed Example");
    await user.click(dialog.getByRole("button", { name: "Save details" }));
    await screen.findByText("Patient updated");
    const updated = store.getState().invoices.find((invoice) => invoice.id === draft.id);
    expect(updated?.billTo).toMatchObject({ name: "Renamed Example" });
  });
});

describe("Patient: correcting visits", () => {
  it("saves a note on an earlier day, titled with that day", async () => {
    const { user, store } = renderApp(`/patients/${jordan}`);
    await user.type(noteBox(), "Written the next morning.");
    await user.click(noteSection().getByRole("button", { name: "Change date" }));
    const date = noteSection().getByRole("textbox", { name: "Visit date" });
    expect(date).toHaveProperty("value", "12 Nov 2026");
    await user.clear(date);
    await user.type(date, "11 Nov 2026");
    expect(screen.getByRole("textbox", { name: "Visit on 11 November" })).toBeTruthy();
    await user.click(noteSection().getByRole("button", { name: "Save note" }));

    expect(await screen.findByText("Note saved")).toBeTruthy();
    const saved = store.getState().visits.find((v) => v.note === "Written the next morning.");
    expect(saved?.visitDate).toBe("2026-11-11");
    // Back to today for the next note.
    expect(noteSection().getByText("Visit date: today")).toBeTruthy();
  });

  it("won't save a note dated after today, and says so at the date", async () => {
    const { user, store } = renderApp(`/patients/${jordan}`);
    const before = store.getState().visits.length;
    await user.type(noteBox(), "Too soon.");
    await user.click(noteSection().getByRole("button", { name: "Change date" }));
    const date = noteSection().getByRole("textbox", { name: "Visit date" });
    await user.clear(date);
    await user.type(date, "13 Nov 2026");
    await user.click(noteSection().getByRole("button", { name: "Save note" }));
    expect(noteSection().getByText("A visit can't be dated after today.")).toBeTruthy();
    expect(store.getState().visits).toHaveLength(before);
  });

  it("changes the date of a visit that isn't on an invoice", async () => {
    const { user, store } = renderApp(`/patients/${jordan}`);
    const visit = store
      .getState()
      .visits.find((v) => v.patientId === jordan && v.invoiceId === null);
    if (!visit) throw new Error("No uninvoiced demo visit");
    await user.click(
      screen.getByRole("button", {
        name: `Change date, ${formatDayMonth(visit.visitDate, "2026-11-12")}`,
      }),
    );
    const dialog = within(await screen.findByRole("dialog", { name: "Change date" }));
    const field = dialog.getByRole("textbox", { name: "Visit date" });
    await user.clear(field);
    await user.type(field, "1 Nov 2026");
    await user.click(dialog.getByRole("button", { name: "Save date" }));
    expect(await screen.findByText("Visit date changed")).toBeTruthy();
    expect(store.getState().visits.find((v) => v.id === visit.id)?.visitDate).toBe("2026-11-01");
  });

  it("deletes a visit that isn't on an invoice, and Undo puts it back", async () => {
    const { user, store } = renderApp(`/patients/${jordan}`);
    const visit = store
      .getState()
      .visits.find((v) => v.patientId === jordan && v.invoiceId === null);
    if (!visit) throw new Error("No uninvoiced demo visit");
    const count = store.getState().visits.length;
    const itemCount = store
      .getState()
      .visitItems.filter((item) => item.visitId === visit.id).length;
    await user.click(
      screen.getByRole("button", {
        name: `Delete visit, ${formatDayMonth(visit.visitDate, "2026-11-12")}`,
      }),
    );
    expect(await screen.findByText("Visit deleted")).toBeTruthy();
    expect(store.getState().visits).toHaveLength(count - 1);

    await user.click(screen.getByRole("button", { name: "Undo" }));
    await vi.waitFor(() => expect(store.getState().visits).toHaveLength(count));
    expect(store.getState().visits.find((v) => v.id === visit.id)).toEqual(visit);
    expect(store.getState().visitItems.filter((item) => item.visitId === visit.id)).toHaveLength(
      itemCount,
    );
  });

  it("offers neither on a visit that's on an invoice", () => {
    renderApp(`/patients/${morgan}`);
    const state = createDemoState();
    const invoiced = state.visits.filter((v) => v.patientId === morgan && v.invoiceId !== null);
    const uninvoiced = state.visits.filter((v) => v.patientId === morgan && v.invoiceId === null);
    expect(screen.queryAllByRole("button", { name: /^Delete visit, / })).toHaveLength(
      uninvoiced.length,
    );
    expect(invoiced.length).toBeGreaterThan(0);
  });
});

async function addItem(user: ReturnType<typeof renderApp>["user"], name: string) {
  await user.click(noteSection().getByRole("button", { name: "+ Add item" }));
  await user.click(await screen.findByRole("menuitem", { name: new RegExp(name) }));
}

describe("Patient: visit items", () => {
  const itemsVisitId = "5eed0000-0000-4000-8000-000000000405";

  it("saves chosen items with the note and clears them from the box", async () => {
    const { user, store } = renderApp(`/patients/${morgan}`);
    await user.type(noteBox(), "Made-up note for today.");
    await addItem(user, "Initial assessment");
    expect(noteSection().getByText("$120.00")).toBeTruthy();
    await user.click(noteSection().getByRole("button", { name: "Save note" }));

    const saved = store.getState().visits.at(-1);
    expect(await screen.findByText("Note saved")).toBeTruthy();
    const items = store.getState().visitItems.filter((item) => item.visitId === saved?.id);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      name: "Initial assessment",
      unitPriceCents: 12000,
      quantity: 1,
    });
    expect(noteSection().queryByRole("button", { name: "Remove Initial assessment" })).toBeNull();
    expect(noteSection().getByRole("button", { name: "+ Add item" })).toBeTruthy();
  });

  it("raises the quantity when the same item is added again", async () => {
    const { user } = renderApp(`/patients/${morgan}`);
    await addItem(user, "Exercise band");
    await addItem(user, "Exercise band");
    expect(noteSection().getAllByRole("listitem")).toHaveLength(1);
    expect(noteSection().getByLabelText("Quantity 2")).toBeTruthy();
  });

  it("changes the quantity with the stepper and removes a row", async () => {
    const { user } = renderApp(`/patients/${morgan}`);
    await addItem(user, "Exercise band");
    const fewer = noteSection().getByRole("button", { name: "Fewer Exercise band" });
    expect(fewer).toHaveProperty("disabled", true);
    await user.click(noteSection().getByRole("button", { name: "More Exercise band" }));
    expect(noteSection().getByLabelText("Quantity 2")).toBeTruthy();
    await user.click(noteSection().getByRole("button", { name: "Fewer Exercise band" }));
    expect(noteSection().getByLabelText("Quantity 1")).toBeTruthy();
    await user.click(noteSection().getByRole("button", { name: "Remove Exercise band" }));
    expect(noteSection().queryByRole("listitem")).toBeNull();
  });

  it("leaves items alone when replacing a note", async () => {
    const { store, visit } = storeWithTodaysNote(morgan);
    const { user } = renderApp(`/patients/${morgan}`, store);
    await user.type(noteBox(), "Rewritten.");
    await addItem(user, "Exercise band");
    await user.click(noteSection().getByRole("button", { name: "Replace note" }));
    await screen.findByText("Note saved");
    expect(store.getState().visitItems.filter((item) => item.visitId === visit.id)).toHaveLength(0);
  });

  it("points to the price list when it is empty", () => {
    const store = new DemoStore({ ...createDemoState(), priceItems: [] });
    renderApp(`/patients/${morgan}`, store);
    expect(
      noteSection().getByText(/Add items to your price list to bill them with a note\./),
    ).toBeTruthy();
    expect(noteSection().getByRole("link", { name: "Price list" }).getAttribute("href")).toBe(
      "/settings/price-list",
    );
    expect(noteSection().queryByRole("button", { name: "+ Add item" })).toBeNull();
  });

  it("shows a visit's items under its note", () => {
    renderApp(`/patients/${jordan}`);
    expect(screen.getByText("Initial assessment × 1 · Follow-up treatment × 2")).toBeTruthy();
  });

  it("edits a visit's items in a dialog and confirms it", async () => {
    const { user, store } = renderApp(`/patients/${jordan}`);
    await user.click(screen.getByRole("button", { name: "Edit items, 28 Oct" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Items for 28 Oct" }));
    expect(dialog.getByText("Follow-up treatment")).toBeTruthy();
    await user.click(dialog.getByRole("button", { name: "Remove Initial assessment" }));
    await user.click(dialog.getByRole("button", { name: "More Follow-up treatment" }));
    await user.click(dialog.getByRole("button", { name: "Save items" }));

    expect(await screen.findByText("Items saved")).toBeTruthy();
    const items = store.getState().visitItems.filter((item) => item.visitId === itemsVisitId);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: "Follow-up treatment", quantity: 3 });
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("Follow-up treatment × 3")).toBeTruthy();
  });

  it("offers no Edit items on an invoiced visit", () => {
    renderApp(`/patients/${morgan}`);
    const state = createDemoState();
    const uninvoiced = state.visits.filter((v) => v.patientId === morgan && v.invoiceId === null);
    expect(screen.queryAllByRole("button", { name: /^Edit items, / })).toHaveLength(
      uninvoiced.length,
    );
  });
});
