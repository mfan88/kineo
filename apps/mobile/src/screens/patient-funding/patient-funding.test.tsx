import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { NEW_ID, patientRow, renderScreen, TEST_NOW, TEST_OWNER } from "@/test/render-screen";
import { PatientFunding } from "./index";

const mockRouter = {
  canGoBack: jest.fn<() => boolean>(),
  back: jest.fn<() => void>(),
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
const TYPE_ID = "cccccccc-0000-4000-8000-000000000001";
const DETAIL_ID = "cccccccc-0000-4000-8000-000000000002";
const FUNDING_ID = "cccccccc-0000-4000-8000-000000000003";

const typeRow = (over: Record<string, unknown> = {}) => ({
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
  ...over,
});

const fundingRow = {
  id: FUNDING_ID,
  owner_id: TEST_OWNER,
  patient_id: RILEY,
  funding_type_id: TYPE_ID,
  detail_values: JSON.stringify({ [DETAIL_ID]: "4821" }),
  period_start: "2026-04-01",
  period_end: "2027-03-31",
  ended_on: null,
  created_at: TEST_NOW,
  updated_at: TEST_NOW,
};

const ROWS = {
  patients: [patientRow(RILEY, "Riley Example")],
  funding_types: [typeRow()],
  patient_fundings: [fundingRow],
};

/** What a write reads before changing anything. */
function lookup(sql: string, parameters: unknown[]): unknown {
  if (sql.includes("FROM patients")) return ROWS.patients.find((r) => r.id === parameters[0]);
  if (sql.includes("FROM funding_types")) return typeRow();
  if (sql.includes("FROM patient_fundings")) return fundingRow;
  return null;
}

const renderAdd = (rows: Record<string, unknown[]> = ROWS) =>
  renderScreen(<PatientFunding patientId={RILEY} />, rows, lookup);
const renderEdit = () =>
  renderScreen(<PatientFunding patientId={RILEY} fundingId={FUNDING_ID} />, ROWS, lookup);

const field = (label: string) => screen.getByLabelText(label);

describe("Add funding", () => {
  it("shows the heading, a Back button naming the patient, and the type's fields", async () => {
    await renderAdd();
    expect(screen.getByRole("header", { name: "Add funding" })).toBeTruthy();
    expect(screen.getByLabelText("Back to Riley Example")).toBeTruthy();
    expect(screen.getByText("Funding type")).toBeTruthy();
    // A required field's label carries HeroUI's asterisk.
    expect(screen.getByText(/^Billing number/)).toBeTruthy();
    expect(screen.getByText("Required")).toBeTruthy();
    expect(screen.getByText("Starts")).toBeTruthy();
    expect(screen.getByText("Ends")).toBeTruthy();
    expect(screen.getAllByText("Optional")).toHaveLength(2);
    expect(field("Starts").props.placeholder).toBe("e.g. 1 Apr 2026");
    expect(
      screen.getByText(
        "Need a different funder? Add its type in Kineō on your computer, under Settings.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("End funding")).toBeNull();
  });

  it("names who the invoices go to", async () => {
    await renderAdd();
    expect(screen.getByText("Example Branch")).toBeTruthy();
  });

  it("warns, but still lets you save, when the type has no recipient yet", async () => {
    await renderAdd({
      ...ROWS,
      funding_types: [typeRow({ recipient_name: "", recipient_address: "" })],
    });
    expect(
      screen.getByText(
        "Autism Funding has no recipient yet. Add it in Kineō on your computer before you send.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save funding" })).toBeTruthy();
  });

  it("saves the typed values and period, then goes back and says so", async () => {
    const { writes } = await renderAdd();
    await fireEvent.changeText(field("Billing number"), " 4821 ");
    await fireEvent.changeText(field("Starts"), "1 Apr 2026");
    await fireEvent.changeText(field("Ends"), "31 March 2027");
    await fireEvent.press(screen.getByText("Save funding"));

    await waitFor(() => expect(writes.length).toBe(1));
    expect(writes[0]?.sql).toContain("INSERT INTO patient_fundings");
    expect(writes[0]?.parameters.slice(0, 7)).toEqual([
      NEW_ID,
      TEST_OWNER,
      RILEY,
      TYPE_ID,
      JSON.stringify({ [DETAIL_ID]: "4821" }),
      "2026-04-01",
      "2027-03-31",
    ]);
    expect((await screen.findAllByText("Funding added")).length).toBeGreaterThan(0);
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it("saves with no period at all", async () => {
    const { writes } = await renderAdd();
    await fireEvent.changeText(field("Billing number"), "4821");
    await fireEvent.press(screen.getByText("Save funding"));
    await waitFor(() => expect(writes.length).toBe(1));
    expect(writes[0]?.parameters.slice(5, 7)).toEqual([null, null]);
  });

  it("asks for a missing required detail under its field and saves nothing", async () => {
    const { writes } = await renderAdd();
    expect(screen.queryByText("Add the billing number.")).toBeNull();
    await fireEvent.press(screen.getByText("Save funding"));
    expect(await screen.findByText("Add the billing number.")).toBeTruthy();
    expect(writes).toHaveLength(0);
    expect(mockRouter.back).not.toHaveBeenCalled();

    // The message goes as soon as the field is filled in.
    await fireEvent.changeText(field("Billing number"), "4821");
    expect(screen.queryByText("Add the billing number.")).toBeNull();
  });

  it("says how to write a date it can't read, and saves nothing", async () => {
    const { writes } = await renderAdd();
    await fireEvent.changeText(field("Billing number"), "4821");
    await fireEvent.changeText(field("Starts"), "April 1");
    await fireEvent.press(screen.getByText("Save funding"));
    expect(await screen.findByText("Enter a date like 1 Apr 2026.")).toBeTruthy();
    expect(writes).toHaveLength(0);
  });

  it("refuses a period that ends before it starts", async () => {
    const { writes } = await renderAdd();
    await fireEvent.changeText(field("Billing number"), "4821");
    await fireEvent.changeText(field("Starts"), "2 Apr 2026");
    await fireEvent.changeText(field("Ends"), "1 Apr 2026");
    await fireEvent.press(screen.getByText("Save funding"));
    expect(await screen.findByText("The period can't end before it starts.")).toBeTruthy();
    expect(writes).toHaveLength(0);
  });

  it("cancels back to the patient without saving", async () => {
    const { writes } = await renderAdd();
    await fireEvent.press(screen.getByText("Cancel"));
    expect(mockRouter.back).toHaveBeenCalled();
    expect(writes).toHaveLength(0);
  });

  it("shows a notice and only Go back when there are no funding types", async () => {
    await renderAdd({ ...ROWS, funding_types: [] });
    expect(
      screen.getByText(
        "You haven't made any funding types yet. Add them in Kineō on your computer, under Settings.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("Save funding")).toBeNull();
    await fireEvent.press(screen.getByText("Go back"));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it("says so when the patient isn't there", async () => {
    await renderScreen(<PatientFunding patientId="gone" />, ROWS, lookup);
    expect(screen.getByRole("header", { name: "Patient not found" })).toBeTruthy();
  });
});

describe("Edit funding", () => {
  it("pre-fills the values and the period as typed, and fixes the type", async () => {
    await renderEdit();
    expect(screen.getByRole("header", { name: "Edit funding" })).toBeTruthy();
    expect(field("Billing number").props.value).toBe("4821");
    expect(field("Starts").props.value).toBe("1 Apr 2026");
    expect(field("Ends").props.value).toBe("31 Mar 2027");
    expect(
      screen.getByLabelText("Funding type, Autism Funding").props.accessibilityState,
    ).toMatchObject({ disabled: true });
  });

  it("saves changes to the same funding and says so", async () => {
    const { writes } = await renderEdit();
    await fireEvent.changeText(field("Billing number"), "9999");
    await fireEvent.changeText(field("Ends"), "");
    await fireEvent.press(screen.getByText("Save funding"));
    await waitFor(() => expect(writes.length).toBe(1));
    expect(writes[0]?.sql).toContain("UPDATE patient_fundings SET detail_values");
    expect(writes[0]?.parameters).toEqual([
      JSON.stringify({ [DETAIL_ID]: "9999" }),
      "2026-04-01",
      null,
      TEST_NOW,
      FUNDING_ID,
    ]);
    expect((await screen.findAllByText("Funding saved")).length).toBeGreaterThan(0);
  });

  it("ends the funding today, goes back and offers Undo, which brings it back", async () => {
    const { writes } = await renderEdit();
    await fireEvent.press(screen.getByText("End funding"));
    await waitFor(() => expect(writes.length).toBe(1));
    expect(writes[0]?.sql).toContain("UPDATE patient_fundings SET ended_on");
    expect(writes[0]?.parameters).toEqual(["2026-11-12", TEST_NOW, FUNDING_ID]);
    expect(mockRouter.back).toHaveBeenCalled();
    expect((await screen.findAllByText("Funding ended")).length).toBeGreaterThan(0);

    const [undo] = await screen.findAllByText("Undo");
    if (!undo) throw new Error("The toast has no Undo.");
    await fireEvent.press(undo);
    await waitFor(() => expect(writes.length).toBe(2));
    expect(writes[1]?.parameters).toEqual([null, TEST_NOW, FUNDING_ID]);
  });

  it("says so when the funding isn't there", async () => {
    await renderScreen(<PatientFunding patientId={RILEY} fundingId="gone" />, ROWS, lookup);
    expect(screen.getByRole("header", { name: "Funding not found" })).toBeTruthy();
  });
});
