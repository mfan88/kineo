import { PROFILE_FIELD_LABELS, profileErrors } from "../profile/rules";
import type { Invoice, Profile } from "../types/models";

/** One reason a draft can't be sent yet. */
export interface SendProblem {
  /** What's wrong and what to do, safe to show. */
  message: string;
  /** Fixed in Your profile, so the alert links there. */
  inProfile: boolean;
}

/** "phone", "address and phone", "name, address and phone". */
function listOf(words: readonly string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words.at(-1) ?? ""}`;
}

/**
 * Why a draft can't be sent (or its PDF shared) yet, each reason saying what to do;
 * empty when it can. Sent and paid invoices have nothing left to send.
 */
export function sendProblems({
  invoice,
  lineCount,
  profile,
  pending,
}: {
  invoice: Pick<Invoice, "status">;
  lineCount: number;
  profile: Profile;
  /** The invoice hasn't reached the server, so its number may still change. */
  pending: boolean;
}): SendProblem[] {
  if (invoice.status !== "draft") return [];
  const problems: SendProblem[] = [];
  if (lineCount === 0) {
    problems.push({ message: "Add at least one line item before sending.", inProfile: false });
  }
  const missing = profileErrors(profile);
  if (missing.length > 0) {
    const fields = missing.map((error) => PROFILE_FIELD_LABELS[error.field].toLowerCase());
    const shown = fields.length === 1 ? "It's shown on invoices." : "They're shown on invoices.";
    problems.push({
      message: `Add your ${listOf(fields)} before sending. ${shown}`,
      inProfile: true,
    });
  }
  if (pending) {
    problems.push({
      message:
        "This invoice hasn't reached the server yet, so its number isn't final. Connect to the internet; you can send it once it's synced.",
      inProfile: false,
    });
  }
  return problems;
}
