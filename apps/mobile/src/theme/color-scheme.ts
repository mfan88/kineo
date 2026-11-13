import type { ColorScheme } from "@kineo/tokens";

/** The appearance Uniwind is showing: light unless its theme is dark. */
export function colorSchemeOf(theme: string): ColorScheme {
  return theme === "dark" ? "dark" : "light";
}
