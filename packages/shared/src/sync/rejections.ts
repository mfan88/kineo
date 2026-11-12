/** A change the server refused, as the sync connector reports it (never row data). */
export interface UploadRejection {
  table: string;
  operation: string;
  status: number;
  /** Postgres error code, e.g. 23514 for a failed check. */
  code?: string | null;
  /** The database's message. Kineō's own triggers write ones meant for people. */
  message?: string | null;
}

const THINGS: Record<string, string> = {
  profiles: "your profile",
  practice_settings: "your settings",
  invoice_styles: "your invoice style",
  patients: "a patient",
  price_items: "your price list",
  invoices: "an invoice",
  visits: "a visit note",
  invoice_lines: "an invoice line",
};

/**
 * Plain wording for a refused change. Kineō's own trigger messages (check
 * violations that don't come from a named constraint) are shown as they are;
 * anything else gets a general message, never the database's technical text.
 */
export function uploadRejectionMessage(rejection: UploadRejection): string {
  const message = rejection.message?.trim() ?? "";
  const fromTrigger =
    rejection.code === "23514" && message !== "" && !message.startsWith("new row ");
  if (fromTrigger) return `${message} That change was undone.`;
  const thing = THINGS[rejection.table] ?? "a change";
  return `The server didn't accept a change to ${thing}, so it was undone. Check it and try again.`;
}
