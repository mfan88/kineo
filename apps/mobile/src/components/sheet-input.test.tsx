import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { HeroUINativeProvider } from "heroui-native";
import { initialWindowMetrics, SafeAreaProvider } from "react-native-safe-area-context";
import { SheetInput } from "./sheet-input";

const METRICS = initialWindowMetrics ?? {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

describe("SheetInput", () => {
  it("still calls its own focus, blur and change handlers", async () => {
    const onFocus = jest.fn();
    const onBlur = jest.fn();
    const onChangeText = jest.fn();
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <HeroUINativeProvider config={{ devInfo: { stylingPrinciples: false } }}>
          <SheetInput
            accessibilityLabel="Item name"
            onFocus={onFocus}
            onBlur={onBlur}
            onChangeText={onChangeText}
          />
        </HeroUINativeProvider>
      </SafeAreaProvider>,
    );
    const input = screen.getByLabelText("Item name");
    await fireEvent(input, "focus", { nativeEvent: { target: 1 } });
    await fireEvent.changeText(input, "Follow-up");
    await fireEvent(input, "blur", { nativeEvent: { target: 1 } });
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onChangeText).toHaveBeenCalledWith("Follow-up");
    expect(onBlur).toHaveBeenCalledTimes(1);
  });
});
