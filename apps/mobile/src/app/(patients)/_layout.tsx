import { Stack } from "expo-router";

/** The Patients tab's stack: New patient and a patient's screen push on top of the list. */
export default function PatientsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
