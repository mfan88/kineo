import { describe, expect, it, jest } from "@jest/globals";
import type { PracticeData } from "@kineo/data";
import { createDemoPractice } from "@kineo/data/demo";
import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { HeroUINativeProvider } from "heroui-native";
import { initialWindowMetrics, SafeAreaProvider } from "react-native-safe-area-context";
import { DemoPracticeProvider } from "@/data/practice-data";
import { Invoices } from "./index";

const mockRouter = { navigate: jest.fn<(href: unknown) => void>() };
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

function renderInvoices(data: PracticeData = createDemoPractice()) {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <HeroUINativeProvider config={{ devInfo: { stylingPrinciples: false } }}>
        <DemoPracticeProvider data={data}>
          <Invoices />
        </DemoPracticeProvider>
      </HeroUINativeProvider>
    </SafeAreaProvider>,
  );
}

describe("Invoices", () => {
  it("lists every invoice with its number, patient, total and status tag", async () => {
    const practice = createDemoPractice();
    await renderInvoices(practice);
    expect(screen.getByRole("header", { name: "Invoices" })).toBeTruthy();
    const list = within(screen.getByLabelText("Invoices"));
    expect(list.getAllByText(/^INV-\d{4}$/).length).toBe(practice.invoices.length);

    const draft = within(screen.getByLabelText(/^INV-0003, .+, \$120\.00, Draft$/));
    expect(draft.getByText("INV-0003")).toBeTruthy();
    expect(draft.getByText("$120.00")).toBeTruthy();
    expect(draft.getByText("Draft")).toBeTruthy();
    for (const status of new Set(practice.invoices.map((invoice) => invoice.status))) {
      const label = { draft: "Draft", sent: "Sent", paid: "Paid" }[status];
      expect(list.getAllByText(label).length).toBeGreaterThan(0);
    }
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

  it("says so when there are no invoices yet", async () => {
    await renderInvoices({ ...createDemoPractice(), invoices: [], lineItems: [] });
    expect(screen.getByText("No invoices yet")).toBeTruthy();
    expect(screen.getByText("Invoice a patient's visits and they'll show up here.")).toBeTruthy();
    expect(screen.queryByLabelText("Invoices")).toBeNull();
  });
});
