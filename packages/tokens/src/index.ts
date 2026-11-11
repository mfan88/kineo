/**
 * Kineō design tokens, shared by the desktop (HeroUI) and phone (HeroUI Native)
 * themes. Values come from docs/design-brief.md. `heroui.css` applies them to
 * HeroUI v3; a test keeps the two in sync.
 */

export const colors = {
  /** Brand colour: focus borders, active tab, icons, chips. Not for text (3.9:1 on the page). */
  primary: "#0284C7",
  /**
   * Primary buttons and text links. Darker than `primary` so white button text and
   * link text reach 4.5:1.
   */
  primaryStrong: "#0369A1",
  /** Hover on primary buttons and links. */
  primaryStrongHover: "#075985",
  /** Text on top of `primaryStrong` (buttons). */
  onPrimary: "#FFFFFF",
  /** Text on the light tint (chips, status tags). */
  textOnTint: "#075985",
  tint: "#E0F2FE",
  pageBackground: "#F7FBFF",
  /** Cards and other raised surfaces. */
  surface: "#FFFFFF",
  text: "#11181C",
  mutedText: "#71717A",
  border: "#E4E4E7",
  /** Grey fill of inputs at rest; they turn `surface` with a `primary` border on focus. */
  inputFill: "#F4F4F5",
  /** Placeholder text inside inputs; darker than `mutedText` to reach 4.5:1 on `inputFill`. */
  placeholder: "#67676F",
  error: "#B42318",
  onError: "#FFFFFF",
} as const;

/** Corner radius in px. Cards and inputs use 12–16px; chips and tags are pills. */
export const radius = {
  /** Inputs, buttons, small cards. */
  md: 12,
  /** Cards and sheets. */
  lg: 16,
  /** Chips and status tags. */
  pill: 9999,
} as const;

export const font = {
  family: "Inter",
  /** Full CSS stack, with system fallbacks. */
  stack: '"Inter Variable", Inter, system-ui, -apple-system, "Segoe UI", sans-serif',
} as const;

/** Soft shadows for cards and overlays. */
export const shadows = {
  card: "0 1px 2px 0 rgba(17, 24, 28, 0.04), 0 2px 8px 0 rgba(17, 24, 28, 0.06)",
  overlay: "0 4px 12px 0 rgba(17, 24, 28, 0.08), 0 16px 32px 0 rgba(17, 24, 28, 0.10)",
} as const;

/** Smallest touch target in px (design rule). */
export const minTouchTarget = 44;

export type ColorToken = keyof typeof colors;
