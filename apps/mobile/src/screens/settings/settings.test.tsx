import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Alert, Linking, type AlertButton } from "react-native";
import { feedbackMailto, LEGAL_LINKS } from "@kineo/shared";
import { AccountContext, type Account } from "@/auth/account";
import type { SignOutResult } from "@/auth/sign-out";
import { renderScreen, TEST_NOW, TEST_OWNER } from "@/test/render-screen";
import { Settings } from "./index";

const mockConstants: { expoConfig: { version?: string } | null } = {
  expoConfig: { version: "1.2.3" },
};
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return mockConstants.expoConfig;
    },
  },
}));

const mockRouter = { navigate: jest.fn<(href: unknown) => void>() };
// jest.mock is hoisted above mockRouter, so look it up when the screen uses it.
jest.mock("expo-router", () => ({
  get router() {
    return mockRouter;
  },
  useIsFocused: () => true,
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockConstants.expoConfig = { version: "1.2.3" };
});

const OWN = "eeeeeeee-0000-4000-8000-000000000001";
/** A profile whose phone is shown on invoices but empty. */
const PROFILE_ROW = {
  id: OWN,
  owner_id: TEST_OWNER,
  full_name: "Dana Reid",
  full_name_on_invoice: 1,
  title: "",
  title_on_invoice: 0,
  clinic_name: "Harbour Physio",
  clinic_name_on_invoice: 1,
  address: "",
  address_on_invoice: 0,
  phone: "",
  phone_on_invoice: 1,
  updated_at: TEST_NOW,
};
const SETTINGS_ROW = {
  id: OWN,
  owner_id: TEST_OWNER,
  default_tax_rate_basis_points: 500,
  invoice_number_prefix: "INV-",
  updated_at: TEST_NOW,
};
const priceRow = (id: string, name: string) => ({
  id,
  owner_id: TEST_OWNER,
  name,
  unit_price_cents: 11000,
  created_at: TEST_NOW,
  updated_at: TEST_NOW,
});

describe("Settings", () => {
  it("shows what Appearance is set to and opens its choices", async () => {
    await renderScreen(<Settings />);
    const row = screen.getByRole("button", { name: "Appearance" });
    expect(screen.getByText(/^Match system · (light|dark) now$/)).toBeTruthy();
    await fireEvent.press(row);
    expect(mockRouter.navigate).toHaveBeenCalledWith("/appearance");
  });

  it("shows each row's current value and what's missing", async () => {
    await renderScreen(<Settings />, {
      profiles: [PROFILE_ROW],
      practice_settings: [SETTINGS_ROW],
      price_items: [
        priceRow("cccccccc-0000-4000-8000-000000000001", "Follow-up"),
        priceRow("cccccccc-0000-4000-8000-000000000002", "Assessment"),
        priceRow("cccccccc-0000-4000-8000-000000000003", "Exercise program"),
      ],
    });
    expect(screen.getByText("Dana Reid · 1 field missing")).toBeTruthy();
    expect(screen.getByText("3 items · Tax 5%")).toBeTruthy();
    expect(screen.getByText("Set it on the desktop app")).toBeTruthy();
  });

  it("offers Your profile, Price list and tax and Appearance, and nothing for invoice style", async () => {
    await renderScreen(<Settings />);
    expect(screen.getByRole("header", { name: "Settings" })).toBeTruthy();
    expect(screen.queryByLabelText("Back")).toBeNull();
    const rows = screen.getAllByRole("button").map((row) => row.props.accessibilityLabel);
    expect(rows).toEqual(["Your profile", "Price list and tax", "Appearance", "Send feedback"]);
    // Invoice style is desktop only: a plain row, not a screen.
    expect(screen.getByText("Invoice style")).toBeTruthy();
  });

  it("opens each screen", async () => {
    await renderScreen(<Settings />);
    await fireEvent.press(screen.getByText("Your profile"));
    expect(mockRouter.navigate).toHaveBeenLastCalledWith("/profile");
    await fireEvent.press(screen.getByText("Price list and tax"));
    expect(mockRouter.navigate).toHaveBeenLastCalledWith("/price-list");
  });

  it("shows nothing about the account outside a signed-in session", async () => {
    await renderScreen(<Settings />);
    expect(screen.queryByText("Sign out")).toBeNull();
  });
});

describe("Settings account", () => {
  const signOut = jest.fn<(options?: { discardUnsynced?: boolean }) => Promise<SignOutResult>>();
  const alert = jest.spyOn(Alert, "alert");

  async function show(email: string | null = "sam@example.com") {
    const account: Account = { email, signOut };
    await renderScreen(
      <AccountContext.Provider value={account}>
        <Settings />
      </AccountContext.Provider>,
    );
  }

  /** The buttons of the last dialog shown. */
  const buttons = (): AlertButton[] => alert.mock.calls.at(-1)?.[2] ?? [];

  it("says who's signed in and signs out", async () => {
    signOut.mockResolvedValue("signed-out");
    await show();
    expect(screen.getByText("Signed in as sam@example.com")).toBeTruthy();
    await fireEvent.press(screen.getByText("Sign out"));
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ discardUnsynced: false }));
    expect(alert).not.toHaveBeenCalled();
  });

  it("says just Signed in when there's no email", async () => {
    await show(null);
    expect(screen.getByText("Signed in")).toBeTruthy();
  });

  it("asks first when changes haven't been saved, staying signed in by default", async () => {
    signOut.mockResolvedValue("unsynced-changes");
    await show();
    await fireEvent.press(screen.getByText("Sign out"));
    await waitFor(() => expect(alert).toHaveBeenCalledTimes(1));
    expect(alert.mock.calls[0]?.[0]).toBe("Some changes haven't been saved yet");
    expect(buttons().map((button) => [button.text, button.style])).toEqual([
      ["Stay signed in", "cancel"],
      ["Sign out anyway", "destructive"],
    ]);
    expect(buttons()[0]?.isPreferred).toBe(true);

    signOut.mockResolvedValue("signed-out");
    buttons()[1]?.onPress?.();
    await waitFor(() => expect(signOut).toHaveBeenLastCalledWith({ discardUnsynced: true }));
  });

  it("says so when signing out fails", async () => {
    signOut.mockRejectedValue(new Error("offline"));
    await show();
    await fireEvent.press(screen.getByText("Sign out"));
    expect(
      (
        await screen.findAllByText(
          "Couldn't sign out. Check your internet connection and try again.",
        )
      ).length,
    ).toBeGreaterThan(0);
  });
});

describe("Settings feedback and legal", () => {
  const openURL = jest.spyOn(Linking, "openURL");

  beforeEach(() => {
    openURL.mockResolvedValue();
  });

  it("opens an email to support from Send feedback", async () => {
    await renderScreen(<Settings />);
    await fireEvent.press(screen.getByRole("button", { name: "Send feedback" }));
    await waitFor(() => expect(openURL).toHaveBeenCalledWith(feedbackMailto("Kineō", "1.2.3")));
  });

  it("says where to email when opening throws", async () => {
    openURL.mockRejectedValue(new Error("no mail app"));
    await renderScreen(<Settings />);
    await fireEvent.press(screen.getByRole("button", { name: "Send feedback" }));
    expect(
      (await screen.findAllByText("Email support@fenna.tech with your feedback.")).length,
    ).toBeGreaterThan(0);
  });

  it("shows the app version, and hides the line without one", async () => {
    await renderScreen(<Settings />);
    expect(screen.getByText("Kineō 1.2.3")).toBeTruthy();
    await screen.unmount();
    mockConstants.expoConfig = null;
    await renderScreen(<Settings />);
    expect(screen.queryByText(/^Kineō \d/)).toBeNull();
  });

  it("opens Terms and Privacy as links", async () => {
    await renderScreen(<Settings />);
    for (const link of LEGAL_LINKS) {
      await fireEvent.press(screen.getByRole("link", { name: link.label }));
      expect(openURL).toHaveBeenLastCalledWith(link.href);
    }
  });
});
