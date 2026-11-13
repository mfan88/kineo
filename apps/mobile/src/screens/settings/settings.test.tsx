import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Alert, type AlertButton } from "react-native";
import { AccountContext, type Account } from "@/auth/account";
import type { SignOutResult } from "@/auth/sign-out";
import { renderScreen } from "@/test/render-screen";
import { Settings } from "./index";

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
});

describe("Settings", () => {
  it("shows what Appearance is set to and opens its choices", async () => {
    await renderScreen(<Settings />);
    const row = screen.getByRole("button", { name: "Appearance" });
    expect(screen.getByText(/^Match system · (light|dark) now$/)).toBeTruthy();
    await fireEvent.press(row);
    expect(mockRouter.navigate).toHaveBeenCalledWith("/appearance");
  });

  it("offers Your profile, Price list and tax and Appearance, and nothing for invoice style", async () => {
    await renderScreen(<Settings />);
    expect(screen.getByRole("header", { name: "Settings" })).toBeTruthy();
    expect(screen.queryByLabelText("Back")).toBeNull();
    const rows = screen.getAllByRole("button").map((row) => row.props.accessibilityLabel);
    expect(rows).toEqual(["Your profile", "Price list and tax", "Appearance"]);
    // Invoice style is desktop only: a note, not a screen.
    expect(screen.getByText(/^Invoice style .* is set in Kineō on your computer\./)).toBeTruthy();
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
