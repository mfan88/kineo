import { Stack } from "expo-router";
import { Keyboard } from "react-native";

/**
 * A tab's stack: its detail screens push on top of the tab's first screen, each
 * with only a back arrow (no header). The keyboard closes when a screen is left,
 * including by switching tabs, so it never stays up over another screen.
 */
export function TabStack() {
  return (
    <Stack
      screenOptions={{ headerShown: false }}
      screenListeners={{ blur: () => Keyboard.dismiss() }}
    />
  );
}
