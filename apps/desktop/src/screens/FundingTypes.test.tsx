import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoState, DemoStore } from "../data/store";
import { renderApp } from "../test/render";

// Made-up demo data (see @kineo/data/demo): Autism Funding with one patient, and ICBC with no
// recipient yet and no patients.
const AUTISM = "5eed0000-0000-4000-8000-000000000701";
const ICBC = "5eed0000-0000-4000-8000-000000000703";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 12, 9, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Funding types", () => {
  it("has a back arrow to Settings, the heading, and the one primary button", () => {
    renderApp("/settings/funding-types");
    expect(screen.getByRole("heading", { level: 1, name: "Funding types" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back to Settings" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add funding type" })).toBeTruthy();
    expect(
      screen.getByText(
        "Who you bill besides the patient. A type sets the recipient and the details that print on the invoice.",
      ),
    ).toBeTruthy();
  });

  it("shows no wordmark or tab bar at the top, as the other Settings screens", () => {
    renderApp("/settings/funding-types");
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
    expect(screen.getByRole("navigation", { name: "Legal" })).toBeTruthy();
  });

  it("lists each type by name with who it bills, its details and its patients", () => {
    renderApp("/settings/funding-types");
    const list = within(screen.getByRole("list", { name: "Funding types" }));
    const rows = list.getAllByRole("link");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain("Autism Funding");
    expect(rows[0]?.textContent).toContain(
      "Bill to Autism Funding Branch, Ministry of Children and Family Development",
    );
    expect(rows[0]?.textContent).toContain("1 detail on invoices · 1 patient");
    expect(rows[0]?.getAttribute("href")).toBe(`/settings/funding-types/${AUTISM}`);
  });

  it("says what's missing on a type with no recipient, instead of who it bills", () => {
    renderApp("/settings/funding-types");
    const icbc = within(screen.getByRole("list", { name: "Funding types" })).getAllByRole(
      "link",
    )[1];
    expect(icbc?.textContent).toContain("ICBC");
    expect(icbc?.textContent).toContain("Recipient name and address are empty");
    expect(icbc?.textContent).not.toContain("Bill to");
    expect(icbc?.textContent).toContain("1 detail on invoices · no patients");
    expect(icbc?.getAttribute("href")).toBe(`/settings/funding-types/${ICBC}`);
  });

  it("has an empty state when there are none, still offering the common types", () => {
    const store = new DemoStore({ ...createDemoState(), fundingTypes: [], patientFundings: [] });
    renderApp("/settings/funding-types", store);
    expect(
      screen.getByText("No funding types yet. Add one, or start from a common type below."),
    ).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Funding types" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Start from a common type" })).toBeTruthy();
  });

  it("offers a starting point for each common type, linking to the editor with ?preset=", () => {
    renderApp("/settings/funding-types");
    const presets: [string, string][] = [
      ["Autism Funding", "autism-funding"],
      ["Children and Youth Disability Benefit", "cydb"],
      ["ICBC", "icbc"],
      ["Blank type", "blank"],
    ];
    for (const [label, key] of presets) {
      expect(screen.getByRole("link", { name: label }).getAttribute("href")).toBe(
        `/settings/funding-types/new?preset=${key}`,
      );
    }
    expect(
      screen.getByText(
        "Starting points only. Check each funder's current requirements before you bill. You can change everything.",
      ),
    ).toBeTruthy();
  });

  it("warns that Autism Funding ends, until 31 March 2027", () => {
    renderApp("/settings/funding-types");
    const note = screen.getByRole("note");
    expect(note.textContent).toContain("Autism Funding ends on 31 March 2027.");
    expect(note.textContent).toContain("Invoices already sent keep their old details.");
  });

  it("drops the warning after that date, and without an Autism Funding type", () => {
    vi.setSystemTime(new Date(2027, 3, 1, 9, 0));
    renderApp("/settings/funding-types");
    expect(screen.queryByRole("note")).toBeNull();

    vi.setSystemTime(new Date(2026, 10, 12, 9, 0));
    const state = createDemoState();
    const store = new DemoStore({
      ...state,
      fundingTypes: state.fundingTypes.filter((type) => type.id !== AUTISM),
      patientFundings: [],
    });
    renderApp("/settings/funding-types", store);
    expect(screen.queryAllByRole("note")).toHaveLength(0);
  });
});
