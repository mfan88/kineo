import { TabStack } from "@/components/tab-stack";

/** The Home tab's stack: detail screens (patient, invoice…) push on top of Home. */
export default function HomeLayout() {
  return <TabStack />;
}
