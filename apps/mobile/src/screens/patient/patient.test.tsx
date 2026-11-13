import { beforeEach, describe, expect, it, jest } from "@jest/globals";
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
const ROWS = {
  patients: PATIENTS,
  visits: VISITS,
  invoices: [invoiceRow(I_PAID, 1, "paid"), invoiceRow(I_SENT, 2, "sent")],
};

/** What a note write reads first: the patient, or the visit with its invoice's status. */
function lookup(sql: string, parameters: unknown[]): unknown {
  if (sql.includes("FROM patients")) return parameters[0] === RILEY ? { id: RILEY } : null;
  const visit = VISITS.find((row) => row.id === parameters[0]);
  if (!visit) return null;
  const invoice = ROWS.invoices.find((row) => row.id === visit.invoice_id);
  return { ...visit, invoice_status: invoice?.status ?? null };
}

const noteBox = () => screen.getByPlaceholderText("How did today go?");

describe("Patient", () => {
  it("shows the name, reason for visit and last visit, with a back arrow", async () => {
    await renderScreen(<Patient patientId={RILEY} />, ROWS);
    expect(screen.getByRole("header", { name: "Riley Example" })).toBeTruthy();
    expect(screen.getByText("Knee pain")).toBeTruthy();
    const last = within(screen.getByLabelText("Last visit"));
    expect(last.getByText("Last visit · Wed, November 4, 2026")).toBeTruthy();
    expect(last.getByText("Less swelling.")).toBeTruthy();
    expect(screen.getByLabelText("Back")).toBeTruthy();
  });

  it("lists only this patient's visits, newest first, with status tags", async () => {
    await renderScreen(<Patient patientId={RILEY} />, ROWS);
    const visits = within(screen.getByLabelText("Visits"));
    const dates = visits.getAllByText(/, 2026$/).map((node) => node.props.children);
    expect(dates).toEqual([
      "Wed, November 4, 2026",
      "Wed, October 28, 2026",
      "Wed, October 14, 2026",
      "Thu, October 1, 2026",
    ]);
    expect(visits.queryByText("Someone else's note.")).toBeNull();
    expect(
      within(screen.getByLabelText("Wed, November 4, 2026")).getByText("Not invoiced"),
    ).toBeTruthy();
    expect(
      within(screen.getByLabelText("Wed, October 14, 2026")).getByText("Waiting on payment"),
    ).toBeTruthy();
    expect(within(screen.getByLabelText("Thu, October 1, 2026")).getByText("Paid")).toBeTruthy();
  });

  it("saves the note as today's visit, empties the box and says so", async () => {
    const { writes } = await renderScreen(<Patient patientId={RILEY} />, ROWS, lookup);
    await fireEvent.changeText(noteBox(), "  Walking without pain.  ");
    await fireEvent.press(screen.getByText("Save as today's visit"));

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
    const { writes } = await renderScreen(<Patient patientId={RILEY} />, ROWS, lookup);
    await fireEvent.changeText(noteBox(), "   ");
    await fireEvent.press(screen.getByText("Save as today's visit"));
    expect(await screen.findByText("Write a note before saving the visit.")).toBeTruthy();
    expect(writes).toEqual([]);
    expect(screen.queryByText("Note saved")).toBeNull();

    // The message goes once the note is being typed.
    await fireEvent.changeText(noteBox(), "B");
    expect(screen.queryByText("Write a note before saving the visit.")).toBeNull();
  });

  it("copies the last note into the box, and clears it", async () => {
    await renderScreen(<Patient patientId={RILEY} />, ROWS);
    await fireEvent.press(screen.getByText("Copy last note"));
    expect(noteBox().props.value).toBe("Less swelling.");
    await fireEvent.press(screen.getByText("Clear"));
    expect(noteBox().props.value).toBe("");
  });

  it("adds the note to a visit, keeping what was there", async () => {
    const { writes } = await renderScreen(<Patient patientId={RILEY} />, ROWS, lookup);
    await fireEvent.changeText(noteBox(), "Added stretches.");
    await fireEvent.press(
      within(screen.getByLabelText("Wed, October 28, 2026")).getByText("Add to note"),
    );
    await waitFor(() => expect(writes.length).toBe(1));
    expect(writes[0]?.sql).toContain("UPDATE visits SET note");
    expect(writes[0]?.parameters[0]).toBe("Started exercises.\n\nAdded stretches.");
    expect(writes[0]?.parameters[1]).toBe(TEST_NOW);
    expect(writes[0]?.parameters[3]).toBe(V_OLD);
    expect((await screen.findAllByText("Note saved")).length).toBeGreaterThan(0);
  });

  it("replaces a visit's note, also when its invoice has been sent", async () => {
    const { writes } = await renderScreen(<Patient patientId={RILEY} />, ROWS, lookup);
    await fireEvent.changeText(noteBox(), "Rewritten.");
    await fireEvent.press(
      within(screen.getByLabelText("Wed, October 14, 2026")).getByText("Replace note"),
    );
    await waitFor(() => expect(writes.length).toBe(1));
    expect(writes[0]?.parameters[0]).toBe("Rewritten.");
    expect(writes[0]?.parameters[3]).toBe(V_SENT);
  });

  it("locks the note of a visit on a paid invoice", async () => {
    await renderScreen(<Patient patientId={RILEY} />, ROWS, lookup);
    const paid = within(screen.getByLabelText("Thu, October 1, 2026"));
    expect(paid.getByText("This note is on a paid invoice and can't be changed.")).toBeTruthy();
    expect(paid.queryByText("Add to note")).toBeNull();
    expect(paid.queryByText("Replace note")).toBeNull();
  });

  it("does nothing from a visit's buttons while the box is empty", async () => {
    const { writes } = await renderScreen(<Patient patientId={RILEY} />, ROWS, lookup);
    await fireEvent.press(
      within(screen.getByLabelText("Wed, October 28, 2026")).getByText("Replace note"),
    );
    expect(writes).toEqual([]);
  });

  it("starts a draft invoice with the uninvoiced visits and opens it once it's saved", async () => {
    const { writes, setRows } = await renderScreen(<Patient patientId={RILEY} />, ROWS, lookup);
    await fireEvent.press(screen.getByText("Invoice 2 visits"));
    await waitFor(() => expect(writes.length).toBe(3));
    expect(writes[0]?.sql).toContain("INSERT INTO invoices");
    expect(writes[0]?.parameters.slice(0, 3)).toEqual([NEW_ID, TEST_OWNER, RILEY]);
    // Only the two visits not on an invoice go on it.
    expect(writes.slice(1).map((write) => write.parameters[2])).toEqual([V_NEW, V_OLD]);
    expect(mockRouter.navigate).not.toHaveBeenCalled();

    await setRows({ ...ROWS, invoices: [...ROWS.invoices, invoiceRow(NEW_ID, 3, "draft")] });
    expect(mockRouter.navigate).toHaveBeenCalledWith({
      pathname: "/invoice/[id]",
      params: { id: NEW_ID },
    });
    expect(mockRouter.navigate).toHaveBeenCalledTimes(1);
  });

  it("counts one visit in the singular, and offers nothing when all are invoiced", async () => {
    const one = { ...ROWS, visits: VISITS.filter((row) => row.id !== V_OLD) };
    const first = await renderScreen(<Patient patientId={RILEY} />, one);
    expect(screen.getByText("Invoice 1 visit")).toBeTruthy();
    await first.setRows({ ...ROWS, visits: VISITS.filter((row) => row.invoice_id !== null) });
    expect(screen.queryByText(/^Invoice \d+ visit/)).toBeNull();
  });

  it("says there are no visits yet for a new patient", async () => {
    await renderScreen(<Patient patientId={OTHER} />, { patients: PATIENTS });
    expect(screen.getByText("No visits yet. Today's note will be the first.")).toBeTruthy();
    expect(screen.getByText("No visits yet.")).toBeTruthy();
  });

  it("shows a visit saved elsewhere straight away", async () => {
    const { setRows } = await renderScreen(<Patient patientId={OTHER} />, { patients: PATIENTS });
    await setRows({ patients: PATIENTS, visits: [visitRow(V_NEW, OTHER, "2026-11-12", "New.")] });
    expect(screen.getByLabelText("Thu, November 12, 2026")).toBeTruthy();
  });

  it("says so when the patient isn't there", async () => {
    await renderScreen(<Patient patientId="33333333-3333-4333-8333-333333333333" />, ROWS);
    expect(screen.getByRole("header", { name: "Patient not found" })).toBeTruthy();
    expect(screen.getByLabelText("Back")).toBeTruthy();
  });
});
