/** Scheme and host the desktop app listens on for the end of Google sign-in. */
const APP_LINK = "kineo://sso-callback";

/**
 * The app link for the query string Clerk added to the page address, keeping
 * every param. Null when there is no non-empty rotating_token_nonce, so a
 * direct visit never opens the app.
 */
export function appLinkFrom(search: string): string | null {
  const params = new URLSearchParams(search);
  if (!params.get("rotating_token_nonce")) return null;
  return `${APP_LINK}?${params.toString()}`;
}
