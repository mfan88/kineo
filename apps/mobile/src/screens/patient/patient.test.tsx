import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { formatEdited } from "@kineo/shared";
import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import {
  NEW_ID,
  patientRow,
  renderScreen,
  TEST_NOW,
  TEST_OWNER,
  visitRow,
} from "@/test/render-screen";
import { Patient } from "./index";

const mockRouter = {
  canGoBack: jest.fn<() => boolean>(),
  back: jest.fn<() => void>(),
  navigate: jest.fn<(href: unknown) => void>(),
  replace: jest.fn<(href: unknown) => void>(),
};
// jest.mock is hoisted above mockRouter, so look it up when the screen uses it.
jest.mock("expo-router", () => ({
  get router() {
    return mockRouter;
  },
  useIsFocused: () => true,
}));

beforeEach(() => {
  jest.clearAllMocks();
});

const RILEY = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const V_OLD = "aaaaaaaa-0000-4000-8000-000000000001";
const V_NEW = "aaaaaaaa-0000-4000-8000-000000000002";
const V_PAID = "aaaaaaaa-0000-4000-8000-000000000003";
const V_SENT = "aaaaaaaa-0000-4000-8000-000000000004";
const V_TODAY = "aaaaaaaa-0000-4000-8000-000000000005";
const TODAY = new Date(2026, 10, 12);
const I_PAID = "bbbbbbbb-0000-4000-8000-000000000001";
const I_SENT = "bbbbbbbb-0000-4000-8000-000000000002";

function invoiceRow(id: string, number: number, status: "draft" | "sent" | "paid") {
  return {
    id,
    owner_id: TEST_OWNER,
    patient_id: RILEY,
    number,
    status,
    tax_enabled: 0,
    tax_rate_basis_points: 0,
    sent_at: status === "draft" ? null : TEST_NOW,
    paid_at: status === "paid" ? TEST_NOW : null,
    created_at: TEST_NOW,
    updated_at: TEST_NOW,
  };
}

const PATIENTS = [
  patientRow(RILEY, "Riley Example", "Knee pain"),
  patientRow(OTHER, "Alex Sample"),
];
const VISITS = [
  visitRow(V_OLD, RILEY, "2026-10-28", "Started exercises."),
  visitRow(V_NEW, RILEY, "2026-11-04", "Less swelling."),
  visitRow(V_PAID, RILEY, "2026-10-01", "First assessment.", I_PAID),
  visitRow(V_SENT, RILEY, "2026-10-14", "Taped the knee.", I_SENT),
  visitRow("aaaaaaaa-0000-4000-8000-000000000009", OTHER, "2026-11-10", "Someone else's note."),
];
const TODAYS_VISIT = visitRow(V_TODAY, RILEY, "2026-11-12", "Morning session.");
const ROWS = {
  patients: PATIENTS,
  visits: VISITS,
  invoices: [invoiceRow(I_PAID, 1, "paid"), invoiceRow(I_SENT, 2, "sent")],
};

/** What a note write reads first: the patient, or the visit with its invoice's status. */
function lookup(sql: string, parameters: unknown[]): unknown {
  if (sql.includes("FROM visit_items")) {
    return VISIT_ITEMS.filter((row) => row.visit_id === parameters[0]).toSorted(
      (a, b) => a.position - b.position,
    );
  }
  if (sql.includes("FROM patients")) return parameters[0] === RILEY ? PATIENTS[0] : null;
  const visit = [...VISITS, TODAYS_VISIT].find((row) => row.id === parameters[0]);
  if (!visit) return null;
  const invoice = ROWS.invoices.find((row) => row.id === visit.invoice_id);
  return { ...visit, invoice_status: invoice?.status ?? null };
}

const P_ASSESS = "dddddddd-0000-4000-8000-000000000001";
const P_TAPE = "dddddddd-0000-4000-8000-000000000002";
const PRICES = [priceRow(P_ASSESS, "Initial assessment", 12000), priceRow(P_TAPE, "Taping", 1999)];

function priceRow(id: string, name: string, cents: number) {
  return {
    id,
    owner_id: TEST_OWNER,
    name,
    unit_price_cents: cents,
    created_at: TEST_NOW,
    updated_at: TEST_NOW,
  };
}

function itemRow(
  id: string,
  visitId: string,
  priceId: string,
  name: string,
  quantity: number,
  position: number,
) {
  return {
    id,
    owner_id: TEST_OWNER,
    visit_id: visitId,
    price_item_id: priceId,
    name,
    unit_price_cents: priceId === P_ASSESS ? 12000 : 1999,
    quantity,
    position,
    created_at: TEST_NOW,
  };
}

const VISIT_ITEMS = [
  itemRow("eeeeeeee-0000-4000-8000-000000000002", V_NEW, P_TAPE, "Taping", 2, 1),
  itemRow("eeeeeeee-0000-4000-8000-000000000001", V_NEW, P_ASSESS, "Initial assessment", 1, 0),
  itemRow("eeeeeeee-0000-4000-8000-000000000003", V_SENT, P_TAPE, "Taping", 1, 0),
];
/** Like `lookup`, but the visit is gone (as after Delete visit), so Undo puts it back. */
const gone = (sql: string, parameters: unknown[]) =>
  sql.startsWith("SELECT id FROM visits") ? null : lookup(sql, parameters);
const WITH_PRICES = { ...ROWS, price_items: PRICES, visit_items: VISIT_ITEMS };

const TYPE_ID = "cccccccc-0000-4000-8000-000000000001";
const DETAIL_ID = "cccccccc-0000-4000-8000-000000000002";
const FUNDING_ID = "cccccccc-0000-4000-8000-000000000003";
const ENDED_ID = "cccccccc-0000-4000-8000-000000000004";

const fundingTypeRow = {
  id: TYPE_ID,
  owner_id: TEST_OWNER,
  name: "Autism Funding",
  recipient_name: "Example Branch",
  recipient_address: "PO Box 1",
  details: JSON.stringify([
    { id: DETAIL_ID, label: "Billing number", kind: "text", show_on_invoice: true },
  ]),
  created_at: TEST_NOW,
  updated_at: TEST_NOW,
};

function fundingRow(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    owner_id: TEST_OWNER,
    patient_id: RILEY,
    funding_type_id: TYPE_ID,
    detail_values: JSON.stringify({ [DETAIL_ID]: "4821" }),
    period_start: "2026-04-01",
    period_end: "2027-03-31",
    ended_on: null,
    created_at: TEST_NOW,
    updated_at: TEST_NOW,
    ...over,
  };
}

const WITH_FUNDING = {
  ...ROWS,
  funding_types: [fundingTypeRow],
  patient_fundings: [fundingRow(FUNDING_ID)],
};

const noteBox = () => screen.getByPlaceholderText("How did today go?");

/** The rows with a visit already saved today. */
const WITH_TODAY = {
  ...ROWS,
  visits: [...VISITS, TODAYS_VISIT],
};
/** Every visit is on an invoice. */
const ALL_INVOICED = { ...ROWS, visits: VISITS.filter((row) => row.invoice_id !== null) };

const renderPatient = (rows: Record<string, unknown[]>, id = RILEY) =>
  renderScreen(<Patient patientId={id} today={TODAY} />, rows, lookup);

describe("Patient", () => {
  it("shows the name, when they were last seen and why, with a back arrow", async () => {
    await renderPatient(ROWS);
    expect(screen.getByRole("header", { name: "Riley Example" })).toBeTruthy();
    expect(screen.getByText("Last visit 4 Nov · Knee pain")).toBeTruthy();
    expect(screen.getByLabelText("Back")).toBeTruthy();
  });

  it("has a note box titled with today's date, and no Copy last note or Clear", async () => {
    await renderPatient(ROWS);
    expect(screen.getByText("Today, 12 Nov")).toBeTruthy();
    expect(noteBox()).toBeTruthy();
    expect(screen.queryByText("Copy last note")).toBeNull();
    expect(screen.queryByText("Clear")).toBeNull();
  });

  it("lists only this patient's visits, newest first, with tags, excerpts and locks", async () => {
    await renderPatient(ROWS);
    const visits = within(screen.getByLabelText("Visits"));
    expect(visits.queryByText("Someone else's note.")).toBeNull();
    const rows = ["4 Nov", "28 Oct", "14 Oct", "1 Oct"];
    expect(
      visits.getAllByLabelText(/^\d+ (Nov|Oct)/).map((node) => node.props.accessibilityLabel),
    ).toEqual(rows);

    const newest = within(screen.getByLabelText("4 Nov"));
    expect(newest.getByText("Not invoiced")).toBeTruthy();
    expect(newest.getByText("Less swelling.")).toBeTruthy();
    expect(within(screen.getByLabelText("14 Oct")).getByText("Waiting on payment")).toBeTruthy();
    const paid = within(screen.getByLabelText("1 Oct"));
    expect(paid.getByText("Paid")).toBeTruthy();
    expect(paid.getByText(/locked/)).toBeTruthy();
    expect(within(screen.getByLabelText("28 Oct")).queryByText(/locked/)).toBeNull();
  });

  it("saves the typed note as today's visit from the pinned Save note, then says so", async () => {
    const { writes } = await renderPatient(ROWS);
    expect(screen.queryByText("Save note")).toBeNull();
    await fireEvent.changeText(noteBox(), "  Walking without pain.  ");
    await fireEvent.press(screen.getByText("Save note"));

    await waitFor(() => expect(writes.length).toBe(1));
    expect(writes[0]?.sql).toContain("INSERT INTO visits");
    expect(writes[0]?.parameters.slice(0, 5)).toEqual([
      NEW_ID,
      TEST_OWNER,
      RILEY,
      "2026-11-12",
      "Walking without pain.",
    ]);
    expect((await screen.findAllByText("Note saved")).length).toBeGreaterThan(0);
    expect(noteBox().props.value).toBe("");
  });

  it("refuses an empty note, says what to do and saves nothing", async () => {
    const { writes } = await renderPatient(ALL_INVOICED);
    await fireEvent.changeText(noteBox(), "   ");
    await fireEvent.press(screen.getByText("Save note"));
    expect(await screen.findByText("Write a note before saving the visit.")).toBeTruthy();
    expect(writes).toEqual([]);
    expect(screen.queryByText("Note saved")).toBeNull();

    // The message goes once the note is being typed.
    await fireEvent.changeText(noteBox(), "B");
    expect(screen.queryByText("Write a note before saving the visit.")).toBeNull();
  });

  it("pins Create invoice while the box is empty, and Save note once there's a note", async () => {
    await renderPatient(ROWS);
    expect(screen.getByText("Create invoice")).toBeTruthy();
    expect(screen.queryByText("Save note")).toBeNull();
    await fireEvent.changeText(noteBox(), "Something new.");
    expect(screen.getByText("Save note")).toBeTruthy();
    expect(screen.queryByText("Create invoice")).toBeNull();
    await fireEvent.changeText(noteBox(), "");
    expect(screen.getByText("Create invoice")).toBeTruthy();
  });

  it("opens New invoice from Create invoice, without making anything", async () => {
    const { writes } = await renderPatient(ROWS);
    await fireEvent.press(screen.getByText("Create invoice"));
    expect(mockRouter.navigate).toHaveBeenCalledWith({
      pathname: "/new-invoice/[patientId]",
      params: { patientId: RILEY },
    });
    expect(writes).toHaveLength(0);
  });

  it("after the note is saved today, the pinned button is Create invoice", async () => {
    await renderPatient(WITH_TODAY);
    expect(screen.queryByText("Save note")).toBeNull();
    expect(screen.getByText("Create invoice")).toBeTruthy();
    // With every visit invoiced there's nothing to pin.
    const none = {
      ...ALL_INVOICED,
      visits: [
        ...ALL_INVOICED.visits,
        { ...visitRow(V_TODAY, RILEY, "2026-11-12", "Done.", I_SENT) },
      ],
    };
    await renderPatient(none);
    expect(screen.queryByText("Create invoice")).toBeNull();
  });

  it("shows today's visit with its time of last edit, and changes it with the chips", async () => {
    const { writes } = await renderPatient(WITH_TODAY);
    const today = within(within(screen.getByLabelText("Visits")).getByLabelText("Today, 12 Nov"));
    expect(today.getByText("Morning session.")).toBeTruthy();
    expect(today.getByText(formatEdited("2026-11-12T17:00:00.000Z"))).toBeTruthy();

    await fireEvent.changeText(noteBox(), "Added stretches.");
    const chips = within(screen.getByLabelText("Today's note"));
    await fireEvent.press(chips.getByText("Add to note"));
    await waitFor(() => expect(writes.length).toBe(1));
    expect(writes[0]?.sql).toContain("UPDATE visits SET note");
    expect(writes[0]?.parameters[0]).toBe("Morning session.\n\nAdded stretches.");
    expect(writes[0]?.parameters[3]).toBe(V_TODAY);
    expect((await screen.findAllByText("Note saved")).length).toBeGreaterThan(0);
  });

  it("replaces today's note with the typed text", async () => {
    const { writes } = await renderPatient(WITH_TODAY);
    await fireEvent.changeText(noteBox(), "Rewritten.");
    await fireEvent.press(within(screen.getByLabelText("Today's note")).getByText("Replace note"));
    await waitFor(() => expect(writes.length).toBe(1));
    expect(writes[0]?.parameters[0]).toBe("Rewritten.");
    expect(writes[0]?.parameters[3]).toBe(V_TODAY);
  });

  it("shows Add to note and Replace note in the box, acting on the last visit before today's is saved", async () => {
    const { writes } = await renderPatient(ROWS);
    const chips = within(screen.getByLabelText("Today's note"));
    // Disabled until there's text.
    await fireEvent.press(chips.getByText("Add to note"));
    expect(writes).toEqual([]);

    await fireEvent.changeText(noteBox(), "Added stretches.");
    await fireEvent.press(chips.getByText("Add to note"));
    await waitFor(() => expect(writes.length).toBe(1));
    // The newest visit is 4 Nov.
    expect(writes[0]?.parameters[0]).toBe("Less swelling.\n\nAdded stretches.");
    expect(writes[0]?.parameters[3]).toBe(V_NEW);
  });

  it("can't change the latest visit's note when its invoice is paid", async () => {
    const { writes } = await renderPatient({ ...ROWS, visits: [VISITS[2]] });
    await fireEvent.changeText(noteBox(), "x");
    await fireEvent.press(within(screen.getByLabelText("Today's note")).getByText("Add to note"));
    expect(writes).toEqual([]);
  });

  it("does nothing from the chips while the box is empty", async () => {
    const { writes } = await renderPatient(WITH_TODAY);
    await fireEvent.press(within(screen.getByLabelText("Today's note")).getByText("Replace note"));
    expect(writes).toEqual([]);
  });

  it("keeps Add to note and Replace note on older visits, also once their invoice is sent", async () => {
    const { writes } = await renderPatient(ROWS);
    await fireEvent.changeText(noteBox(), "Added stretches.");
    await fireEvent.press(within(screen.getByLabelText("28 Oct")).getByText("Add to note"));
    await waitFor(() => expect(writes.length).toBe(1));
    expect(writes[0]?.parameters[0]).toBe("Started exercises.\n\nAdded stretches.");
    expect(writes[0]?.parameters[3]).toBe(V_OLD);

    await fireEvent.changeText(noteBox(), "Rewritten.");
    await fireEvent.press(within(screen.getByLabelText("14 Oct")).getByText("Replace note"));
    await waitFor(() => expect(writes.length).toBe(2));
    expect(writes[1]?.parameters[3]).toBe(V_SENT);
  });

  it("locks the note of a visit on a paid invoice", async () => {
    await renderPatient(ROWS);
    const paid = within(screen.getByLabelText("1 Oct"));
    expect(paid.queryByText("Add to note")).toBeNull();
    expect(paid.queryByText("Replace note")).toBeNull();
  });

  it("says there are no visits yet for a new patient", async () => {
    await renderScreen(<Patient patientId={OTHER} today={TODAY} />, { patients: PATIENTS });
    expect(screen.getByText("No visits yet. Today's note will be the first.")).toBeTruthy();
    expect(screen.queryByText(/^Last visit/)).toBeNull();
  });

  it("shows a visit saved elsewhere straight away", async () => {
    const { setRows } = await renderScreen(<Patient patientId={OTHER} today={TODAY} />, {
      patients: PATIENTS,
    });
    await setRows({ patients: PATIENTS, visits: [visitRow(V_NEW, OTHER, "2026-11-12", "New.")] });
    expect(within(screen.getByLabelText("Visits")).getByText("New.")).toBeTruthy();
    expect(screen.getByText("Last visit today")).toBeTruthy();
  });

  it("shows a Billing card above the visits with the funding, its number and its period", async () => {
    await renderPatient(WITH_FUNDING);
    const billing = within(screen.getByLabelText("Billing"));
    expect(billing.getByRole("header", { name: "Billing" })).toBeTruthy();
    expect(billing.getByText("Autism Funding")).toBeTruthy();
    expect(billing.getByText("Billing number 4821")).toBeTruthy();
    expect(billing.getByText("4821")).toBeTruthy();
    expect(billing.getByText("1 Apr 2026 \u2013 31 Mar 2027")).toBeTruthy();
    expect(billing.queryByText("Self-pay")).toBeNull();
    // It sits above the Visits card.
    const labels = screen
      .getAllByLabelText(/^(Billing|Visits)$/)
      .map((el) => el.props.accessibilityLabel);
    expect(labels).toEqual(["Billing", "Visits"]);
  });

  it("says a patient with no funding is self-pay, and who the invoices go to", async () => {
    await renderPatient(ROWS);
    const billing = within(screen.getByLabelText("Billing"));
    expect(billing.getByText("Self-pay")).toBeTruthy();
    expect(billing.getByText("Invoices go to Riley Example.")).toBeTruthy();
    expect(billing.queryByText("Edit")).toBeNull();
  });

  it("treats a funding whose period has passed or that was ended as ended, not current", async () => {
    await renderPatient({
      ...WITH_FUNDING,
      patient_fundings: [
        fundingRow(FUNDING_ID, { period_end: "2026-10-31" }),
        fundingRow(ENDED_ID, { ended_on: "2026-11-01", period_end: null }),
      ],
    });
    const billing = within(screen.getByLabelText("Billing"));
    expect(billing.getByText("Self-pay")).toBeTruthy();
    expect(billing.getByText("Ended 31 Oct 2026")).toBeTruthy();
    expect(billing.getByText("Ended 1 Nov 2026")).toBeTruthy();
    expect(billing.queryByText("Edit")).toBeNull();
  });

  it("opens the funding form to add a funding, or to edit one", async () => {
    await renderPatient(WITH_FUNDING);
    await fireEvent.press(screen.getByRole("button", { name: "Add funding" }));
    expect(mockRouter.navigate).toHaveBeenLastCalledWith({
      pathname: "/patient-funding/[patientId]",
      params: { patientId: RILEY },
    });
    await fireEvent.press(screen.getByRole("button", { name: "Edit Autism Funding" }));
    expect(mockRouter.navigate).toHaveBeenLastCalledWith({
      pathname: "/patient-funding/[patientId]",
      params: { patientId: RILEY, fundingId: FUNDING_ID },
    });
  });

  it("shows another patient's funding nowhere on this screen", async () => {
    await renderPatient({
      ...WITH_FUNDING,
      patient_fundings: [fundingRow(FUNDING_ID, { patient_id: OTHER })],
    });
    expect(within(screen.getByLabelText("Billing")).getByText("Self-pay")).toBeTruthy();
  });

  it("says so when the patient isn't there", async () => {
    await renderScreen(<Patient patientId="33333333-3333-4333-8333-333333333333" />, ROWS);
    expect(screen.getByRole("header", { name: "Patient not found" })).toBeTruthy();
    expect(screen.getByLabelText("Back")).toBeTruthy();
  });

  describe("Edit details", () => {
    it("corrects the name and reason, renames drafts billed to them, and says so", async () => {
      const { writes } = await renderPatient(ROWS);
      await fireEvent.press(screen.getByLabelText("Edit details"));
      expect(screen.getByLabelText("Full name").props.value).toBe("Riley Example");
      await fireEvent.changeText(screen.getByLabelText("Full name"), "Riley Examples");
      await fireEvent.changeText(screen.getByLabelText("Reason for visit (optional)"), "Knee");
      await fireEvent.press(screen.getByText("Save details"));

      await waitFor(() => expect(writes.length).toBe(2));
      expect(writes[0]?.sql).toMatch(/^UPDATE patients SET full_name/);
      expect(writes[0]?.parameters).toEqual(["Riley Examples", "Knee", TEST_NOW, RILEY]);
      expect(writes[1]?.sql).toMatch(/^UPDATE invoices SET bill_to_name/);
      expect((await screen.findAllByText("Patient updated")).length).toBeGreaterThan(0);
    });

    it("won't save without a name, and says what to do", async () => {
      const { writes } = await renderPatient(ROWS);
      await fireEvent.press(screen.getByLabelText("Edit details"));
      await fireEvent.changeText(screen.getByLabelText("Full name"), "  ");
      await fireEvent.press(screen.getByText("Save details"));
      expect(screen.getByText("Add the patient's full name.")).toBeTruthy();
      expect(writes).toEqual([]);
    });
  });

  describe("correcting visits", () => {
    it("saves a note on an earlier day, titled with that day", async () => {
      const { writes } = await renderPatient(ROWS);
      await fireEvent.changeText(screen.getByLabelText("Today, 12 Nov"), "Written next morning.");
      await fireEvent.press(screen.getByRole("button", { name: "Change date" }));
      expect(screen.getByLabelText("Visit date").props.value).toBe("12 Nov 2026");
      await fireEvent.changeText(screen.getByLabelText("Visit date"), "11 Nov 2026");
      expect(screen.getByLabelText("Visit on 11 Nov")).toBeTruthy();
      await fireEvent.press(screen.getByText("Save note"));

      await waitFor(() => expect(writes.length).toBe(1));
      expect(writes[0]?.sql).toMatch(/^INSERT INTO visits/);
      expect(writes[0]?.parameters[3]).toBe("2026-11-11");
      expect((await screen.findAllByText("Note saved")).length).toBeGreaterThan(0);
      expect(screen.getByText("Visit date: today")).toBeTruthy();
    });

    it("won't save a note dated after today, and says so at the date", async () => {
      const { writes } = await renderPatient(ROWS);
      await fireEvent.changeText(screen.getByLabelText("Today, 12 Nov"), "Too soon.");
      await fireEvent.press(screen.getByRole("button", { name: "Change date" }));
      await fireEvent.changeText(screen.getByLabelText("Visit date"), "13 Nov 2026");
      await fireEvent.press(screen.getByText("Save note"));
      expect(screen.getByText("A visit can't be dated after today.")).toBeTruthy();
      expect(writes).toEqual([]);
    });

    it("changes the date of a visit that isn't on an invoice", async () => {
      const { writes } = await renderPatient(ROWS);
      await fireEvent.press(screen.getByRole("button", { name: "Change date, 4 Nov" }));
      await fireEvent.changeText(screen.getByLabelText("Visit date"), "3 Nov 2026");
      await fireEvent.press(screen.getByText("Save date"));
      await waitFor(() => expect(writes.length).toBe(1));
      expect(writes[0]?.sql).toMatch(/^UPDATE visits SET visit_date/);
      expect(writes[0]?.parameters).toEqual(["2026-11-03", TEST_NOW, V_NEW]);
      expect((await screen.findAllByText("Visit date changed")).length).toBeGreaterThan(0);
    });

    it("deletes a visit that isn't on an invoice, with Undo", async () => {
      const { writes } = await renderPatient(ROWS);
      await fireEvent.press(screen.getByRole("button", { name: "Delete visit, 4 Nov" }));
      await waitFor(() => expect(writes.length).toBe(2));
      expect(writes[0]?.sql).toMatch(/^DELETE FROM visit_items/);
      expect(writes[1]?.sql).toBe("DELETE FROM visits WHERE id = ?");
      expect(writes[1]?.parameters).toEqual([V_NEW]);
      expect((await screen.findAllByText("Visit deleted")).length).toBeGreaterThan(0);
      expect(screen.getAllByText("Undo").length).toBeGreaterThan(0);
    });

    it("offers neither on a visit that's on an invoice", async () => {
      await renderPatient(ROWS);
      expect(screen.queryByRole("button", { name: "Delete visit, 14 Oct" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Change date, 1 Oct" })).toBeNull();
      expect(screen.getByRole("button", { name: "Delete visit, 28 Oct" })).toBeTruthy();
    });
  });

  describe("visit items", () => {
    it("saves the chosen items with the note, then clears them", async () => {
      const { writes } = await renderPatient(WITH_PRICES);
      await fireEvent.press(screen.getByText("+ Add item"));
      await fireEvent.press(screen.getByLabelText("Add Taping, $19.99"));
      const items = within(screen.getByLabelText("Items"));
      expect(items.getByLabelText("Taping")).toBeTruthy();
      await fireEvent.changeText(noteBox(), "Taped the ankle.");
      await fireEvent.press(screen.getByText("Save note"));

      await waitFor(() => expect(writes.length).toBe(2));
      expect(writes[0]?.sql).toMatch(/^INSERT INTO visits/);
      expect(writes[1]?.sql).toMatch(/^INSERT INTO visit_items/);
      expect(writes[1]?.parameters.slice(3)).toEqual([P_TAPE, "Taping", 1999, 1, 0, TEST_NOW]);
      expect((await screen.findAllByText("Note saved")).length).toBeGreaterThan(0);
      expect(within(screen.getByLabelText("Items")).queryByLabelText("Taping")).toBeNull();
    });

    it("raises the quantity when the same item is added again, and the stepper stops at 1", async () => {
      await renderPatient(WITH_PRICES);
      for (let i = 0; i < 2; i += 1) {
        await fireEvent.press(screen.getByText("+ Add item"));
        await fireEvent.press(screen.getByLabelText("Add Taping, $19.99"));
      }
      const row = within(within(screen.getByLabelText("Items")).getByLabelText("Taping"));
      expect(row.getByLabelText("Quantity 2")).toBeTruthy();
      await fireEvent.press(row.getByLabelText("Fewer Taping"));
      expect(row.getByLabelText("Quantity 1")).toBeTruthy();
      expect(row.getByLabelText("Fewer Taping").props.accessibilityState?.disabled).toBe(true);
      await fireEvent.press(row.getByLabelText("More Taping"));
      expect(row.getByLabelText("Quantity 2")).toBeTruthy();
    });

    it("removes an item", async () => {
      await renderPatient(WITH_PRICES);
      await fireEvent.press(screen.getByText("+ Add item"));
      await fireEvent.press(screen.getByLabelText("Add Taping, $19.99"));
      await fireEvent.press(screen.getByLabelText("Remove Taping"));
      expect(screen.queryByLabelText("Remove Taping")).toBeNull();
    });

    it("points to the price list when it is empty", async () => {
      await renderPatient(ROWS);
      expect(
        screen.getByText("Add items to your price list to bill them with a note."),
      ).toBeTruthy();
      expect(screen.queryByText("+ Add item")).toBeNull();
      await fireEvent.press(screen.getByText("Open your price list"));
      expect(mockRouter.navigate).toHaveBeenCalledWith("/price-list");
    });

    it("shows a visit's items as muted text on its row", async () => {
      await renderPatient(WITH_PRICES);
      const row = within(screen.getByLabelText("4 Nov"));
      expect(row.getByText("Initial assessment × 1 · Taping × 2")).toBeTruthy();
      expect(within(screen.getByLabelText("28 Oct")).queryByText(/×/)).toBeNull();
    });

    it("edits a visit's items from Edit items, with a toast", async () => {
      const { writes } = await renderPatient(WITH_PRICES);
      await fireEvent.press(screen.getByRole("button", { name: "Edit items, 4 Nov" }));
      expect(screen.getByLabelText("Quantity 2")).toBeTruthy();
      await fireEvent.press(screen.getByLabelText("Remove Initial assessment"));
      await fireEvent.press(screen.getByText("Save items"));

      await waitFor(() => expect(writes.length).toBe(3));
      expect(writes[0]?.sql).toMatch(/^DELETE FROM visit_items/);
      expect(writes[1]?.sql).toMatch(/^INSERT INTO visit_items/);
      expect(writes[1]?.parameters.slice(2, 8)).toEqual([V_NEW, P_TAPE, "Taping", 1999, 2, 0]);
      expect((await screen.findAllByText("Items saved")).length).toBeGreaterThan(0);
      expect(screen.queryByText("Save items")).toBeNull();
    });

    it("offers no Edit items on a visit that's on an invoice", async () => {
      await renderPatient(WITH_PRICES);
      expect(screen.queryByRole("button", { name: "Edit items, 14 Oct" })).toBeNull();
      expect(screen.getByRole("button", { name: "Edit items, 4 Nov" })).toBeTruthy();
    });

    it("puts a deleted visit's items back with Undo", async () => {
      const { writes } = await renderScreen(
        <Patient patientId={RILEY} today={TODAY} />,
        WITH_PRICES,
        gone,
      );
      await fireEvent.press(screen.getByRole("button", { name: "Delete visit, 4 Nov" }));
      const [undo] = await screen.findAllByText("Undo");
      if (!undo) throw new Error("The toast has no Undo.");
      await fireEvent.press(undo);
      await waitFor(() =>
        expect(
          writes.filter((write) => write.sql.startsWith("INSERT INTO visit_items")),
        ).toHaveLength(2),
      );
      const names = writes
        .filter((write) => write.sql.startsWith("INSERT INTO visit_items"))
        .map((write) => write.parameters[4]);
      expect(names).toEqual(["Initial assessment", "Taping"]);
    });
  });
});
