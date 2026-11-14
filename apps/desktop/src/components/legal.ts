import { FEEDBACK_EMAIL, LEGAL_LINKS } from "@kineo/shared";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { notifyError } from "./Toasts";

export { LEGAL_LINKS };

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

/**
 * Opens a mailto link in the default mail app, through the opener plugin (its default
 * permission allows mailto links; browser.rs stays limited to Kineō's web pages).
 */
export function openMailto(href: string): void {
  if (!isTauri()) {
    window.location.href = href;
    return;
  }
  openUrl(href).catch(() => {
    notifyError(`Couldn't open your email app. Write to ${FEEDBACK_EMAIL} instead.`);
  });
}
