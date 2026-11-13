import { Spinner } from "heroui-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import { Wordmark } from "./wordmark";

/**
 * A full-screen wait: the wordmark, a small spinner, and optionally a short status
 * message (announced once to screen readers). Used for the first sync.
 */
export function Splash({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <View
      accessibilityState={{ busy: true }}
      className="flex-1 items-center justify-center gap-5 bg-background px-10"
    >
      <Wordmark size={32} />
      <Spinner accessibilityLabel={label} />
      {children ? (
        <View
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          className="items-center gap-1.5"
        >
          {children}
        </View>
      ) : null}
    </View>
  );
}
