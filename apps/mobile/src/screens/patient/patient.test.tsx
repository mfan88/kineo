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
  if (sql.includes("FROM patients")) return parameters[0] === RILEY ? { id: RILEY } : null;
  const visit = [...VISITS, TODAYS_VISIT].find((row) => row.id === parameters[0]);
  if (!visit) return null;
  const invoice = ROWS.invoices.find((row) => row.id === visit.invoice_id);
  return { ...visit, invoice_status: invoice?.status ?? null };
}

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

  it("says so when the patient isn't there", async () => {
    await renderScreen(<Patient patientId="33333333-3333-4333-8333-333333333333" />, ROWS);
    expect(screen.getByRole("header", { name: "Patient not found" })).toBeTruthy();
    expect(screen.getByLabelText("Back")).toBeTruthy();
  });
});
