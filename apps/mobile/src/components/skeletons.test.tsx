import { describe, expect, it, jest } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { HeroUINativeProvider } from "heroui-native";
import type { ReactNode } from "react";
import { initialWindowMetrics, SafeAreaProvider } from "react-native-safe-area-context";
import { FormSkeleton, HomeSkeleton, ListSkeleton, PatientSkeleton } from "./skeletons";

// Screens ask Expo Router whether they're in front; there's no navigator in these tests.
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: () => false, replace: jest.fn() },
  useIsFocused: () => true,
}));

const METRICS = initialWindowMetrics ?? {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

async function renderSkeleton(ui: ReactNode) {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <HeroUINativeProvider config={{ devInfo: { stylingPrinciples: false } }}>
        {ui}
      </HeroUINativeProvider>
    </SafeAreaProvider>,
  );
}

describe("screen skeletons", () => {
  it("Home keeps its real heading and says it's busy, with no blocks in the first 300 ms", async () => {
    await renderSkeleton(<HomeSkeleton showBlocks={false} />);
    expect(screen.getByRole("header", { name: "Who are you seeing?" })).toBeTruthy();
    expect(screen.getByLabelText("Loading Home").props.accessibilityState).toEqual({ busy: true });
    expect(screen.getByLabelText("Loading Home").children).toHaveLength(0);
  });

  it("hides its blocks from screen readers once shown", async () => {
    await renderSkeleton(<HomeSkeleton showBlocks />);
    const blocks = screen.getByTestId("skeleton-blocks", { includeHiddenElements: true });
    expect(blocks.props.importantForAccessibility).toBe("no-hide-descendants");
    expect(blocks.props.accessibilityElementsHidden).toBe(true);
  });

  it("list screens keep their heading", async () => {
    await renderSkeleton(<ListSkeleton title="Invoices" label="Loading invoices" showBlocks />);
    expect(screen.getByRole("header", { name: "Invoices" })).toBeTruthy();
    expect(screen.getByLabelText("Loading invoices")).toBeTruthy();
  });

  it("Patient shows no heading text until the name is known", async () => {
    await renderSkeleton(<PatientSkeleton showBlocks />);
    expect(screen.queryByRole("header")).toBeNull();
    expect(screen.getByLabelText("Back")).toBeTruthy();
    expect(screen.getByLabelText("Loading patient")).toBeTruthy();
  });

  it("other detail screens keep their heading and back arrow", async () => {
    await renderSkeleton(<FormSkeleton title="Your profile" showBlocks />);
    expect(screen.getByRole("header", { name: "Your profile" })).toBeTruthy();
    expect(screen.getByLabelText("Back")).toBeTruthy();
  });
});
