import { Text as NativeText, type TextProps } from "react-native";

/**
 * How far text may grow with the phone's larger text settings (Dynamic Type on iOS,
 * font size on Android). Uncapped, the largest settings make text about 3× bigger,
 * which splits headings one word per line. Body text may double; headings, which
 * start large, grow by half (as large titles do in Apple's own apps).
 */
export const MAX_TEXT_SCALE = 2;
export const MAX_HEADING_SCALE = 1.5;

/** React Native's Text, capped at MAX_TEXT_SCALE, or MAX_HEADING_SCALE for headings. */
export function Text({ accessibilityRole, maxFontSizeMultiplier, ...props }: TextProps) {
  return (
    <NativeText
      accessibilityRole={accessibilityRole}
      maxFontSizeMultiplier={
        maxFontSizeMultiplier ??
        (accessibilityRole === "header" ? MAX_HEADING_SCALE : MAX_TEXT_SCALE)
      }
      {...props}
    />
  );
}
