import { Stack } from "expo-router";

/** The Home tab's stack: detail screens (patient, invoice…) push on top of Home. */
export default function HomeLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
