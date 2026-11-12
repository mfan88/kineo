import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { patientRow, renderScreen, TEST_NOW, TEST_OWNER, visitRow } from "@/test/render-screen";
import { InvoicePreview } from "./index";

const mockRouter = {
  canGoBack: jest.fn<() => boolean>(() => true),
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

// The native web view isn't there in Jest: a plain view that keeps what it was given.
jest.mock("react-native-webview", () => {
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    WebView: (props: object) => <View testID="invoice-web-view" {...props} />,
  };
});

const mockSharePdf = jest.fn<(html: string, fileName: string) => Promise<void>>();
jest.mock("@/utils/share-pdf", () => ({
  ShareUnavailableError: class ShareUnavailableError extends Error {},
  sharePdf: (html: string, fileName: string) => mockSharePdf(html, fileName),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockRouter.canGoBack.mockReturnValue(true);
  mockSharePdf.mockResolvedValue();
});

const RILEY = "11111111-1111-4111-8111-111111111111";
const INVOICE = "bbbbbbbb-0000-4000-8000-000000000001";
const LINE = "dddddddd-0000-4000-8000-000000000001";
const OWN = "eeeeeeee-0000-4000-8000-000000000001";

type Status = "draft" | "sent" | "paid";

function invoiceRow(status: Status) {
  return {
    id: INVOICE,
    owner_id: TEST_OWNER,
    patient_id: RILEY,
    number: 4,
    status,
    tax_enabled: 0,
    tax_rate_basis_points: 500,
    sent_at: status === "draft" ? null : TEST_NOW,
    paid_at: status === "paid" ? TEST_NOW : null,
    created_at: TEST_NOW,
    updated_at: TEST_NOW,
  };
}

const LINES = [
  {
    id: LINE,
    owner_id: TEST_OWNER,
    invoice_id: INVOICE,
    price_item_id: null,
    name: "Follow-up <visit>",
    unit_price_cents: 9500,
    quantity: 2,
    position: 0,
  },
];

function profileRow(phone = "604-555-0100") {
  return {
    id: OWN,
    owner_id: TEST_OWNER,
    full_name: "Sam Practitioner",
    full_name_on_invoice: 1,
    title: "Registered physiotherapist",
    title_on_invoice: 1,
    clinic_name: "",
    clinic_name_on_invoice: 0,
    address: "",
    address_on_invoice: 0,
    phone,
    phone_on_invoice: 1,
    updated_at: TEST_NOW,
  };
}

function rows(status: Status, { lines = LINES, profile = profileRow() } = {}) {
  return {
    patients: [patientRow(RILEY, "Riley Example")],
    visits: [
      visitRow("aaaaaaaa-0000-4000-8000-000000000001", RILEY, "2026-10-28", "Note.", INVOICE),
    ],
    invoices: [invoiceRow(status)],
    invoice_lines: lines,
    profiles: [profile],
    practice_settings: [
      {
        id: OWN,
        owner_id: TEST_OWNER,
        default_tax_rate_basis_points: 500,
        invoice_number_prefix: "INV-",
        updated_at: TEST_NOW,
      },
    ],
  };
}

function lookupFor(status: Status, lineCount = 1) {
  return (sql: string): unknown => {
    if (sql.includes("COUNT(*)")) return { count: lineCount };
    if (sql.includes("FROM invoices")) return invoiceRow(status);
    return null;
  };
}

const shownHtml = (): string => screen.getByTestId("invoice-web-view").props.source.html;

describe("Invoice preview", () => {
  it("shows the invoice as the patient receives it, from the shared template", async () => {
    await renderScreen(<InvoicePreview invoiceId={INVOICE} />, rows("draft"));
    expect(screen.getByRole("header", { name: "Preview" })).toBeTruthy();
    expect(screen.getByText("Invoice INV-0004")).toBeTruthy();
    expect(screen.getByLabelText("Invoice INV-0004 as the patient sees it")).toBeTruthy();
    expect(screen.getByLabelText("Back")).toBeTruthy();

    const html = shownHtml();
    expect(html).toContain("<title>Invoice INV-0004</title>");
    expect(html).toContain("Riley Example");
    expect(html).toContain("Sam Practitioner");
    expect(html).toContain("604-555-0100");
    expect(html).toContain("Follow-up &lt;visit&gt;");
    expect(html).toContain("$190.00");
    expect(html).toContain("Visit on October 28, 2026");
    // Laid out as a letter page, and only shown: no scripts run in it.
    expect(html).toContain('content="width=816"');
    expect(screen.getByTestId("invoice-web-view").props.javaScriptEnabled).toBe(false);
  });

  it("marks a ready draft as sent, says so and goes back to the editor", async () => {
    const { writes } = await renderScreen(
      <InvoicePreview invoiceId={INVOICE} />,
      rows("draft"),
      lookupFor("draft"),
    );
    expect(screen.queryByRole("alert")).toBeNull();
    await fireEvent.press(screen.getByText("Mark as sent"));
    await waitFor(() => expect(writes.length).toBe(1));
    expect(writes[0]?.sql).toContain("UPDATE invoices SET status");
    expect(writes[0]?.parameters).toEqual(["sent", TEST_NOW, null, TEST_NOW, INVOICE]);
    expect((await screen.findAllByText("Invoice sent")).length).toBeGreaterThan(0);
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it("blocks sending without line items, and says what to do", async () => {
    const { writes } = await renderScreen(
      <InvoicePreview invoiceId={INVOICE} />,
      rows("draft", { lines: [] }),
      lookupFor("draft", 0),
    );
    expect(screen.getByText("Add at least one line item before sending.")).toBeTruthy();
    await fireEvent.press(screen.getByText("Mark as sent"));
    expect(writes).toEqual([]);
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it("blocks sending while a profile field shown on invoices is empty, naming it", async () => {
    const { writes } = await renderScreen(
      <InvoicePreview invoiceId={INVOICE} />,
      rows("draft", { profile: profileRow("") }),
      lookupFor("draft"),
    );
    expect(
      screen.getByText("Fill in your phone in Settings, or stop showing it on invoices."),
    ).toBeTruthy();
    await fireEvent.press(screen.getByText("Mark as sent"));
    expect(writes).toEqual([]);
  });

  it("blocks sending and sharing until the invoice has reached the server", async () => {
    const { writes, setPending } = await renderScreen(
      <InvoicePreview invoiceId={INVOICE} />,
      rows("draft"),
      lookupFor("draft"),
    );
    await setPending([INVOICE]);
    expect(
      screen.getByText(/hasn't reached the server yet, so its number isn't final/),
    ).toBeTruthy();
    await fireEvent.press(screen.getByText("Mark as sent"));
    await fireEvent.press(screen.getByText("Share PDF"));
    expect(writes).toEqual([]);
    expect(mockSharePdf).not.toHaveBeenCalled();

    // Once it has uploaded, both work.
    await setPending([]);
    expect(screen.queryByRole("alert")).toBeNull();
    await fireEvent.press(screen.getByText("Share PDF"));
    await waitFor(() => expect(mockSharePdf).toHaveBeenCalledTimes(1));
  });

  it("shares the PDF made from the template's own HTML, named after the invoice", async () => {
    await renderScreen(<InvoicePreview invoiceId={INVOICE} />, rows("draft"));
    await fireEvent.press(screen.getByText("Share PDF"));
    await waitFor(() => expect(mockSharePdf).toHaveBeenCalledTimes(1));
    const [html, fileName] = mockSharePdf.mock.calls[0] ?? [];
    expect(fileName).toBe("Invoice INV-0004.pdf");
    // The page as it prints, not the preview's scaled-down copy.
    expect(html).toContain("width=device-width");
    expect(html).toContain("@page { size: letter;");
    expect(html).toContain("Riley Example");
  });

  it("says so when the PDF can't be made", async () => {
    mockSharePdf.mockRejectedValue(new Error("printer on fire: Riley Example"));
    await renderScreen(<InvoicePreview invoiceId={INVOICE} />, rows("draft"));
    await fireEvent.press(screen.getByText("Share PDF"));
    expect(
      (await screen.findAllByText("The PDF couldn't be made. Try again.")).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/printer on fire/)).toBeNull();
  });

  it("offers only sharing once sent or paid", async () => {
    const sent = await renderScreen(<InvoicePreview invoiceId={INVOICE} />, rows("sent"));
    expect(screen.getByText("This invoice has been sent.")).toBeTruthy();
    expect(screen.queryByText("Mark as sent")).toBeNull();
    // A sent invoice can be shared again even if a later change is still uploading.
    await sent.setPending([INVOICE]);
    await fireEvent.press(screen.getByText("Share PDF"));
    await waitFor(() => expect(mockSharePdf).toHaveBeenCalledTimes(1));

    await sent.setRows(rows("paid"));
    expect(screen.getByText("This invoice has been paid.")).toBeTruthy();
  });

  it("says so when the invoice isn't there", async () => {
    await renderScreen(
      <InvoicePreview invoiceId="ffffffff-0000-4000-8000-000000000009" />,
      rows("draft"),
    );
    expect(screen.getByRole("header", { name: "Invoice not found" })).toBeTruthy();
  });
});
