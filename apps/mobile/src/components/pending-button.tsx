import { Button, Spinner } from "heroui-native";
import { View } from "react-native";
import { useThemeColors } from "@/theme/theme-colors";

/**
 * A button for an action that takes a moment ("Save note" → "Saving…"). While
 * `pending` it keeps its width and colour, shows a spinner and `pendingLabel`, and
 * ignores taps. The label is announced as a status; the button reports itself busy.
 */
export function PendingButton({
  pending,
  pendingLabel,
  label,
  onPress,
  isDisabled = false,
  variant = "primary",
  className = "min-h-11 self-start",
}: {
  pending: boolean;
  pendingLabel: string;
  /** The button's usual label. */
  label: string;
  onPress: () => void;
  isDisabled?: boolean;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
}) {
  const colors = useThemeColors();
  return (
    <Button
      className={className}
      variant={variant}
      // Not `isDisabled` while pending: that would grey the button out.
      isDisabled={isDisabled && !pending}
      onPress={pending ? undefined : onPress}
      accessibilityState={{ busy: pending, disabled: pending || isDisabled }}
    >
      {/* Both labels take space, so the button never changes width. */}
      <View className="items-center justify-center">
        <View
          className={pending ? "opacity-0" : ""}
          importantForAccessibility={pending ? "no-hide-descendants" : "auto"}
        >
          <Button.Label>{label}</Button.Label>
        </View>
        {pending ? (
          <View
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            className="absolute inset-0 flex-row items-center justify-center gap-2"
          >
            <Spinner
              size="sm"
              color={variant === "primary" ? colors.onPrimary : colors.text}
              accessibilityElementsHidden
            />
            <Button.Label>{pendingLabel}</Button.Label>
          </View>
        ) : null}
      </View>
    </Button>
  );
}
