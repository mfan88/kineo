import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Alert, type AlertButton } from "react-native";
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

type Status = "draft" | "sent" | "paid" | "cancelled";

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
    cancelled_at: status === "cancelled" ? TEST_NOW : null,
    cancelled_visit_dates: status === "cancelled" ? '["2026-10-20","2026-10-28"]' : null,
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
    if (sql.includes("FROM visits WHERE invoice_id")) {
      return VISITS.filter((row) => row.invoice_id === id);
    }
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
      // A self-pay invoice's lines have no service date.
      null,
    ]);
  });

  it("adds a new price list item from the sheet and puts it on the invoice as a line", async () => {
    const base = lookupFor("draft");
    const { writes } = await renderScreen(
      <Invoice invoiceId={INVOICE} today={TODAY} />,
      rows("draft"),
      // Once the item is saved, the line copies it back from the database.
      (sql, parameters) =>
        sql.includes("FROM price_items") && parameters[0] === NEW_ID
          ? priceRow(NEW_ID, "Dry needling", 8000)
          : base(sql, parameters),
    );
    await fireEvent.press(screen.getByRole("button", { name: "+ Add line item" }));
    await fireEvent.press(screen.getByRole("button", { name: "+ New price list item" }));
    expect(screen.getByText("New item")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Item name"), "Dry needling");
    await fireEvent.changeText(screen.getByLabelText("Item price in dollars"), "80");
    await fireEvent.press(screen.getByText("Save item"));

    await waitFor(() => expect(writes.length).toBe(3));
    expect(writes[0]?.sql).toContain("INSERT INTO price_items");
    expect(writes[0]?.parameters.slice(2, 4)).toEqual(["Dry needling", 8000]);
    expect(writes[1]?.sql).toContain("INSERT INTO invoice_lines");
    expect(writes[1]?.parameters.slice(4, 7)).toEqual(["Dry needling", 8000, 1]);
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
    expect(screen.getByText("Your price list is empty.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "+ New price list item" })).toBeTruthy();
    expect(screen.getByLabelText("Total: $0.00")).toBeTruthy();
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

describe("Invoice detail", () => {
  it("shows a sent invoice's tag, total, number, patient and sent date, visits and tax", async () => {
    await renderEditor("sent", { tax: true });
    expect(screen.getByText("Waiting on payment")).toBeTruthy();
    // 209.99 + 5% tax (10.4995, rounded half up to 10.50).
    expect(screen.getByRole("header", { name: "$220.49" })).toBeTruthy();
    expect(screen.getByText("INV-0004 · Riley Example · sent 12 Nov")).toBeTruthy();
    expect(screen.getByLabelText("Visits: 28 Oct")).toBeTruthy();
    expect(screen.getByLabelText("Tax: 5% · $10.50")).toBeTruthy();
    expect(screen.getByLabelText("Back")).toBeTruthy();
    // Nothing to change once sent.
    expect(screen.queryByText("Change visits")).toBeNull();
    expect(screen.queryByText("+ Add line item")).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByText("Preview and send")).toBeNull();
    expect(screen.queryByText("Save draft")).toBeNull();
  });

  it("says None when there's no tax", async () => {
    await renderEditor("sent");
    expect(screen.getByLabelText("Tax: None")).toBeTruthy();
    expect(screen.getByRole("header", { name: "$209.99" })).toBeTruthy();
  });

  it("opens the PDF again from View PDF", async () => {
    await renderEditor("sent");
    await fireEvent.press(screen.getByRole("button", { name: "View PDF" }));
    expect(mockRouter.navigate).toHaveBeenCalledWith({
      pathname: "/invoice-preview/[id]",
      params: { id: INVOICE },
    });
  });

  it("records a payment, with Undo", async () => {
    const { writes } = await renderEditor("sent");
    await fireEvent.press(screen.getByText("Record payment"));
    await waitFor(() => expect(writes.length).toBe(1));
    expect(writes[0]?.sql).toContain("UPDATE invoices SET status");
    expect(writes[0]?.parameters).toEqual([
      "paid",
      TEST_NOW,
      TEST_NOW,
      null,
      null,
      TEST_NOW,
      INVOICE,
    ]);
    expect((await screen.findAllByText("Marked paid")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Undo").length).toBeGreaterThan(0);
  });

  it("keeps the Marked paid toast until Undo is used or it's dismissed", async () => {
    const { writes } = await renderEditor("sent");
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
    const { writes } = await renderScreen(
      <Invoice invoiceId={INVOICE} today={TODAY} />,
      rows("sent"),
      (sql, p) => lookupFor(status)(sql, p),
    );
    await fireEvent.press(screen.getByText("Record payment"));
    await waitFor(() => expect(writes.length).toBe(1));
    status = "paid";
    const [undo] = await screen.findAllByText("Undo");
    if (!undo) throw new Error("The toast has no Undo.");
    await fireEvent.press(undo);
    await waitFor(() => expect(writes.length).toBe(2));
    expect(writes[1]?.parameters).toEqual(["sent", TEST_NOW, null, null, null, TEST_NOW, INVOICE]);
  });

  it("shows a paid invoice with the day it was paid, and nothing to press but View PDF", async () => {
    await renderEditor("paid");
    expect(screen.getByText("Paid")).toBeTruthy();
    expect(screen.getByText("INV-0004 · Riley Example · paid 12 Nov")).toBeTruthy();
    expect(screen.queryByText("Record payment")).toBeNull();
    expect(screen.getByRole("button", { name: "View PDF" })).toBeTruthy();
  });

  describe("cancelling", () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const buttons = (): AlertButton[] => alert.mock.calls.at(-1)?.[2] ?? [];
    beforeEach(() => {
      alert.mockClear();
    });

    it("offers Cancel invoice on a sent invoice only", async () => {
      await renderEditor("sent");
      expect(screen.getByText("Cancel invoice")).toBeTruthy();
    });

    it("has no Cancel invoice on a paid invoice", async () => {
      await renderEditor("paid");
      expect(screen.queryByText("Cancel invoice")).toBeNull();
    });

    it("asks first, and Keep invoice writes nothing", async () => {
      const { writes } = await renderEditor("sent");
      await fireEvent.press(screen.getByText("Cancel invoice"));
      expect(alert.mock.calls.at(-1)?.[0]).toBe("Cancel INV-0004?");
      expect(alert.mock.calls.at(-1)?.[1]).toBe(
        "Its visits go back to Ready to invoice. INV-0004 stays in your records as cancelled and won't be used again.",
      );
      expect(buttons().map((b) => [b.text, b.style])).toEqual([
        ["Keep invoice", "cancel"],
        ["Cancel invoice", "destructive"],
      ]);
      expect(writes).toEqual([]);
    });

    it("cancels: the status and the release of its visits, then says so", async () => {
      const { writes } = await renderEditor("sent");
      await fireEvent.press(screen.getByText("Cancel invoice"));
      await act(async () => {
        buttons()[1]?.onPress?.();
      });
      await waitFor(() => expect(writes.length).toBe(2));
      expect(writes[0]?.sql).toContain("UPDATE invoices SET status");
      expect(writes[0]?.parameters).toEqual([
        "cancelled",
        TEST_NOW,
        null,
        TEST_NOW,
        '["2026-10-28"]',
        TEST_NOW,
        INVOICE,
      ]);
      expect(writes[1]?.sql).toContain("UPDATE visits SET invoice_id");
      expect(writes[1]?.parameters).toEqual([null, TEST_NOW, V_ON]);
      expect((await screen.findAllByText("Invoice cancelled")).length).toBeGreaterThan(0);
    });

    it("shows a cancelled invoice as a record: tag, date, kept visit dates, only View PDF", async () => {
      await renderEditor("cancelled");
      expect(screen.getAllByText("Cancelled").length).toBeGreaterThan(0);
      expect(screen.getByText("INV-0004 · Riley Example · cancelled 12 Nov")).toBeTruthy();
      expect(screen.getByLabelText("Visits: 20 Oct, 28 Oct")).toBeTruthy();
      expect(screen.queryByText("Record payment")).toBeNull();
      expect(screen.queryByText("Cancel invoice")).toBeNull();
      expect(screen.getByRole("button", { name: "View PDF" })).toBeTruthy();
    });
  });

  it("turns from the editor into the detail once sent", async () => {
    const { setRows } = await renderEditor("draft");
    expect(screen.getByText("Preview and send")).toBeTruthy();
    await setRows(rows("sent"));
    expect(screen.queryByText("Preview and send")).toBeNull();
    expect(screen.getByText("Record payment")).toBeTruthy();
  });
});

const selfPayInvoice = (over: Record<string, unknown> = {}) => ({
  ...invoiceRow("draft"),
  bill_to_kind: "patient",
  bill_to_name: "Riley Example",
  bill_to_address: "",
  bill_to_funding_name: "",
  patient_funding_id: null,
  bill_to_details: "[]",
  ...over,
});

const card = () => within(screen.getByLabelText("Bill to details"));

describe("Bill to", () => {
  const TYPE = "eeeeeeee-0000-4000-8000-000000000001";
  const DETAIL = "eeeeeeee-0000-4000-8000-000000000002";
  const FUNDING = "eeeeeeee-0000-4000-8000-000000000003";

  const fundedInvoice = (over: Record<string, unknown> = {}) => ({
    ...invoiceRow("draft"),
    bill_to_kind: "funding",
    bill_to_name: "Example Branch",
    bill_to_address: "PO Box 1",
    bill_to_funding_name: "Autism Funding",
    patient_funding_id: FUNDING,
    bill_to_details: JSON.stringify([{ id: DETAIL, label: "Billing number", value: "4821" }]),
    ...over,
  });
  const typeRow = {
    id: TYPE,
    owner_id: TEST_OWNER,
    name: "Autism Funding",
    recipient_name: "Example Branch",
    recipient_address: "PO Box 1",
    details: JSON.stringify([
      { id: DETAIL, label: "Billing number", kind: "text", show_on_invoice: true },
    ]),
    created_at: TEST_NOW,
    updated_at: TEST_NOW,
  };
  const fundingRow = {
    id: FUNDING,
    owner_id: TEST_OWNER,
    patient_id: RILEY,
    funding_type_id: TYPE,
    detail_values: JSON.stringify({ [DETAIL]: "4821" }),
    period_start: "2026-04-01",
    period_end: "2027-03-31",
    ended_on: null,
    created_at: TEST_NOW,
    updated_at: TEST_NOW,
  };

  /** The practice with this invoice, and the patient's funding unless it's left out. */
  const billingRows = (invoice: Record<string, unknown>, withFunding = true) => ({
    ...rows("draft"),
    // Each line is dated for the visit on the invoice, as a funded invoice needs to be sent.
    invoice_lines: LINES.map((line) => ({ ...line, service_date: "2026-10-28" })),
    invoices: [invoice],
    funding_types: withFunding ? [typeRow] : [],
    patient_fundings: withFunding ? [fundingRow] : [],
  });

  /** What writes read first: the invoice as it stands, the patient and their fundings. */
  const billingLookup = (invoice: Record<string, unknown>, withFunding = true) => {
    const base = lookupFor("draft");
    return (sql: string, parameters: unknown[]): unknown => {
      if (sql.includes("FROM invoices WHERE id")) return invoice;
      if (sql.includes("FROM patients")) return patientRow(RILEY, "Riley Example");
      if (sql.includes("FROM patient_fundings")) return withFunding ? [fundingRow] : [];
      if (sql.includes("FROM funding_types")) return withFunding ? [typeRow] : [];
      return base(sql, parameters);
    };
  };

  const renderBilling = (invoice: Record<string, unknown>, withFunding = true) =>
    renderScreen(
      <Invoice invoiceId={INVOICE} today={TODAY} />,
      billingRows(invoice, withFunding),
      billingLookup(invoice, withFunding),
    );

  it("shows a funded draft's funding, recipient and a required detail with its value", async () => {
    await renderBilling(fundedInvoice());
    const funded = within(screen.getByLabelText("Bill to details"));
    expect(funded.getByTestId("funding-chip-funding")).toBeTruthy();
    expect(funded.getByText("Example Branch")).toBeTruthy();
    // A required field's label carries HeroUI's asterisk.
    expect(funded.getByText(/^Billing number/)).toBeTruthy();
    expect(funded.getByText("Required")).toBeTruthy();
    expect(screen.getByLabelText("Billing number").props.value).toBe("4821");
    expect(funded.getByText("Change")).toBeTruthy();
    expect(screen.queryByText("Add the billing number before sending.")).toBeNull();
  });

  it("saves a detail on leaving the field", async () => {
    const { writes } = await renderBilling(fundedInvoice());
    await fireEvent.changeText(screen.getByLabelText("Billing number"), " 9999 ");
    await fireEvent(screen.getByLabelText("Billing number"), "blur");
    await waitFor(() => expect(writes.length).toBe(1));
    expect(writes[0]?.sql).toContain("UPDATE invoices SET bill_to_details");
    expect(writes[0]?.parameters[0]).toBe(
      JSON.stringify([{ id: DETAIL, label: "Billing number", value: "9999" }]),
    );
  });

  it("says what to do when a detail is cleared, and Preview and send doesn't go on", async () => {
    const { setRows, writes } = await renderBilling(fundedInvoice());
    await fireEvent.changeText(screen.getByLabelText("Billing number"), "");
    await fireEvent(screen.getByLabelText("Billing number"), "blur");
    await waitFor(() => expect(writes.length).toBe(1));
    // The write reaches the database, so the invoice now has no number.
    const cleared = fundedInvoice({
      bill_to_details: JSON.stringify([{ id: DETAIL, label: "Billing number", value: "" }]),
    });
    await setRows(billingRows(cleared));
    expect(await screen.findByText("Add the billing number before sending.")).toBeTruthy();

    await fireEvent.press(screen.getByText("Preview and send"));
    expect(mockRouter.navigate).not.toHaveBeenCalled();
    expect(screen.getByText("Add the billing number before sending.")).toBeTruthy();
  });

  it("goes to the preview when Bill to has nothing missing", async () => {
    await renderBilling(fundedInvoice());
    await fireEvent.press(screen.getByText("Preview and send"));
    expect(mockRouter.navigate).toHaveBeenCalledTimes(1);
  });

  it("refuses a date it can't read in a date detail, and saves nothing", async () => {
    const dateType = {
      ...typeRow,
      details: JSON.stringify([
        { id: DETAIL, label: "Authorization date", kind: "date", show_on_invoice: true },
      ]),
    };
    const invoice = fundedInvoice({
      bill_to_details: JSON.stringify([
        { id: DETAIL, label: "Authorization date", value: "1 Apr 2026" },
      ]),
    });
    const { writes } = await renderScreen(
      <Invoice invoiceId={INVOICE} today={TODAY} />,
      { ...billingRows(invoice), funding_types: [dateType] },
      billingLookup(invoice),
    );
    await fireEvent.changeText(screen.getByLabelText("Authorization date"), "April 1");
    await fireEvent(screen.getByLabelText("Authorization date"), "blur");
    expect(await screen.findByText("Enter a date like 1 Apr 2026.")).toBeTruthy();
    expect(writes).toHaveLength(0);
  });

  it("lists the choices in Change and switches to self-pay", async () => {
    const invoice = fundedInvoice();
    const { writes, setRows } = await renderBilling(invoice);
    await fireEvent.press(card().getByText("Change"));
    const group = screen.getByLabelText("Bill to");
    const choices = within(group).getAllByRole("radio");
    expect(choices.map((choice) => choice.props.accessibilityLabel)).toEqual([
      "Autism Funding, Billing number 4821 \u00b7 to 31 Mar 2027",
      "Self-pay, Riley Example",
    ]);
    expect(choices[0]?.props.accessibilityState).toMatchObject({ checked: true });
    expect(choices[1]?.props.accessibilityState).toMatchObject({ checked: false });

    await fireEvent.press(choices[1] ?? group);
    await waitFor(() => expect(writes.length).toBeGreaterThan(0));
    expect(writes[0]?.sql).toContain("UPDATE invoices SET bill_to_kind");
    expect(writes[0]?.parameters.slice(0, 6)).toEqual([
      "patient",
      "Riley Example",
      "",
      "",
      null,
      "[]",
    ]);
    await setRows(billingRows(selfPayInvoice()));
    expect(card().getByTestId("funding-chip-selfPay")).toBeTruthy();
    expect(card().queryByTestId("funding-chip-funding")).toBeNull();
  });

  it("only offers Change on a self-pay invoice when the patient has a funding", async () => {
    await renderBilling(selfPayInvoice(), false);
    expect(card().queryByText("Change")).toBeNull();
    expect(card().getByText("Riley Example")).toBeTruthy();
  });

  it("offers Change on a self-pay invoice when the patient has a funding", async () => {
    await renderBilling(selfPayInvoice());
    expect(card().getByText("Change")).toBeTruthy();
  });

  it("adds an address to a self-pay invoice, saves it and says so", async () => {
    const { writes } = await renderBilling(selfPayInvoice(), false);
    expect(
      card().getByText("No address yet. A name is enough, an address is optional."),
    ).toBeTruthy();
    await fireEvent.press(card().getByText("Add address"));
    expect(card().getByText("Optional")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Address"), " 5 Sample Ave\nBurnaby BC ");
    await fireEvent.press(card().getByText("Save address"));

    await waitFor(() => expect(writes.length).toBe(2));
    expect(writes[0]?.sql).toContain("UPDATE invoices SET bill_to_address");
    expect(writes[0]?.parameters[0]).toBe("5 Sample Ave\nBurnaby BC");
    expect(writes[1]?.sql).toContain("UPDATE patients SET billing_address");
    expect((await screen.findAllByText("Address saved")).length).toBeGreaterThan(0);
  });

  it("shows an existing address and offers to edit it, or to cancel without saving", async () => {
    const { writes } = await renderBilling(
      selfPayInvoice({ bill_to_address: "5 Sample Ave" }),
      false,
    );
    expect(card().getByText("5 Sample Ave")).toBeTruthy();
    await fireEvent.press(card().getByText("Edit address"));
    expect(screen.getByLabelText("Address").props.value).toBe("5 Sample Ave");
    await fireEvent.press(card().getByText("Cancel"));
    expect(card().getByText("Edit address")).toBeTruthy();
    expect(writes).toHaveLength(0);
  });

  it("says a funding with no recipient needs one set up on the computer", async () => {
    await renderBilling(
      fundedInvoice({
        bill_to_name: "",
        bill_to_address: "",
        bill_to_funding_name: "ICBC",
        bill_to_details: "[]",
      }),
    );
    const message =
      "ICBC has no recipient name or address. Add them in Kine\u014d on your computer, under Settings, then send.";
    // It shows straight away (as on desktop), and Preview and send doesn't go on.
    expect(screen.getByRole("alert", { name: message })).toBeTruthy();
    await fireEvent.press(screen.getByText("Preview and send"));
    expect(mockRouter.navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("alert", { name: message })).toBeTruthy();
  });

  describe("dated lines", () => {
    const V_SECOND = "aaaaaaaa-0000-4000-8000-000000000009";
    const secondVisit = visitRow(V_SECOND, RILEY, "2026-11-04", "Again.", INVOICE);
    const datedLines = [
      { ...LINES[0], service_date: "2026-11-04" },
      { ...LINES[1], service_date: null },
    ];

    /** A funded draft on two visit dates, the first line dated and the second not. */
    const renderDated = (invoice: Record<string, unknown> = fundedInvoice()) => {
      const base = billingLookup(invoice);
      return renderScreen(
        <Invoice invoiceId={INVOICE} today={TODAY} />,
        {
          ...billingRows(invoice),
          invoice_lines: datedLines,
          visits: [...VISITS, secondVisit],
        },
        (sql, parameters) =>
          sql.includes("FROM visits WHERE invoice_id")
            ? [VISITS[0], secondVisit]
            : base(sql, parameters),
      );
    };

    it("starts a funded invoice's lines with their visit date, or says to pick one", async () => {
      await renderDated();
      expect(
        screen.getByRole("button", { name: "4 Nov \u00b7 Follow-up visit, 2 \u00d7, $190.00" }),
      ).toBeTruthy();
      expect(
        screen.getByRole("button", { name: "Pick a date \u00b7 Taping, 1 \u00d7, $19.99" }),
      ).toBeTruthy();
    });

    it("leaves a self-pay invoice's lines undated", async () => {
      await renderBilling(selfPayInvoice(), false);
      expect(
        screen.getByRole("button", { name: "Follow-up visit, 2 \u00d7, $190.00" }),
      ).toBeTruthy();
      expect(screen.queryByText(/Pick a date/)).toBeNull();
    });

    it("offers the invoice's visit dates when a line is opened, and dates it from the choice", async () => {
      const { writes } = await renderDated();
      expect(screen.queryByLabelText("Visit date for Taping")).toBeNull();
      await fireEvent.press(screen.getByRole("button", { name: /^Pick a date \u00b7 Taping/ }));
      const group = within(screen.getByLabelText("Visit date for Taping"));
      expect(screen.getByText("Visit date")).toBeTruthy();
      const choices = group.getAllByRole("radio");
      expect(choices.map((choice) => choice.props.accessibilityLabel)).toEqual(["28 Oct", "4 Nov"]);
      for (const choice of choices) {
        expect(choice.props.accessibilityState).toMatchObject({ checked: false });
      }

      await fireEvent.press(group.getByRole("radio", { name: "28 Oct" }));
      await waitFor(() => expect(writes.length).toBe(2));
      expect(writes[0]?.sql).toContain("UPDATE invoice_lines SET service_date");
      expect(writes[0]?.parameters).toEqual(["2026-10-28", L_TAPE]);
    });

    it("marks the chosen date on a dated line", async () => {
      await renderDated();
      await fireEvent.press(screen.getByRole("button", { name: /^4 Nov \u00b7 Follow-up visit/ }));
      const group = within(screen.getByLabelText("Visit date for Follow-up visit"));
      expect(group.getByRole("radio", { name: "4 Nov" }).props.accessibilityState).toMatchObject({
        checked: true,
      });
      expect(group.getByRole("radio", { name: "28 Oct" }).props.accessibilityState).toMatchObject({
        checked: false,
      });
    });

    it("stops Preview and send at an undated line, opens it and says what to do", async () => {
      await renderDated();
      expect(screen.queryByText("Pick a visit date for each line item before sending.")).toBeNull();
      await fireEvent.press(screen.getByText("Preview and send"));
      expect(mockRouter.navigate).not.toHaveBeenCalled();
      expect(screen.getByLabelText("Visit date for Taping")).toBeTruthy();
      expect(screen.getByText("Pick a visit date for each line item before sending.")).toBeTruthy();
      // Only the line that needs a date opens.
      expect(screen.queryByLabelText("Visit date for Follow-up visit")).toBeNull();
    });
  });
});

describe("Bill to on a sent invoice", () => {
  const DETAIL = "eeeeeeee-0000-4000-8000-000000000002";
  const sentFunded = {
    ...invoiceRow("sent"),
    bill_to_kind: "funding",
    bill_to_name: "Example Branch",
    bill_to_address: "PO Box 1",
    bill_to_funding_name: "Autism Funding",
    patient_funding_id: null,
    bill_to_details: JSON.stringify([{ id: DETAIL, label: "Billing number", value: "4821" }]),
  };
  const LOCKED = "Locked once sent. Later changes to the funding don't alter this invoice.";

  it("shows the funding, recipient and client details as a record, with the status tag", async () => {
    await renderScreen(<Invoice invoiceId={INVOICE} today={TODAY} />, {
      ...rows("sent"),
      invoices: [sentFunded],
    });
    const billTo = within(screen.getByLabelText("Bill to details"));
    expect(billTo.getByTestId("funding-chip-funding")).toBeTruthy();
    expect(billTo.getByText("Autism Funding")).toBeTruthy();
    expect(billTo.getByText("Example Branch")).toBeTruthy();
    expect(billTo.getByText("Bill for Riley Example \u00b7 Billing number 4821")).toBeTruthy();
    expect(billTo.getByLabelText("Waiting on payment")).toBeTruthy();
    expect(billTo.getByText(LOCKED)).toBeTruthy();
  });

  it("has nothing to change: no Change, no inputs", async () => {
    await renderScreen(<Invoice invoiceId={INVOICE} today={TODAY} />, {
      ...rows("sent"),
      invoices: [sentFunded],
    });
    expect(screen.queryByText("Change")).toBeNull();
    expect(screen.queryByLabelText("Billing number")).toBeNull();
    expect(screen.queryByText("Add address")).toBeNull();
  });

  it("shows a paid self-pay invoice as Self-pay with the patient and the lock", async () => {
    await renderScreen(<Invoice invoiceId={INVOICE} today={TODAY} />, {
      ...rows("paid"),
      invoices: [
        {
          ...invoiceRow("paid"),
          bill_to_kind: "patient",
          bill_to_name: "Riley Example",
          bill_to_address: "",
          bill_to_funding_name: "",
          patient_funding_id: null,
          bill_to_details: "[]",
        },
      ],
    });
    const billTo = within(screen.getByLabelText("Bill to details"));
    expect(billTo.getByTestId("funding-chip-selfPay")).toBeTruthy();
    expect(billTo.getByText("Riley Example")).toBeTruthy();
    expect(billTo.queryByText(/^Bill for /)).toBeNull();
    expect(billTo.getByText(LOCKED)).toBeTruthy();
  });
});
