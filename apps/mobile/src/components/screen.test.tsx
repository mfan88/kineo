import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen, within } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { HeroUINativeProvider } from "heroui-native";
import { Text } from "react-native";
import { initialWindowMetrics, SafeAreaProvider } from "react-native-safe-area-context";
import { Screen } from "./screen";

const mockRouter = {
  canGoBack: jest.fn<() => boolean>(),
  back: jest.fn<() => void>(),
  replace: jest.fn<(href: string) => void>(),
};
// jest.mock is hoisted above mockRouter, so look it up when the screen uses it.
jest.mock("expo-router", () => ({
  get router() {
    return mockRouter;
  },
  useIsFocused: () => true,
}));

// Stand-in that shows up in the tree, so the tests can see what it wraps.
jest.mock("react-native/Libraries/Components/Keyboard/KeyboardAvoidingView", () => {
  const { View: MockView } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    __esModule: true,
    default: ({ children }: { children?: ReactNode }) => (
      <MockView testID="keyboard-avoiding">{children}</MockView>
    ),
  };
});

// Safe area insets as on a phone (the provider renders nothing until it has some).
const METRICS = initialWindowMetrics ?? {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderScreen(back: boolean, footer?: ReactNode) {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <HeroUINativeProvider config={{ devInfo: { stylingPrinciples: false } }}>
        <Screen title="Patient" eyebrow="Knee pain" back={back} footer={footer}>
          <Text>Body</Text>
        </Screen>
      </HeroUINativeProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  mockRouter.canGoBack.mockReset();
  mockRouter.back.mockReset();
  mockRouter.replace.mockReset();
});

describe("Screen", () => {
  it("shows the heading, the small text above it and the content", async () => {
    await renderScreen(false);
    expect(screen.getByRole("header", { name: "Patient" })).toBeTruthy();
    expect(screen.getByText("Knee pain")).toBeTruthy();
    expect(screen.getByText("Body")).toBeTruthy();
  });

  it("has no back arrow on tab screens", async () => {
    await renderScreen(false);
    expect(screen.queryByLabelText("Back")).toBeNull();
  });

  it("goes back from a detail screen", async () => {
    mockRouter.canGoBack.mockReturnValue(true);
    await renderScreen(true);
    await fireEvent.press(screen.getByLabelText("Back"));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it("goes Home when there's nothing to go back to", async () => {
    mockRouter.canGoBack.mockReturnValue(false);
    await renderScreen(true);
    await fireEvent.press(screen.getByLabelText("Back"));
    expect(mockRouter.replace).toHaveBeenCalledWith("/");
  });

  it("renders the pinned footer inside a keyboard-avoiding view", async () => {
    await renderScreen(false, <Text>Save note</Text>);
    const wrapper = screen.getByTestId("keyboard-avoiding");
    expect(within(wrapper).getByText("Save note")).toBeTruthy();
  });

  it("has no keyboard-avoiding view without a footer", async () => {
    await renderScreen(false);
    expect(screen.queryByTestId("keyboard-avoiding")).toBeNull();
  });
});
