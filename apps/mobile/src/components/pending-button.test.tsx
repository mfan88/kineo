import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { HeroUINativeProvider } from "heroui-native";
import { initialWindowMetrics, SafeAreaProvider } from "react-native-safe-area-context";
import { PendingButton } from "./pending-button";

const METRICS = initialWindowMetrics ?? {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

async function renderButton(props: { pending: boolean; isDisabled?: boolean }) {
  const onPress = jest.fn();
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <HeroUINativeProvider config={{ devInfo: { stylingPrinciples: false } }}>
        <PendingButton pendingLabel="Saving…" label="Save profile" onPress={onPress} {...props} />
      </HeroUINativeProvider>
    </SafeAreaProvider>,
  );
  return onPress;
}

describe("PendingButton", () => {
  it("shows its label and presses normally when idle", async () => {
    const onPress = await renderButton({ pending: false });
    expect(screen.queryByText("Saving…")).toBeNull();
    await fireEvent.press(screen.getByText("Save profile"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("says what's happening, reports busy and ignores presses while pending", async () => {
    await renderButton({ pending: true });
    expect(screen.getByText("Saving…")).toBeTruthy();
    expect(screen.getByRole("button").props.accessibilityState).toMatchObject({ busy: true });
    // Testing Library finds handlers on parent components too, so look at the button itself:
    // it was given no press handler.
    const host = screen.getByRole("button");
    expect(host.props.onPress).toBeUndefined();
  });

  it("does nothing when disabled", async () => {
    const onPress = await renderButton({ pending: false, isDisabled: true });
    await fireEvent.press(screen.getByText("Save profile"));
    expect(onPress).not.toHaveBeenCalled();
  });
});
