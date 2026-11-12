import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

/** The app's root: a stack with no top bars (screens draw their own back arrow). */
export default function RootLayout() {
  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <StatusBar style="dark" />
    </>
  );
}
