import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { InvoiceGroupKey } from "@kineo/shared";
import type { PracticeData } from "@kineo/data";
import { createDemoPractice } from "@kineo/data/demo";
import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { HeroUINativeProvider } from "heroui-native";
import { initialWindowMetrics, SafeAreaProvider } from "react-native-safe-area-context";
import { DemoPracticeProvider } from "@/data/practice-data";
import { Invoices } from "./index";

const mockRouter = {
  navigate: jest.fn<(href: unknown) => void>(),
  setParams: jest.fn<(params: unknown) => void>(),
};
// jest.mock is hoisted above mockRouter, so look it up when the screen uses it.
jest.mock("expo-router", () => ({
  get router() {
    return mockRouter;
  },
  useIsFocused: () => true,
}));

// Safe area insets as on a phone (the provider renders nothing until it has some).
const METRICS = initialWindowMetrics ?? {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

beforeEach(() => {
  jest.clearAllMocks();
});

function renderInvoices(data: PracticeData = createDemoPractice(), group?: InvoiceGroupKey) {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <HeroUINativeProvider config={{ devInfo: { stylingPrinciples: false } }}>
        <DemoPracticeProvider data={data}>
          <Invoices group={group} />
        </DemoPracticeProvider>
      </HeroUINativeProvider>
    </SafeAreaProvider>,
  );
}

const tab = (name: RegExp) => screen.getByRole("tab", { name });

describe("Invoices", () => {
  it("shows the four groups as pills with their counts, opening on the first with invoices", async () => {
    await renderInvoices();
    expect(screen.getByRole("header", { name: "Invoices" })).toBeTruthy();
    const pills = within(screen.getByLabelText("Invoice groups")).getAllByRole("tab");
    expect(pills.map((pill) => pill.props.accessibilityLabel)).toEqual([
      "Not sent yet, 1 invoice",
      "Waiting on payment, 1 invoice",
      "Paid, 1 invoice",
      "Cancelled, 0 invoices",
    ]);
    expect(screen.getByText("Not sent yet · 1")).toBeTruthy();
    expect(screen.getByText("Waiting · 1")).toBeTruthy();
    expect(screen.getByText("Paid · 1")).toBeTruthy();
    expect(screen.getByText("Cancelled · 0")).toBeTruthy();
    expect(tab(/^Not sent yet/).props.accessibilityState).toMatchObject({ selected: true });

    // Only the draft shows, with its number, patient, total and tag.
    const list = within(screen.getByLabelText("Invoices: Not sent yet"));
    const draft = within(list.getByLabelText(/^INV-0003, .+, \$120\.00, Draft$/));
    expect(draft.getByText("INV-0003")).toBeTruthy();
    expect(draft.getByText("$120.00")).toBeTruthy();
    expect(list.queryByText("INV-0001")).toBeNull();
    expect(list.queryByText("INV-0002")).toBeNull();
  });

  it("opens on the group asked for, such as Waiting on payment from Home", async () => {
    await renderInvoices(createDemoPractice(), "waiting");
    expect(tab(/^Waiting on payment/).props.accessibilityState).toMatchObject({ selected: true });
    const list = within(screen.getByLabelText("Invoices: Waiting on payment"));
    expect(list.getByText("INV-0002")).toBeTruthy();
    expect(list.getByText("Waiting on payment")).toBeTruthy();
  });

  it("keeps the picked group in the route", async () => {
    await renderInvoices();
    await fireEvent.press(tab(/^Paid/));
    expect(mockRouter.setParams).toHaveBeenCalledWith({ group: "paid" });
  });

  it("says so when a group is empty", async () => {
    const practice = createDemoPractice();
    await renderInvoices(
      { ...practice, invoices: practice.invoices.filter((invoice) => invoice.status !== "sent") },
      "waiting",
    );
    expect(screen.getByText("Waiting · 0")).toBeTruthy();
    expect(screen.getByText("You're all caught up")).toBeTruthy();
    expect(screen.getByText("Sent invoices waiting on payment show up here.")).toBeTruthy();
  });

  it("keeps a cancelled invoice in its own Cancelled group, with its number and tag", async () => {
    const practice = createDemoPractice();
    const sent = practice.invoices.find((invoice) => invoice.status === "sent");
    if (!sent) throw new Error("The demo has no sent invoice.");
    await renderInvoices(
      {
        ...practice,
        invoices: practice.invoices.map((invoice) =>
          invoice.id === sent.id
            ? {
                ...invoice,
                status: "cancelled" as const,
                cancelledAt: "2026-11-01T18:00:00Z",
                cancelledVisitDates: ["2026-10-20"],
              }
            : invoice,
        ),
      },
      "cancelled",
    );
    expect(screen.getByText("Cancelled · 1")).toBeTruthy();
    expect(screen.getByText("Waiting · 0")).toBeTruthy();
    const list = within(screen.getByLabelText("Invoices: Cancelled"));
    expect(list.getByLabelText(/^INV-0002, .+, Cancelled$/)).toBeTruthy();
  });

  it("says so when no invoice is cancelled", async () => {
    await renderInvoices(createDemoPractice(), "cancelled");
    expect(screen.getByText("No cancelled invoices")).toBeTruthy();
    expect(screen.getByText("Invoices you cancel stay here as a record.")).toBeTruthy();
  });

  it("opens an invoice when its row is tapped", async () => {
    const practice = createDemoPractice();
    const draft = practice.invoices.find((invoice) => invoice.number === 3);
    await renderInvoices(practice);
    await fireEvent.press(screen.getByLabelText(/^INV-0003, /));
    expect(mockRouter.navigate).toHaveBeenLastCalledWith({
      pathname: "/invoice/[id]",
      params: { id: draft?.id },
    });
  });

  it("is a tab screen, without a back arrow", async () => {
    await renderInvoices();
    expect(screen.queryByLabelText("Back")).toBeNull();
  });

  it("says so when there are no invoices yet, without pills", async () => {
    await renderInvoices({ ...createDemoPractice(), invoices: [], lineItems: [] });
    expect(screen.getByText("No invoices yet")).toBeTruthy();
    expect(screen.getByText("Invoice a patient's visits and they'll show up here.")).toBeTruthy();
    expect(screen.queryByLabelText("Invoice groups")).toBeNull();
  });
});
