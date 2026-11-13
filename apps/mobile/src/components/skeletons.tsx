import { Skeleton } from "heroui-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { Screen } from "./screen";

/**
 * What each screen shows while the practice is first read from the local database
 * (design brief, States): the screen's own frame (tab bar, back arrow, heading where
 * it's known) with grey blocks in the shape of what's coming. `showBlocks` is false
 * for the first 300 ms, so a quick read never flashes a skeleton.
 */
interface SkeletonProps {
  showBlocks: boolean;
}

/** One block. Still, not pulsing, when the system asks for reduced motion. */
function Block({ className }: { className: string }) {
  const reduceMotion = useReducedMotion();
  return <Skeleton variant={reduceMotion ? "none" : "shimmer"} className={className} />;
}

/** The busy container: one label for screen readers, the blocks hidden from them. */
function Busy({
  label,
  showBlocks,
  children,
}: {
  label: string;
  showBlocks: boolean;
  children: ReactNode;
}) {
  return (
    <View accessibilityLabel={label} accessibilityState={{ busy: true }}>
      {showBlocks ? (
        <View
          testID="skeleton-blocks"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className="gap-6"
        >
          {children}
        </View>
      ) : null}
    </View>
  );
}

/** Home: the real heading, then the search field, a list card and two count cards. */
export function HomeSkeleton({ showBlocks }: SkeletonProps) {
  return (
    <Screen title="Who are you seeing?">
      <Busy label="Loading Home" showBlocks={showBlocks}>
        <Block className="h-12 w-full rounded-xl" />
        <View className="gap-2">
          <Block className="h-3.5 w-16 rounded-full" />
          {[0, 1, 2].map((row) => (
            <Block key={row} className="h-14 w-full rounded-2xl" />
          ))}
        </View>
        <View className="gap-2">
          <Block className="h-3.5 w-12 rounded-full" />
          <Block className="h-14 w-full rounded-2xl" />
          <Block className="h-14 w-full rounded-2xl" />
        </View>
      </Busy>
    </Screen>
  );
}

/** Patient: a bar for the name (not known yet), the note card, then the visits card. */
export function PatientSkeleton({ showBlocks }: SkeletonProps) {
  return (
    <Screen back title={showBlocks ? <Block className="h-8 w-56 rounded-xl" /> : null}>
      <Busy label="Loading patient" showBlocks={showBlocks}>
        <Block className="h-48 w-full rounded-2xl" />
        <View className="gap-2">
          <Block className="h-3.5 w-12 rounded-full" />
          <Block className="h-40 w-full rounded-2xl" />
        </View>
      </Busy>
    </Screen>
  );
}

/** Invoices, and the Patients list: rows with a pill where the status tag goes. */
export function ListSkeleton({
  title,
  label,
  showBlocks,
}: SkeletonProps & { title: string; label: string }) {
  return (
    <Screen title={title}>
      <Busy label={label} showBlocks={showBlocks}>
        <View className="gap-3">
          {[0, 1, 2, 3].map((row) => (
            <View key={row} className="h-14 flex-row items-center gap-3">
              <View className="flex-1 gap-2">
                <Block className="h-4 w-40 rounded-full" />
                <Block className="h-3 w-24 rounded-full" />
              </View>
              <Block className="h-6 w-20 rounded-full" />
            </View>
          ))}
        </View>
      </Busy>
    </Screen>
  );
}

/** Any other detail screen that needs the practice: its heading, then field-shaped blocks. */
export function FormSkeleton({ title, showBlocks }: SkeletonProps & { title: string }) {
  return (
    <Screen back title={title}>
      <Busy label={`Loading ${title.toLowerCase()}`} showBlocks={showBlocks}>
        <Block className="h-12 w-full rounded-xl" />
        <Block className="h-12 w-full rounded-xl" />
        <Block className="h-32 w-full rounded-2xl" />
      </Busy>
    </Screen>
  );
}
