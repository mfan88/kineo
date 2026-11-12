/**
 * Site-wide settings. Values in [BRACKETS] are placeholders to fill in before
 * launch; they are shown as-is on the site so they're easy to spot.
 */
export const site = {
  name: "Kineō",
  /** Origin the site is served from, without a trailing slash, e.g. https://kineo.app */
  url: "[SITE URL]",
  contactEmail: "[CONTACT EMAIL]",
  copyright: "© 2026 Marcus Fan",
  defaultDescription: "Simple notes and invoicing for physiotherapists.",
} as const;

/** Whether a config value is still a [PLACEHOLDER]. */
export function isPlaceholder(value: string): boolean {
  return /^\[.+\]$/.test(value);
}
