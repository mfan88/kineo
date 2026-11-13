import { themeColors, themeStatusTags } from "@kineo/tokens";
import { useUniwind } from "uniwind";
import { colorSchemeOf } from "./color-scheme";

/**
 * The palette for the appearance on screen, for the few places that need a colour
 * value in code rather than a class (native tab bar, SVG strokes, view styles).
 */
export function useThemeColors() {
  const { theme } = useUniwind();
  return themeColors[colorSchemeOf(theme)];
}

/** The status tag colours for the appearance on screen. */
export function useThemeStatusTags() {
  const { theme } = useUniwind();
  return themeStatusTags[colorSchemeOf(theme)];
}
