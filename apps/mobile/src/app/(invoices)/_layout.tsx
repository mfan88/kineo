import { Stack } from "expo-router";

/** The Invoices tab's stack: an invoice pushes on top of the list. */
export default function InvoicesLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
