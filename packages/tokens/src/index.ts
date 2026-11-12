/**
 * Kineō design tokens, shared by the desktop (HeroUI) and phone (HeroUI Native)
 * themes. Values come from docs/design-brief.md. `heroui.css` applies them to
 * HeroUI v3 and `heroui-native.css` to HeroUI Native; tests keep them in sync.
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
  /** Light background behind `error` text (inline errors, the error tag). */
  errorTint: "#FEE4E2",
} as const;

/**
 * Status tags (pills) for visits and invoices. Each pairs text with a light
 * background at 4.5:1 or more. A tag also shows its label and an icon, so status
 * never depends on colour alone.
 */
export const statusTags = {
  notInvoiced: { label: "Not invoiced", text: "#3F3F46", background: "#F4F4F5" },
  draft: { label: "Draft", text: colors.textOnTint, background: colors.tint },
  sent: { label: "Waiting on payment", text: "#92400E", background: "#FEF3C7" },
  paid: { label: "Paid", text: "#166534", background: "#DCFCE7" },
  error: { label: "Error", text: colors.error, background: colors.errorTint },
} as const;

export type StatusTagToken = keyof typeof statusTags;

/**
 * Dark palette, with the same roles as `colors`. A blue-tinted near-black page;
 * cards are lighter surfaces with a 1px ring rather than shadows. The sky accent
 * is lighter, so buttons use dark text on it. Invoices and invoice previews stay
 * on white paper with their light colours in both modes.
 */
export const darkColors = {
  /** Focus borders, active tab, icons. 8:1 on surface. */
  primary: "#38BDF8",
  /** Primary buttons and text links. */
  primaryStrong: "#38BDF8",
  primaryStrongHover: "#7DD3FC",
  /** Text on top of `primaryStrong` (buttons): dark, since white fails on the light accent. */
  onPrimary: "#082F49",
  textOnTint: "#BAE6FD",
  tint: "#0C4A6E",
  pageBackground: "#0B1117",
  /** Cards and other raised surfaces. */
  surface: "#151C24",
  text: "#E6EDF3",
  mutedText: "#9AA4AF",
  /** Dividers and card rings. */
  border: "#2B3540",
  inputFill: "#232D38",
  placeholder: "#8B95A0",
  error: "#FCA5A5",
  onError: "#450A0A",
  errorTint: "#450A0A",
} as const satisfies Record<ColorToken, string>;

/** Status tags for the dark palette: dark fills with light text, same hues as `statusTags`. */
export const darkStatusTags = {
  notInvoiced: { label: "Not invoiced", text: "#D4D4D8", background: "#232D38" },
  draft: { label: "Draft", text: darkColors.textOnTint, background: darkColors.tint },
  sent: { label: "Waiting on payment", text: "#FCD34D", background: "#422006" },
  paid: { label: "Paid", text: "#86EFAC", background: "#052E16" },
  error: { label: "Error", text: darkColors.error, background: darkColors.errorTint },
} as const satisfies Record<StatusTagToken, { label: string; text: string; background: string }>;

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

/**
 * Names the phone app loads Inter's static weights under (with expo-font), and that
 * `heroui-native.css` refers to. React Native picks a font by name, not weight.
 */
export const nativeFontFaces = {
  normal: "Inter-Regular",
  medium: "Inter-Medium",
  semibold: "Inter-SemiBold",
  bold: "Inter-Bold",
} as const;

/** Soft shadows for cards and overlays. */
export const shadows = {
  card: "0 1px 2px 0 rgba(17, 24, 28, 0.04), 0 2px 8px 0 rgba(17, 24, 28, 0.06)",
  overlay: "0 4px 12px 0 rgba(17, 24, 28, 0.08), 0 16px 32px 0 rgba(17, 24, 28, 0.10)",
} as const;

/** Smallest touch target in px (design rule). */
export const minTouchTarget = 44;

export type ColorToken = keyof typeof colors;

/**
 * Invoice style accent colours (desktop Invoice style screen). Each is used for
 * headings and lines on a white invoice page, so each reaches 4.5:1 on white.
 */
export const invoiceAccents = {
  sky: { label: "Sky", hex: "#0369A1" },
  forest: { label: "Forest", hex: "#166534" },
  ocean: { label: "Ocean", hex: "#0F766E" },
  plum: { label: "Plum", hex: "#86198F" },
  charcoal: { label: "Charcoal", hex: "#374151" },
} as const;

/**
 * Invoice style fonts. "Clean" is Inter and "Nunito" is Nunito, both bundled with
 * the desktop app as variable fonts; "Serif" uses system serif fonts.
 */
export const invoiceFonts = {
  clean: { label: "Clean", stack: font.stack },
  serif: { label: "Serif", stack: 'Georgia, Cambria, "Times New Roman", serif' },
  nunito: {
    label: "Nunito",
    stack: '"Nunito Variable", Nunito, "Avenir Next", "Segoe UI", system-ui, sans-serif',
  },
} as const;

export type InvoiceAccentToken = keyof typeof invoiceAccents;
export type InvoiceFontToken = keyof typeof invoiceFonts;
