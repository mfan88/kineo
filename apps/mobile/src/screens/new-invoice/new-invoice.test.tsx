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
import { NewInvoice } from "./index";

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
  mockRouter.canGoBack.mockReturnValue(true);
});

// Made-up test data only.
const RILEY = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const V_OLD = "aaaaaaaa-0000-4000-8000-000000000001";
const V_TODAY = "aaaaaaaa-0000-4000-8000-000000000002";
const V_INVOICED = "aaaaaaaa-0000-4000-8000-000000000003";
const V_OTHER = "aaaaaaaa-0000-4000-8000-000000000004";
const I_SENT = "bbbbbbbb-0000-4000-8000-000000000001";
const TODAY = new Date(2026, 10, 12);

function invoiceRow(id: string, number: number, status: "draft" | "sent") {
  return {
    id,
    owner_id: TEST_OWNER,
    patient_id: RILEY,
    number,
    status,
    tax_enabled: 0,
    tax_rate_basis_points: 0,
    sent_at: status === "sent" ? TEST_NOW : null,
    paid_at: null,
    created_at: TEST_NOW,
    updated_at: TEST_NOW,
  };
}

const ROWS = {
  patients: [patientRow(RILEY, "Riley Example", "Knee pain"), patientRow(OTHER, "Alex Sample")],
  visits: [
    visitRow(V_OLD, RILEY, "2026-11-04", "Less swelling."),
    visitRow(V_TODAY, RILEY, "2026-11-12", "Morning session."),
    visitRow(V_INVOICED, RILEY, "2026-10-14", "Taped the knee.", I_SENT),
    visitRow(V_OTHER, OTHER, "2026-11-10", "Someone else's note."),
  ],
  invoices: [invoiceRow(I_SENT, 1, "sent")],
};

/** What creating an invoice reads first: the patient, then each visit with its invoice's status. */
function lookup(sql: string, parameters: unknown[]): unknown {
  if (sql.includes("FROM patients")) return parameters[0] === RILEY ? { id: RILEY } : null;
  const visit = ROWS.visits.find((row) => row.id === parameters[0]);
  if (!visit) return null;
  const invoice = ROWS.invoices.find((row) => row.id === visit.invoice_id);
  return { ...visit, invoice_status: invoice?.status ?? null };
}

const renderPicker = (rows: Record<string, unknown[]> = ROWS, id = RILEY) =>
  renderScreen(<NewInvoice patientId={id} today={TODAY} />, rows, lookup);

const visitBox = (name: string) => screen.getByRole("checkbox", { name });
const continueButton = () => screen.getByRole("button", { name: /^Continue/ });

describe("New invoice", () => {
  it("says who it's for and offers only their visits not on an invoice, newest first, all ticked", async () => {
    await renderPicker();
    expect(screen.getByRole("header", { name: "New invoice" })).toBeTruthy();
    expect(screen.getByText("For Riley Example. Pick the visits to include.")).toBeTruthy();
    const boxes = within(screen.getByLabelText("Visits not invoiced")).getAllByRole("checkbox");
    expect(boxes.map((box) => box.props.accessibilityLabel)).toEqual(["Today, 12 Nov", "4 Nov"]);
    for (const box of boxes) expect(box.props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByText("Less swelling.")).toBeTruthy();
    expect(screen.queryByText("Taped the knee.")).toBeNull();
    expect(screen.queryByText("Someone else's note.")).toBeNull();
    expect(
      screen.getByText("A visit can be on one invoice only. Visits already invoiced aren't shown."),
    ).toBeTruthy();
  });

  it("counts the ticked visits on Continue, and can't continue with none", async () => {
    await renderPicker();
    expect(screen.getByText("Continue with 2 visits")).toBeTruthy();

    await fireEvent.press(visitBox("4 Nov"));
    expect(visitBox("4 Nov").props.accessibilityState).toMatchObject({ checked: false });
    expect(screen.getByText("Continue with 1 visit")).toBeTruthy();

    await fireEvent.press(visitBox("Today, 12 Nov"));
    expect(continueButton().props.accessibilityState).toMatchObject({ disabled: true });

    await fireEvent.press(visitBox("4 Nov"));
    expect(screen.getByText("Continue with 1 visit")).toBeTruthy();
  });

  it("makes nothing until Continue, then creates the draft with the ticked visits and opens it in place", async () => {
    const { writes, setRows } = await renderPicker();
    expect(writes).toHaveLength(0);

    await fireEvent.press(visitBox("4 Nov"));
    await fireEvent.press(continueButton());
    await waitFor(() => expect(writes.length).toBe(2));
    expect(writes[0]?.sql).toContain("INSERT INTO invoices");
    expect(writes[0]?.parameters.slice(0, 3)).toEqual([NEW_ID, TEST_OWNER, RILEY]);
    expect(writes.slice(1).map((write) => write.parameters[2])).toEqual([V_TODAY]);
    expect(mockRouter.replace).not.toHaveBeenCalled();

    // The editor reads the local database, so it opens once the draft is there.
    await setRows({ ...ROWS, invoices: [...ROWS.invoices, invoiceRow(NEW_ID, 2, "draft")] });
    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: "/invoice/[id]",
      params: { id: NEW_ID },
    });
    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
  });

  it("leaves nothing behind on Cancel", async () => {
    const { writes } = await renderPicker();
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(writes).toHaveLength(0);
  });

  it("goes Home on Cancel when there's nothing to go back to", async () => {
    mockRouter.canGoBack.mockReturnValue(false);
    await renderPicker();
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(mockRouter.replace).toHaveBeenCalledWith("/");
  });

  it("ticks a visit that arrives while it's open", async () => {
    const { setRows } = await renderPicker();
    await fireEvent.press(visitBox("4 Nov"));
    const arriving = visitRow(
      "aaaaaaaa-0000-4000-8000-000000000009",
      RILEY,
      "2026-11-08",
      "Saved on the computer.",
    );
    await setRows({ ...ROWS, visits: [...ROWS.visits, arriving] });
    expect(visitBox("8 Nov").props.accessibilityState).toMatchObject({ checked: true });
    expect(visitBox("4 Nov").props.accessibilityState).toMatchObject({ checked: false });
    expect(screen.getByText("Continue with 2 visits")).toBeTruthy();
  });

  it("says there's nothing to invoice when every visit is on one", async () => {
    await renderPicker({
      ...ROWS,
      visits: ROWS.visits.filter((row) => row.invoice_id !== null || row.patient_id !== RILEY),
    });
    expect(screen.getByText("Nothing to invoice")).toBeTruthy();
    expect(continueButton().props.accessibilityState).toMatchObject({ disabled: true });
  });

  it("says so when the patient isn't there", async () => {
    await renderPicker(ROWS, "33333333-3333-4333-8333-333333333333");
    expect(screen.getByRole("header", { name: "Patient not found" })).toBeTruthy();
  });
});
