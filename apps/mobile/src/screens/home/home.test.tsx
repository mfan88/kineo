import { describe, expect, it, jest } from "@jest/globals";
import type { PracticeData } from "@kineo/data";
import { createDemoPractice } from "@kineo/data/demo";
import { readyPatients } from "@kineo/shared";
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
      visits: [],
      invoices: [],
      lineItems: [],
    });
    expect(screen.getByText("You're all caught up")).toBeTruthy();
    expect(screen.queryByRole("header", { name: "To do" })).toBeNull();
  });

  it("adds a patient from the plus button beside the search", async () => {
    await renderHome();
    const buttons = screen.getAllByRole("button", { name: "Add patient" });
    expect(buttons).toHaveLength(1);
    await fireEvent.press(buttons[0]!);
    expect(mockRouter.navigate).toHaveBeenLastCalledWith("/patient/new");
  });

  it("offers to add the searched name as a new patient when nobody matches", async () => {
    await renderHome();
    await fireEvent.changeText(screen.getByLabelText("Search patients"), "Zed");
    expect(screen.getByText("No patients match “Zed”.")).toBeTruthy();
    await fireEvent.press(screen.getByText("Add “Zed” as a new patient"));
    expect(mockRouter.navigate).toHaveBeenLastCalledWith({
      pathname: "/patient/new",
      params: { name: "Zed" },
    });
  });

  it("shows a first-patient block with Add patient pinned when there are no patients", async () => {
    const practice = createDemoPractice();
    await renderHome({ ...practice, patients: [], visits: [], invoices: [], lineItems: [] });
    expect(screen.getByText("No patients yet")).toBeTruthy();
    expect(screen.getByText("Add your first patient to start a note.")).toBeTruthy();
    expect(screen.queryByText("You're all caught up")).toBeNull();
    expect(screen.queryByLabelText("Search patients")).toBeNull();
    // The demo profile and price list are complete, so nothing is flagged.
    expect(screen.queryByText(/Before you send an invoice/)).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Add patient" }));
    expect(mockRouter.navigate).toHaveBeenLastCalledWith("/patient/new");
  });

  it("links to what's missing before an invoice can be sent", async () => {
    const practice = createDemoPractice();
    await renderHome({
      ...practice,
      patients: [],
      visits: [],
      invoices: [],
      lineItems: [],
      priceItems: [],
      profile: { ...practice.profile, fullName: { value: "", showOnInvoice: true } },
    });
    expect(screen.getByText(/Before you send an invoice/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("link", { name: "Fill in your profile" }));
    expect(mockRouter.navigate).toHaveBeenLastCalledWith("/profile");
    await fireEvent.press(screen.getByRole("link", { name: "Add a price list item" }));
    expect(mockRouter.navigate).toHaveBeenLastCalledWith("/price-list");
  });

  it("says No visits yet for a patient who hasn't been seen", async () => {
    const practice = createDemoPractice();
    const [first] = practice.patients;
    await renderHome({
      ...practice,
      patients: first ? [first] : [],
      visits: [],
      invoices: [],
      lineItems: [],
    });
    expect(
      within(screen.getByLabelText("Recent patients")).getByText("No visits yet"),
    ).toBeTruthy();
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

  it("opens the Ready to invoice list when several patients have visits waiting", async () => {
    const practice = createDemoPractice();
    expect(readyPatients(practice.patients, practice.visits).length).toBeGreaterThan(1);
    await renderHome(practice);
    await fireEvent.press(screen.getByRole("button", { name: "Ready to invoice, 3 visits" }));
    expect(mockRouter.navigate).toHaveBeenLastCalledWith("/ready-to-invoice");
  });

  it("goes straight to New invoice when only one patient has visits waiting", async () => {
    const practice = createDemoPractice();
    const [first] = readyPatients(practice.patients, practice.visits);
    const only = first?.patient.id;
    const visits = practice.visits.filter(
      (visit) => visit.patientId === only || visit.invoiceId !== null,
    );
    await renderHome({ ...practice, visits });
    await fireEvent.press(screen.getByRole("button", { name: /^Ready to invoice, / }));
    expect(mockRouter.navigate).toHaveBeenLastCalledWith({
      pathname: "/new-invoice/[patientId]",
      params: { patientId: only },
    });
  });

  it("opens the Waiting on payment group of Invoices from its card", async () => {
    await renderHome();
    await fireEvent.press(screen.getByRole("button", { name: "Waiting on payment, 1 invoice" }));
    expect(mockRouter.navigate).toHaveBeenCalledWith({
      pathname: "/(invoices)",
      params: { group: "waiting" },
    });
  });

  it("keeps Ready to invoice as a count only when it's zero; Waiting on payment still opens", async () => {
    const practice = createDemoPractice();
    await renderHome({
      ...practice,
      visits: practice.visits.filter((visit) => visit.invoiceId !== null),
    });
    expect(screen.getByLabelText("Ready to invoice, 0 visits")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Ready to invoice/ })).toBeNull();
    expect(screen.getByRole("button", { name: /^Waiting on payment/ })).toBeTruthy();
  });
});
