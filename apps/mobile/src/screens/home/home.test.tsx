import { describe, expect, it } from "@jest/globals";
import type { PracticeData } from "@kineo/data";
import { createDemoPractice } from "@kineo/data/demo";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { HeroUINativeProvider } from "heroui-native";
import { initialWindowMetrics, SafeAreaProvider } from "react-native-safe-area-context";
import { DemoPracticeProvider } from "@/data/practice-data";
import { Home } from "./index";

const TODAY = new Date(2026, 10, 12);

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
});
