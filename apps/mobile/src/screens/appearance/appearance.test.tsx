import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";
import { renderScreen } from "@/test/render-screen";
import { appearance } from "@/theme/appearance";
import { Appearance } from "./index";

jest.mock("expo-router", () => ({
  router: { canGoBack: () => true, back: () => undefined, replace: () => undefined },
  useIsFocused: () => true,
}));

const option = (name: string) => screen.getByRole("radio", { name });

describe("Appearance", () => {
  it("offers Match system, Light and Dark, and switches at once", async () => {
    appearance.set("system");
    await renderScreen(<Appearance />);
    expect(option("Match system").props.accessibilityState).toEqual({ checked: true });
    await fireEvent.press(option("Dark"));
    expect(appearance.get()).toBe("dark");
    expect(option("Dark").props.accessibilityState).toEqual({ checked: true });
    expect(option("Match system").props.accessibilityState).toEqual({ checked: false });
    appearance.set("system");
  });
});
