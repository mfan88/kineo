/**
 * Site-wide settings. Values in [BRACKETS] are placeholders to fill in before
 * launch; they are shown as-is on the site so they're easy to spot.
 */
export const site = {
  name: "Kineō",
  /** Origin the site is served from, without a trailing slash, e.g. https://kineo.app */
  url: "https://www.getkineo.work",
  contactEmail: "support@fenna.tech",
  copyright: "© 2026 fenna.tech (M2 Investments Corporation)",
  defaultDescription: "Simple notes and invoicing for physiotherapists.",
} as const;

/** Whether a config value is still a [PLACEHOLDER]. */
export function isPlaceholder(value: string): boolean {
  return /^\[.+\]$/.test(value);
}
