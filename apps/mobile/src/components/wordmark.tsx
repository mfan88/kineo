import { View } from "react-native";
import { useThemeColors } from "@/theme/theme-colors";
import { Text } from "./text";

/**
 * The Kineō wordmark: "kine" + "o", with the macron drawn as a separate rounded
 * bar, never the font's own ō (docs/brand.md). `size` is the font size.
 */
export function Wordmark({ size = 32 }: { size?: number }) {
  const colors = useThemeColors();
  const textStyle = {
    color: colors.textOnTint,
    fontSize: size,
    lineHeight: size * 1.2,
    letterSpacing: -0.02 * size,
  };
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Kineō"
      className="flex-row items-baseline"
    >
      <Text accessibilityElementsHidden className="font-semibold" style={textStyle}>
        kine
      </Text>
      <View>
        <Text accessibilityElementsHidden className="font-semibold" style={textStyle}>
          o
        </Text>
        {/* The macron: inset 10% each side, 0.12em from the top, 0.085em tall. */}
        <View
          style={{
            position: "absolute",
            left: "10%",
            right: "10%",
            top: size * 0.12 + size * 0.1,
            height: size * 0.085,
            borderRadius: size,
            backgroundColor: colors.primary,
          }}
        />
      </View>
    </View>
  );
}
