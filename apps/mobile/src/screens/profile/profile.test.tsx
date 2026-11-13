import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { ownRowId } from "@kineo/data";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { renderScreen, TEST_NOW, TEST_OWNER } from "@/test/render-screen";
import { Profile } from "./index";

const mockRouter = {
  canGoBack: jest.fn<() => boolean>(),
  back: jest.fn<() => void>(),
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

const OWN = "eeeeeeee-0000-4000-8000-000000000001";
const PROFILE_ROW = {
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
  phone: "",
  phone_on_invoice: 0,
  updated_at: TEST_NOW,
};

const field = (label: string) => screen.getByLabelText(label);
const flag = (label: string) =>
  screen.getByRole("switch", { name: `Show ${label.toLowerCase()} on invoices` });

describe("Your profile", () => {
  it("shows the five details with their Show on invoice flags", async () => {
    await renderScreen(<Profile />, { profiles: [PROFILE_ROW] });
    expect(screen.getByRole("header", { name: "Your profile" })).toBeTruthy();
    expect(screen.getByLabelText("Back")).toBeTruthy();
    expect(field("Full name").props.value).toBe("Sam Practitioner");
    expect(field("Title or certification").props.value).toBe("Registered physiotherapist");
    expect(field("Phone").props.value).toBe("");
    expect(flag("Full name").props.accessibilityState.checked).toBe(true);
    expect(flag("Clinic name").props.accessibilityState.checked).toBe(false);
    expect(screen.getAllByRole("switch").length).toBe(5);
    expect(screen.getByText("Fields shown on invoices are required.")).toBeTruthy();
  });

  it("saves changes to the practitioner's existing row, trimmed, and says so", async () => {
    const { writes } = await renderScreen(<Profile />, { profiles: [PROFILE_ROW] }, (sql) =>
      sql.includes("FROM profiles") ? { id: OWN } : null,
    );
    await fireEvent.changeText(field("Phone"), "  604-555-0100 ");
    await fireEvent.press(flag("Phone"));
    await fireEvent.press(screen.getByText("Save profile"));

    await waitFor(() => expect(writes.length).toBe(1));
    expect(writes[0]?.sql).toMatch(/^UPDATE profiles SET /);
    expect(writes[0]?.sql).toContain("phone = ?, phone_on_invoice = ?");
    const parameters = writes[0]?.parameters ?? [];
    expect(parameters.slice(0, 2)).toEqual(["Sam Practitioner", 1]);
    expect(parameters.slice(8, 10)).toEqual(["604-555-0100", 1]);
    expect(parameters.at(-1)).toBe(OWN);
    expect((await screen.findAllByText("Profile saved")).length).toBeGreaterThan(0);
    expect(field("Phone").props.value).toBe("604-555-0100");
  });

  it("creates the row with the practitioner's fixed ID the first time", async () => {
    const { writes } = await renderScreen(<Profile />);
    await fireEvent.changeText(field("Full name"), "Sam Practitioner");
    await fireEvent.press(screen.getByText("Save profile"));
    await waitFor(() => expect(writes.length).toBe(1));
    expect(writes[0]?.sql).toMatch(/^INSERT INTO profiles \(id, owner_id, /);
    expect(writes[0]?.parameters.slice(0, 3)).toEqual([
      ownRowId("profiles", TEST_OWNER),
      TEST_OWNER,
      "Sam Practitioner",
    ]);
  });

  it("requires a field that's shown on invoices, and saves nothing until it's filled in", async () => {
    const { writes } = await renderScreen(<Profile />, { profiles: [PROFILE_ROW] }, () => ({
      id: OWN,
    }));
    await fireEvent.press(flag("Address"));
    // No error before the first save attempt.
    expect(screen.queryByText(/Add your address/)).toBeNull();
    await fireEvent.press(screen.getByText("Save profile"));
    expect(await screen.findByText("Shown on invoices. Add an address.")).toBeTruthy();
    expect(writes).toEqual([]);
    expect(screen.queryByText("Profile saved")).toBeNull();

    // Filling it in clears the error; saving then works.
    await fireEvent.changeText(field("Address"), "12 Example Street, Vancouver");
    await waitFor(() => expect(screen.queryByText(/Add your address/)).toBeNull());
    await fireEvent.press(screen.getByText("Save profile"));
    await waitFor(() => expect(writes.length).toBe(1));
  });

  it("lets an empty field be saved once it's no longer shown on invoices", async () => {
    const { writes } = await renderScreen(<Profile />, { profiles: [PROFILE_ROW] }, () => ({
      id: OWN,
    }));
    await fireEvent.changeText(field("Title or certification"), "");
    await fireEvent.press(screen.getByText("Save profile"));
    expect(
      await screen.findByText("Shown on invoices. Add a title or certification."),
    ).toBeTruthy();
    await fireEvent.press(flag("Title or certification"));
    await fireEvent.press(screen.getByText("Save profile"));
    await waitFor(() => expect(writes.length).toBe(1));
    expect(writes[0]?.parameters.slice(2, 4)).toEqual(["", 0]);
  });
});
