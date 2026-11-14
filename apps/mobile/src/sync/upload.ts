import type { UploadRejection } from "@kineo/shared";

/** The eleven server tables. Nothing else is ever uploaded. */
export const TABLES = [
  "profiles",
  "practice_settings",
  "invoice_styles",
  "patients",
  "price_items",
  "invoices",
  "visits",
  "invoice_lines",
  "funding_types",
  "patient_fundings",
  "visit_items",
] as const;

/**
 * The invoice's Bill to columns, sent to `create_invoice` as `p_billing`. jsonb
 * (bill_to_details) goes as the JSON text it's stored as; the server reads it.
 */
const BILLING_COLUMNS = [
  "bill_to_kind",
  "bill_to_name",
  "bill_to_address",
  "bill_to_funding_name",
  "patient_funding_id",
  "bill_to_details",
] as const;

/** One local change, as PowerSync's upload queue gives it. */
export interface Change {
  op: "PUT" | "PATCH" | "DELETE";
  table: string;
  id: string;
  opData?: Record<string, unknown> | undefined;
}

/** Try again later: the session expired, or the server or network had a problem. */
export class RetryLater extends Error {
  override name = "RetryLater";
}

/** The `fetch` the uploader calls (the global one in the app, a fake in tests). */
export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function refused(change: Change, message: string): UploadRejection {
  return { table: change.table, operation: change.op, status: 0, code: null, message };
}

/**
 * Sends local changes to PostgREST, one request per change, except a new invoice:
 * it and the visits put on it in the same transaction go as one `create_invoice`
 * call, which saves them together or not at all and replaces a number another
 * device already used. The same rules as desktop's `src-tauri/src/sync/upload.rs`.
 */
export class Uploader {
  private readonly apiUrl: string;

  /**
   * `apiUrl` is PostgREST's base, e.g. `https://api.getkineo.work/rest/v1`.
   * `booleans` lists each table's boolean columns (0/1 locally).
   */
  constructor(
    apiUrl: string,
    private readonly booleans: Readonly<Record<string, readonly string[]>>,
    private readonly fetchFn: Fetch,
  ) {
    this.apiUrl = apiUrl.replace(/\/+$/, "");
  }

  /** The JSON the server expects: 0/1 back to false/true in boolean columns. */
  private body(table: string, data: Record<string, unknown>): Record<string, unknown> {
    const booleans = this.booleans[table] ?? [];
    const row: Record<string, unknown> = {};
    for (const [column, value] of Object.entries(data)) {
      row[column] = booleans.includes(column) && typeof value === "number" ? value !== 0 : value;
    }
    return row;
  }

  /** The `create_invoice` arguments, and which changes they cover (the visits put on it). */
  private createInvoice(
    invoice: Change,
    changes: readonly Change[],
  ): { args: Record<string, unknown>; covered: number[] } | UploadRejection {
    const data = invoice.opData ?? {};
    const covered: number[] = [];
    const visitIds: string[] = [];
    for (const [index, change] of changes.entries()) {
      if (
        change.table !== "visits" ||
        change.op !== "PATCH" ||
        change.opData?.["invoice_id"] !== invoice.id
      ) {
        continue;
      }
      if (!UUID.test(change.id)) return refused(change, "The row's ID isn't valid.");
      covered.push(index);
      visitIds.push(change.id);
    }
    const args = {
      p_id: invoice.id,
      p_patient_id: data["patient_id"] ?? null,
      p_number: data["number"] ?? null,
      p_tax_rate_basis_points: data["tax_rate_basis_points"] ?? null,
      p_visit_ids: visitIds,
      p_created_at: data["created_at"] ?? null,
      p_billing: Object.fromEntries(
        BILLING_COLUMNS.map((column) => [column, data[column] ?? null]),
      ),
    };
    return { args, covered };
  }

  private request(change: Change, changes: readonly Change[], handled: Set<number>) {
    const json = { "Content-Type": "application/json" };
    const data = change.opData ?? {};
    const byId = `${this.apiUrl}/${change.table}?id=eq.${change.id}`;
    if (change.op === "PUT" && change.table === "invoices") {
      const plan = this.createInvoice(change, changes);
      if (!("args" in plan)) return plan;
      for (const index of plan.covered) handled.add(index);
      return {
        url: `${this.apiUrl}/rpc/create_invoice`,
        init: { method: "POST", headers: json, body: JSON.stringify(plan.args) },
      };
    }
    if (change.op === "PUT") {
      return {
        url: `${this.apiUrl}/${change.table}`,
        init: {
          method: "POST",
          headers: { ...json, Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({ ...this.body(change.table, data), id: change.id }),
        },
      };
    }
    if (change.op === "PATCH") {
      if (Object.keys(data).length === 0) return null;
      return {
        url: byId,
        init: {
          method: "PATCH",
          headers: { ...json, Prefer: "return=minimal" },
          body: JSON.stringify(this.body(change.table, data)),
        },
      };
    }
    return { url: byId, init: { method: "DELETE", headers: { Prefer: "return=minimal" } } };
  }

  /**
   * Uploads one transaction's changes in order. `null`: all saved. A rejection: the
   * server refused one, and later changes in the transaction aren't sent. Throws
   * RetryLater when it's worth trying again. Errors never include the URL, token
   * or row data.
   */
  async upload(sessionToken: string, changes: readonly Change[]): Promise<UploadRejection | null> {
    const handled = new Set<number>();
    for (const [index, change] of changes.entries()) {
      if (handled.has(index)) continue;
      if (!(TABLES as readonly string[]).includes(change.table)) {
        return refused(change, "Not a table Kineō syncs.");
      }
      if (!UUID.test(change.id)) return refused(change, "The row's ID isn't valid.");
      const request = this.request(change, changes, handled);
      if (request === null) continue;
      if (!("url" in request)) return request;

      let response: Response;
      try {
        response = await this.fetchFn(request.url, {
          ...request.init,
          headers: { ...request.init.headers, Authorization: `Bearer ${sessionToken}` },
        });
      } catch {
        throw new RetryLater("Couldn't reach the server.");
      }
      if (response.ok) continue;
      const status = response.status;
      if (status === 401 || status === 408 || status === 429 || status >= 500) {
        throw new RetryLater(`The server answered ${status}.`);
      }
      // Any other refusal won't succeed on retry: report it and move on.
      const error = await response.json().then(
        (value: unknown) => (typeof value === "object" && value !== null ? value : {}),
        () => ({}),
      );
      const code = "code" in error && typeof error.code === "string" ? error.code : null;
      const message =
        "message" in error && typeof error.message === "string" ? error.message : null;
      return { table: change.table, operation: change.op, status, code, message };
    }
    return null;
  }
}
