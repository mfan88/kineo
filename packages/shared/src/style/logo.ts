/** Invoice logo rules: PNG, JPEG or SVG, up to 1 MB. */

export const LOGO_TYPES = ["image/png", "image/jpeg", "image/svg+xml"] as const;
export const MAX_LOGO_BYTES = 1024 * 1024;

/**
 * Why a chosen file can't be the logo, as a message to show under the field, or
 * null if it's fine.
 */
export function logoFileError(file: { type: string; size: number }): string | null {
  if (!LOGO_TYPES.some((type) => type === file.type)) {
    return "Choose a PNG, JPEG or SVG image.";
  }
  if (file.size === 0) {
    return "That file is empty. Choose another image.";
  }
  if (file.size > MAX_LOGO_BYTES) {
    return "Choose an image of 1 MB or less.";
  }
  return null;
}
