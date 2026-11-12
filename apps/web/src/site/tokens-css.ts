import { colors, radius } from "@kineo/tokens";

/**
 * The site's CSS custom properties, from @kineo/tokens so the site and the apps
 * share one palette. Brand sky is for the macron, icons and focus only; buttons and
 * links use the stronger shade so their text reaches 4.5:1.
 */
export function tokensCss(): string {
  const vars: Record<string, string> = {
    "--color-mist": colors.pageBackground,
    "--color-tint": colors.tint,
    "--color-deep": colors.textOnTint,
    "--color-sky": colors.primary,
    "--color-action": colors.primaryStrong,
    "--color-action-hover": colors.primaryStrongHover,
    "--color-on-action": colors.onPrimary,
    "--color-ink": colors.text,
    "--color-muted": colors.mutedText,
    "--color-border": colors.border,
    "--color-surface": colors.surface,
    "--color-error": colors.error,
    "--radius-md": `${radius.md}px`,
    "--radius-lg": `${radius.lg}px`,
    "--radius-xl": "24px",
  };
  const lines = Object.entries(vars).map(([name, value]) => `  ${name}: ${value};`);
  return `:root {\n${lines.join("\n")}\n}`;
}
