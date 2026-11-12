/**
 * Where to get each Kineō app. Links stay [PLACEHOLDERS] and every status stays
 * "coming-soon" until a build is actually published.
 */

export const DOWNLOAD_STATUSES = ["available", "beta", "coming-soon"] as const;
export type DownloadStatus = (typeof DOWNLOAD_STATUSES)[number];

export interface Download {
  platform: "iphone" | "android" | "mac" | "windows";
  name: string;
  /** One short line, e.g. the store or minimum OS. */
  requirement: string;
  /** Store or download URL; a [PLACEHOLDER] until published. */
  link: string;
  status: DownloadStatus;
}

export const downloads: readonly Download[] = [
  {
    platform: "iphone",
    name: "iPhone",
    requirement: "From the App Store.",
    link: "[APP STORE LINK]",
    status: "coming-soon",
  },
  {
    platform: "android",
    name: "Android",
    requirement: "From Google Play.",
    link: "[GOOGLE PLAY LINK]",
    status: "coming-soon",
  },
  {
    platform: "mac",
    name: "Mac",
    requirement: "Desktop app for macOS.",
    link: "[MAC DOWNLOAD LINK]",
    status: "coming-soon",
  },
  {
    platform: "windows",
    name: "Windows",
    requirement: "Desktop app for Windows.",
    link: "[WINDOWS DOWNLOAD LINK]",
    status: "coming-soon",
  },
];

/** Whether a link is a real https URL (not a placeholder). */
export function isRealLink(link: string): boolean {
  try {
    return new URL(link).protocol === "https:";
  } catch {
    return false;
  }
}
