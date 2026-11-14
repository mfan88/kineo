/** Scheme and host the desktop app listens on for the end of Google sign-in. */
const APP_LINK = "kineo://sso-callback";

/**
 * The app link for the query string Clerk added to the page address, keeping
 * every param. A visit with no query also opens the app.
 */
export function appLinkFrom(search: string): string {
  const query = new URLSearchParams(search).toString();
  return query ? `${APP_LINK}?${query}` : APP_LINK;
}
