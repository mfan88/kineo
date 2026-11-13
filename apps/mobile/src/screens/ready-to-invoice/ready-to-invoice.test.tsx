import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, screen, within } from "@testing-library/react-native";
import { patientRow, renderScreen, visitRow } from "@/test/render-screen";
import { ReadyToInvoice } from "./index";

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

// Made-up test data only.
const RILEY = "11111111-1111-4111-8111-111111111111";
const ALEX = "22222222-2222-4222-8222-222222222222";
const SAM = "33333333-3333-4333-8333-333333333333";
const INVOICE = "bbbbbbbb-0000-4000-8000-000000000001";

const ROWS = {
  patients: [
    patientRow(RILEY, "Riley Example"),
    patientRow(ALEX, "Alex Sample"),
    patientRow(SAM, "Sam Madeup"),
  ],
  visits: [
    visitRow("aaaaaaaa-0000-4000-8000-000000000001", RILEY, "2026-11-10", "A note."),
    visitRow("aaaaaaaa-0000-4000-8000-000000000002", ALEX, "2026-11-02", "A note."),
    visitRow("aaaaaaaa-0000-4000-8000-000000000003", ALEX, "2026-11-09", "A note."),
    visitRow("aaaaaaaa-0000-4000-8000-000000000004", SAM, "2026-10-30", "A note.", INVOICE),
  ],
};

describe("Ready to invoice", () => {
  it("lists patients with visits waiting, the one waiting longest first, with their counts", async () => {
    await renderScreen(<ReadyToInvoice />, ROWS);
    expect(screen.getByRole("header", { name: "Ready to invoice" })).toBeTruthy();
    const rows = within(screen.getByLabelText("Patients ready to invoice")).getAllByRole("button");
    expect(rows.map((row) => row.props.accessibilityLabel)).toEqual([
      "Alex Sample, 2 visits",
      "Riley Example, 1 visit",
    ]);
  });

  it("opens a patient's New invoice", async () => {
    await renderScreen(<ReadyToInvoice />, ROWS);
    await fireEvent.press(screen.getByRole("button", { name: "Riley Example, 1 visit" }));
    expect(mockRouter.navigate).toHaveBeenCalledWith({
      pathname: "/new-invoice/[patientId]",
      params: { patientId: RILEY },
    });
  });

  it("is all caught up when every visit is invoiced", async () => {
    await renderScreen(<ReadyToInvoice />, { ...ROWS, visits: ROWS.visits.slice(3) });
    expect(screen.getByText("You're all caught up")).toBeTruthy();
  });
});
