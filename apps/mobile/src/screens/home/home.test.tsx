import { describe, expect, it, jest } from "@jest/globals";
import type { PracticeData } from "@kineo/data";
import { createDemoPractice } from "@kineo/data/demo";
import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { HeroUINativeProvider } from "heroui-native";
import { initialWindowMetrics, SafeAreaProvider } from "react-native-safe-area-context";
import { DemoPracticeProvider } from "@/data/practice-data";
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

  it("lists recent patients as rows with when they were last seen", async () => {
    await renderHome();
    expect(screen.getByRole("header", { name: "Recent" })).toBeTruthy();
    const recent = within(screen.getByLabelText("Recent patients"));
    expect(recent.getByText("Jordan Sample")).toBeTruthy();
    expect(recent.getByText("Last visit 4 Nov")).toBeTruthy();
  });

  it("counts what's ready to invoice and what's waiting on payment", async () => {
    await renderHome();
    expect(screen.getByRole("header", { name: "To do" })).toBeTruthy();
    expect(screen.getByLabelText("Ready to invoice, 3 visits")).toBeTruthy();
    expect(screen.getByLabelText("Waiting on payment, 1 invoice")).toBeTruthy();
    // Drafts and the old per-invoice groups are no longer on Home.
    expect(screen.queryByText("Not sent yet")).toBeNull();
    expect(screen.queryByText("See all")).toBeNull();
  });

  it("finds patients as you type, and says when nobody matches", async () => {
    await renderHome();
    const search = screen.getByLabelText("Search patients");
    await fireEvent.changeText(search, "rile");
    expect(screen.getByLabelText("Matching patients")).toBeTruthy();
    expect(screen.queryByRole("header", { name: "Recent" })).toBeNull();
    expect(screen.queryByRole("header", { name: "To do" })).toBeNull();

    await fireEvent.changeText(search, "Nobody Example");
    expect(screen.getByText("No patients match “Nobody Example”.")).toBeTruthy();

    await fireEvent.changeText(search, "");
    expect(screen.getByRole("header", { name: "Recent" })).toBeTruthy();
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
    expect(screen.queryByRole("header", { name: "Recent" })).toBeNull();
    expect(screen.queryByRole("header", { name: "To do" })).toBeNull();
  });

  it("opens a patient from a recent row or a search result", async () => {
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
});
