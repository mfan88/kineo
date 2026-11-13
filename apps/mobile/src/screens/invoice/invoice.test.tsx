import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import {
  NEW_ID,
  patientRow,
  renderScreen,
  TEST_NOW,
  TEST_OWNER,
  visitRow,
} from "@/test/render-screen";
import { Invoice } from "./index";

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
const INVOICE = "bbbbbbbb-0000-4000-8000-000000000001";
const V_ON = "aaaaaaaa-0000-4000-8000-000000000001";
const V_FREE = "aaaaaaaa-0000-4000-8000-000000000002";
const V_OTHER = "aaaaaaaa-0000-4000-8000-000000000003";
const P_VISIT = "cccccccc-0000-4000-8000-000000000001";
const P_TAPE = "cccccccc-0000-4000-8000-000000000002";
const L_VISIT = "dddddddd-0000-4000-8000-000000000001";
const L_TAPE = "dddddddd-0000-4000-8000-000000000002";

type Status = "draft" | "sent" | "paid";

function invoiceRow(status: Status, tax = false) {
  return {
    id: INVOICE,
    owner_id: TEST_OWNER,
    patient_id: RILEY,
    number: 4,
    status,
    tax_enabled: tax ? 1 : 0,
    tax_rate_basis_points: 500,
    sent_at: status === "draft" ? null : TEST_NOW,
    paid_at: status === "paid" ? TEST_NOW : null,
    created_at: TEST_NOW,
    updated_at: TEST_NOW,
  };
}

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

function lineRow(id: string, priceItemId: string, name: string, cents: number, quantity: number) {
  return {
    id,
    owner_id: TEST_OWNER,
    invoice_id: INVOICE,
    price_item_id: priceItemId,
    name,
    unit_price_cents: cents,
    quantity,
    position: id === L_VISIT ? 0 : 1,
  };
}

const PRICES = [priceRow(P_VISIT, "Follow-up visit", 9500), priceRow(P_TAPE, "Taping", 1999)];
const LINES = [
  lineRow(L_VISIT, P_VISIT, "Follow-up visit", 9500, 2),
  lineRow(L_TAPE, P_TAPE, "Taping", 1999, 1),
];
const VISITS = [
  visitRow(V_ON, RILEY, "2026-10-28", "On it.", INVOICE),
  visitRow(V_FREE, RILEY, "2026-11-04", "Not on any invoice."),
  visitRow(V_OTHER, OTHER, "2026-11-10", "Someone else's."),
];

function rows(status: Status, { tax = false, lines = LINES } = {}) {
  return {
    patients: [patientRow(RILEY, "Riley Example"), patientRow(OTHER, "Alex Sample")],
    visits: VISITS,
    invoices: [invoiceRow(status, tax)],
    invoice_lines: lines,
    price_items: PRICES,
    practice_settings: [
      {
        id: "eeeeeeee-0000-4000-8000-000000000001",
        owner_id: TEST_OWNER,
        default_tax_rate_basis_points: 500,
        invoice_number_prefix: "INV-",
        updated_at: TEST_NOW,
      },
    ],
  };
}

/** What a write reads before changing anything, from the same rows the screen shows. */
function lookupFor(status: Status, lines = LINES) {
  return (sql: string, parameters: unknown[]): unknown => {
    const [id] = parameters;
    if (sql.includes("FROM invoices")) return id === INVOICE ? invoiceRow(status) : null;
    if (sql.includes("FROM visits")) return VISITS.find((row) => row.id === id) ?? null;
    if (sql.includes("FROM price_items")) return PRICES.find((row) => row.id === id) ?? null;
    if (sql.includes("COUNT(*)")) return { count: lines.length };
    if (sql.includes("FROM invoice_lines")) return lines.find((row) => row.id === id) ?? null;
    if (sql.includes("FROM practice_settings")) return { rate: 500 };
    return null;
  };
}

const TODAY = new Date(2026, 10, 12);

const renderEditor = (status: Status, options: Parameters<typeof rows>[1] = {}, lookup = true) =>
  renderScreen(
    <Invoice invoiceId={INVOICE} today={TODAY} />,
    rows(status, options),
    lookup ? lookupFor(status, options.lines) : undefined,
  );

/** Opens a collapsed line, showing its price each, quantity and Remove. */
const openLine = (name: string) =>
  fireEvent.press(screen.getByRole("button", { name: new RegExp(`^${name}, `) }));

describe("Invoice editor", () => {
  it("shows the number with its tag, who it's for and how many visits, then lines and totals", async () => {
    await renderEditor("draft");
    expect(screen.getByRole("header", { name: "INV-0004" })).toBeTruthy();
    expect(screen.getByText("Draft")).toBeTruthy();
    expect(screen.getByText("Riley Example · 1 visit")).toBeTruthy();
    expect(screen.getByLabelText("Back")).toBeTruthy();

    // Lines are collapsed to name, quantity and amount.
    const visit = within(screen.getByLabelText("Follow-up visit"));
    expect(visit.getByText("2 ×")).toBeTruthy();
    expect(visit.getByText("$190.00")).toBeTruthy();
    expect(screen.queryByText("$95.00 each")).toBeNull();
    // 2 × 95.00 + 19.99, no tax.
    expect(screen.getByLabelText("Subtotal: $209.99")).toBeTruthy();
    expect(screen.getByLabelText("Total: $209.99")).toBeTruthy();
    expect(screen.queryByLabelText(/^Tax/)).toBeNull();
  });

  it("works tax out once on the subtotal, rounded half up", async () => {
    await renderEditor("draft", { tax: true });
    // 5% of 209.99 is 10.4995, which rounds to 10.50.
    expect(screen.getByLabelText("Tax (5%): $10.50")).toBeTruthy();
    expect(screen.getByLabelText("Total: $220.49")).toBeTruthy();
  });

  it("opens this patient's visits to change them: the ones on it and the free ones", async () => {
    const { writes } = await renderEditor("draft");
    expect(screen.queryByLabelText("Visits")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Change visits" }));

    const visits = within(screen.getByLabelText("Visits"));
    const on = visits.getByRole("checkbox", { name: "28 Oct" });
    const free = visits.getByRole("checkbox", { name: "4 Nov" });
    expect(on.props.accessibilityState.checked).toBe(true);
    expect(free.props.accessibilityState.checked).toBe(false);
    expect(visits.queryByText("10 Nov")).toBeNull();

    await fireEvent.press(free);
    await waitFor(() => expect(writes.length).toBe(2));
    expect(writes[0]?.sql).toContain("UPDATE visits SET invoice_id");
    expect(writes[0]?.parameters).toEqual([INVOICE, TEST_NOW, V_FREE]);

    await fireEvent.press(on);
    await waitFor(() => expect(writes.length).toBe(4));
    expect(writes[2]?.parameters).toEqual([null, TEST_NOW, V_ON]);

    await fireEvent.press(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByLabelText("Visits")).toBeNull();
  });

  it("adds a line from the price list sheet, copying its name and price", async () => {
    const { writes } = await renderEditor("draft");
    // (gorhom's test mock always renders the sheet's content, open or not.)
    await fireEvent.press(screen.getByRole("button", { name: "+ Add line item" }));
    expect(screen.getByText("Add line item")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Add Taping, $19.99"));
    await waitFor(() => expect(writes.length).toBe(2));
    expect(writes[0]?.sql).toContain("INSERT INTO invoice_lines");
    expect(writes[0]?.parameters).toEqual([
      NEW_ID,
      TEST_OWNER,
      INVOICE,
      P_TAPE,
      "Taping",
      1999,
      1,
      2,
    ]);
  });

  it("opens a line to change its quantity one at a time, never below 1", async () => {
    const { writes } = await renderEditor("draft");
    expect(screen.queryByLabelText("One more Follow-up visit")).toBeNull();
    await openLine("Follow-up visit");
    expect(screen.getByText("$95.00 each")).toBeTruthy();
    expect(screen.getByLabelText("Quantity of Follow-up visit: 2")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("One more Follow-up visit"));
    await waitFor(() => expect(writes.length).toBe(2));
    expect(writes[0]?.sql).toContain("UPDATE invoice_lines SET quantity");
    expect(writes[0]?.parameters).toEqual([3, L_VISIT]);

    await fireEvent.press(screen.getByLabelText("One fewer Follow-up visit"));
    await waitFor(() => expect(writes.length).toBe(4));
    expect(writes[2]?.parameters).toEqual([1, L_VISIT]);

    // Only one line is open at a time. Taping is already at 1: − is off.
    await openLine("Taping");
    expect(screen.queryByLabelText("One more Follow-up visit")).toBeNull();
    await fireEvent.press(screen.getByLabelText("One fewer Taping"));
    expect(writes.length).toBe(4);
  });

  it("removes a line", async () => {
    const { writes } = await renderEditor("draft");
    await openLine("Taping");
    await fireEvent.press(screen.getByLabelText("Remove Taping"));
    await waitFor(() => expect(writes.length).toBe(3));
    expect(writes[0]?.sql).toContain("DELETE FROM invoice_lines");
    expect(writes[0]?.parameters).toEqual([L_TAPE]);
  });

  it("turns tax on at the practice's rate", async () => {
    const { writes } = await renderEditor("draft");
    const tax = screen.getByRole("switch", { name: "Add tax (5%)" });
    expect(tax.props.accessibilityState.checked).toBe(false);
    await fireEvent.press(tax);
    await waitFor(() => expect(writes.length).toBe(1));
    expect(writes[0]?.sql).toContain("UPDATE invoices SET tax_enabled");
    expect(writes[0]?.parameters).toEqual([1, 500, TEST_NOW, INVOICE]);
  });

  it("says so when there are no lines, and when the price list is empty", async () => {
    await renderScreen(<Invoice invoiceId={INVOICE} today={TODAY} />, {
      ...rows("draft", { lines: [] }),
      price_items: [],
    });
    expect(screen.getByText("No line items yet.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "+ Add line item" }));
    expect(
      screen.getByText(
        "Your price list is empty. Add items in Settings, under Price list and tax.",
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText("Total: $0.00")).toBeTruthy();
  });

  it("locks a sent invoice: no changes to visits, lines or tax", async () => {
    const { writes } = await renderEditor("sent");
    expect(screen.getByText("Sent invoices can't be changed.")).toBeTruthy();
    expect(screen.getByText("Riley Example · 1 visit")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Change visits" })).toBeNull();
    // Lines stay collapsed and can't be opened.
    expect(within(screen.getByLabelText("Follow-up visit")).getByText("2 ×")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Follow-up visit, / })).toBeNull();
    expect(screen.queryByRole("button", { name: "+ Add line item" })).toBeNull();
    expect(screen.queryByText("Save draft")).toBeNull();
    await fireEvent.press(screen.getByRole("switch", { name: "Add tax (5%)" }));
    expect(writes).toEqual([]);
  });

  it("records a payment on a sent invoice, with Undo", async () => {
    const { writes } = await renderScreen(
      <Invoice invoiceId={INVOICE} />,
      rows("sent"),
      lookupFor("sent"),
    );
    await fireEvent.press(screen.getByText("Record payment"));
    await waitFor(() => expect(writes.length).toBe(1));
    expect(writes[0]?.sql).toContain("UPDATE invoices SET status");
    expect(writes[0]?.parameters).toEqual(["paid", TEST_NOW, TEST_NOW, TEST_NOW, INVOICE]);
    expect((await screen.findAllByText("Marked paid")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Undo").length).toBeGreaterThan(0);
  });

  it("keeps the Marked paid toast until Undo is used or it's dismissed", async () => {
    const { writes } = await renderScreen(
      <Invoice invoiceId={INVOICE} />,
      rows("sent"),
      lookupFor("sent"),
    );
    jest.useFakeTimers();
    try {
      await fireEvent.press(screen.getByText("Record payment"));
      await waitFor(() => expect(writes.length).toBe(1));
      await screen.findAllByText("Marked paid");
      await act(() => {
        jest.advanceTimersByTime(60_000);
      });
      expect(screen.getAllByText("Marked paid").length).toBeGreaterThan(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it("undoes a payment from the toast, back to sent", async () => {
    // The payment was recorded: writes now read the invoice as paid.
    let status: Status = "sent";
    const { writes } = await renderScreen(<Invoice invoiceId={INVOICE} />, rows("sent"), (sql, p) =>
      lookupFor(status)(sql, p),
    );
    await fireEvent.press(screen.getByText("Record payment"));
    await waitFor(() => expect(writes.length).toBe(1));
    status = "paid";
    const [undo] = await screen.findAllByText("Undo");
    if (!undo) throw new Error("The toast has no Undo.");
    await fireEvent.press(undo);
    await waitFor(() => expect(writes.length).toBe(2));
    expect(writes[1]?.parameters).toEqual(["sent", TEST_NOW, null, TEST_NOW, INVOICE]);
  });

  it("shows when a paid invoice was paid, and nothing to press", async () => {
    await renderScreen(<Invoice invoiceId={INVOICE} />, rows("paid"));
    expect(screen.getByText("Paid")).toBeTruthy();
    expect(
      screen.getByText(/^Paid on November 12, 2026\. Kept for your tax records\.$/),
    ).toBeTruthy();
    expect(screen.queryByText("Record payment")).toBeNull();
    expect(screen.queryByLabelText("One more Follow-up visit")).toBeNull();
  });

  it("opens the preview from a draft, and has no payment to record yet", async () => {
    await renderScreen(<Invoice invoiceId={INVOICE} />, rows("draft"));
    expect(screen.queryByText("Record payment")).toBeNull();
    await fireEvent.press(screen.getByText("Preview and send"));
    expect(mockRouter.navigate).toHaveBeenCalledWith({
      pathname: "/invoice-preview/[id]",
      params: { id: INVOICE },
    });
  });

  it("saves the draft and goes back, saying so", async () => {
    mockRouter.canGoBack.mockReturnValue(true);
    const { writes } = await renderScreen(<Invoice invoiceId={INVOICE} />, rows("draft"));
    await fireEvent.press(screen.getByText("Save draft"));
    expect((await screen.findAllByText("Draft saved")).length).toBeGreaterThan(0);
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    // Every change was already saved on the phone; nothing more is written.
    expect(writes).toEqual([]);
  });

  it("has nothing to preview and send once sent or paid", async () => {
    const { setRows } = await renderScreen(<Invoice invoiceId={INVOICE} />, rows("sent"));
    expect(screen.queryByText("Preview and send")).toBeNull();
    await setRows(rows("paid"));
    expect(screen.queryByText("Preview and send")).toBeNull();
  });

  it("says a new invoice is offline until it reaches the server, and can't be sent yet", async () => {
    const { setPending } = await renderScreen(<Invoice invoiceId={INVOICE} />, rows("draft"));
    await setPending([INVOICE]);
    expect(screen.getByRole("header", { name: "New invoice" })).toBeTruthy();
    expect(screen.queryByText("INV-0004")).toBeNull();
    expect(screen.getByText("Offline · saved on this phone")).toBeTruthy();
    expect(screen.getByText("Number: Given when you're online")).toBeTruthy();
    expect(
      screen.getByText(
        "Waiting to reach the server before you can send. Your invoice is safe on this phone.",
      ),
    ).toBeTruthy();
    await fireEvent.press(screen.getByText("Preview and send"));
    expect(mockRouter.navigate).not.toHaveBeenCalled();

    // Once it has uploaded, the number is final and the button works.
    await setPending([]);
    expect(screen.getByRole("header", { name: "INV-0004" })).toBeTruthy();
    expect(screen.queryByText("Offline · saved on this phone")).toBeNull();
    await fireEvent.press(screen.getByText("Preview and send"));
    expect(mockRouter.navigate).toHaveBeenCalledTimes(1);
  });

  it("says so when the invoice isn't there", async () => {
    await renderScreen(<Invoice invoiceId="ffffffff-0000-4000-8000-000000000009" />, rows("draft"));
    expect(screen.getByRole("header", { name: "Invoice not found" })).toBeTruthy();
    expect(screen.getByLabelText("Back")).toBeTruthy();
  });
});
