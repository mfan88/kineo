import { describe, expect, it, jest } from "@jest/globals";
import type { PracticeData } from "@kineo/data";
import { createDemoPractice } from "@kineo/data/demo";
import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { HeroUINativeProvider } from "heroui-native";
import { initialWindowMetrics, SafeAreaProvider } from "react-native-safe-area-context";
import { DemoPracticeProvider } from "@/data/practice-data";
import { homeSummary } from "@/utils/home-summary";
import { Home } from "./index";

const TODAY = new Date(2026, 10, 12);

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

function renderHome(data: PracticeData = createDemoPractice()) {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <HeroUINativeProvider config={{ devInfo: { stylingPrinciples: false } }}>
        <DemoPracticeProvider data={data}>
          <Home today={TODAY} />
        </DemoPracticeProvider>
      </HeroUINativeProvider>
    </SafeAreaProvider>,
  );
}

describe("Home", () => {
  it("asks who you're seeing, with today's date", async () => {
    await renderHome();
    expect(screen.getByRole("header", { name: "Who are you seeing?" })).toBeTruthy();
    expect(screen.getByText("Thursday, November 12")).toBeTruthy();
  });

  it("shows recent patients and the three invoice groups from the demo practice", async () => {
    await renderHome();
    expect(screen.getByText("Recent patients")).toBeTruthy();
    expect(screen.getAllByText("Jordan Sample").length).toBeGreaterThan(0);
    for (const group of ["Ready to invoice", "Not sent yet", "Waiting on payment"]) {
      expect(screen.getByRole("header", { name: group })).toBeTruthy();
    }
    expect(screen.getByText("2 visits · Oct 28 – Nov 4")).toBeTruthy();
    expect(screen.getByText("INV-0003 · Draft")).toBeTruthy();
    expect(screen.getByText("$120.00")).toBeTruthy();
  });

  it("finds patients as you type, and says when nobody matches", async () => {
    await renderHome();
    const search = screen.getByLabelText("Search patients");
    await fireEvent.changeText(search, "rile");
    expect(screen.getByLabelText("Matching patients")).toBeTruthy();
    expect(screen.queryByText("Recent patients")).toBeNull();

    await fireEvent.changeText(search, "Nobody Example");
    expect(screen.getByText("No patients match “Nobody Example”.")).toBeTruthy();

    await fireEvent.changeText(search, "");
    expect(screen.getByText("Recent patients")).toBeTruthy();
  });

  it("is all caught up when there's nothing to do", async () => {
    await renderHome({
      ...createDemoPractice(),
      patients: [],
      visits: [],
      invoices: [],
      lineItems: [],
    });
    expect(screen.getByText("You're all caught up")).toBeTruthy();
    expect(screen.queryByText("Recent patients")).toBeNull();
    expect(screen.queryByRole("header", { name: "Ready to invoice" })).toBeNull();
  });

  it("opens a patient from a recent-patient chip or a search result", async () => {
    const practice = createDemoPractice();
    const jordan = practice.patients.find((patient) => patient.fullName === "Jordan Sample");
    await renderHome(practice);
    const expected = { pathname: "/patient/[id]", params: { id: jordan?.id } };

    await fireEvent.press(
      within(screen.getByLabelText("Recent patients")).getByText("Jordan Sample"),
    );
    expect(mockRouter.navigate).toHaveBeenLastCalledWith(expected);

    mockRouter.navigate.mockClear();
    await fireEvent.changeText(screen.getByLabelText("Search patients"), "jordan");
    await fireEvent.press(
      within(screen.getByLabelText("Matching patients")).getByText("Jordan Sample"),
    );
    expect(mockRouter.navigate).toHaveBeenLastCalledWith(expected);
  });

  it("opens the Invoices tab from See all", async () => {
    await renderHome();
    await fireEvent.press(screen.getByText("See all"));
    expect(mockRouter.navigate).toHaveBeenLastCalledWith("/(invoices)");
  });

  it("opens the invoice from a Not sent yet or Waiting on payment row", async () => {
    const practice = createDemoPractice();
    const summary = homeSummary(practice);
    await renderHome(practice);

    const [draft] = summary.notSentYet;
    await fireEvent.press(screen.getByText("INV-0003 · Draft"));
    expect(draft?.detail).toBe("INV-0003 · Draft");
    expect(mockRouter.navigate).toHaveBeenLastCalledWith({
      pathname: "/invoice/[id]",
      params: { id: draft?.id },
    });

    const [sent] = summary.waitingOnPayment;
    if (!sent) throw new Error("The demo practice has no sent invoice.");
    await fireEvent.press(
      within(screen.getByLabelText("Waiting on payment")).getByText(sent.detail),
    );
    expect(mockRouter.navigate).toHaveBeenLastCalledWith({
      pathname: "/invoice/[id]",
      params: { id: sent.id },
    });
  });

  it("opens the patient from a Ready to invoice row", async () => {
    const practice = createDemoPractice();
    await renderHome(practice);
    const [ready] = homeSummary(practice).readyToInvoice;
    await fireEvent.press(screen.getByText("2 visits · Oct 28 – Nov 4"));
    expect(ready?.detail).toBe("2 visits · Oct 28 – Nov 4");
    expect(mockRouter.navigate).toHaveBeenLastCalledWith({
      pathname: "/patient/[id]",
      params: { id: ready?.id },
    });
  });
});
