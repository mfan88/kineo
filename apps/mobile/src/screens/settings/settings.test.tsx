import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";
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
  it("offers Your profile and Price list and tax, and nothing for invoice style", async () => {
    await renderScreen(<Settings />);
    expect(screen.getByRole("header", { name: "Settings" })).toBeTruthy();
    expect(screen.queryByLabelText("Back")).toBeNull();
    const rows = screen.getAllByRole("button").map((row) => row.props.accessibilityLabel);
    expect(rows).toEqual(["Your profile", "Price list and tax"]);
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
});
