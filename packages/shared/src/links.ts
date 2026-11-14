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
