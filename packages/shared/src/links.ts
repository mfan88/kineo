/** Kineō's terms and privacy pages on the website. Both apps link to these. */
export const LEGAL_LINKS = [
  { label: "Terms", href: "https://getkineo.work/terms/" },
  { label: "Privacy", href: "https://getkineo.work/privacy/" },
] as const;

/** Where feedback and support emails go. */
export const FEEDBACK_EMAIL = "support@fenna.tech";

/**
 * A mailto link for sending feedback: a subject, an empty message and a footer with
 * the app's name and version. Nothing about the practice or its patients.
 */
export function feedbackMailto(appName: string, version: string): string {
  const subject = encodeURIComponent(`${appName} feedback`);
  const body = encodeURIComponent(`\n\n—\n${appName} ${version}`);
  return `mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`;
}

/**
 * A mailto link for account deletion or data export requests.
 */
export function accountRequestMailto(appName: string, version: string): string {
  const subject = encodeURIComponent(`${appName} account request`);
  const body = encodeURIComponent(
    `\n\nTell us if you'd like to close your account or get a copy of your data.\n\n—\n${appName} ${version}`,
  );
  return `mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`;
}
