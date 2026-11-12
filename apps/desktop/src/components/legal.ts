import { invoke, isTauri } from "@tauri-apps/api/core";
import { notifyError } from "./Toasts";

/** Kineō's terms and privacy pages on the website. */
export const LEGAL_LINKS = [
  { label: "Terms", href: "https://getkineo.work/terms/" },
  { label: "Privacy", href: "https://getkineo.work/privacy/" },
] as const;

/**
 * Opens a page in the default browser and brings it to the front (Rust:
 * src-tauri/src/browser.rs, which only opens getkineo.work pages). Outside the
 * Tauri window (a plain browser), a new tab instead.
 */
export function openInBrowser(href: string): void {
  if (!isTauri()) {
    window.open(href, "_blank", "noopener");
    return;
  }
  invoke("open_in_browser", { url: href }).catch(() => {
    notifyError(`Couldn't open the page. Visit ${href} in your browser.`);
  });
}
