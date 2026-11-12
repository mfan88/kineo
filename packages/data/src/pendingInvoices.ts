import type { WatchableDatabase } from "./practiceData";

/**
 * New invoices still waiting to upload: PowerSync's upload queue (`ps_crud`) holds
 * each local change as JSON (`op`, `type`, `id`); an invoice's creation is its PUT.
 * Until it has uploaded, the server may still give it a different number (another
 * device used it), so the apps don't let it be sent yet.
 */
export const PENDING_INVOICES_QUERY = `SELECT DISTINCT json_extract(data, '$.id') AS id FROM ps_crud
WHERE json_extract(data, '$.type') = 'invoices' AND json_extract(data, '$.op') = 'PUT'`;

/**
 * Watches which invoices haven't reached the server yet. Calls `onChange` with
 * their IDs straight away and whenever the upload queue changes. Returns a
 * function that stops watching.
 */
export function watchPendingInvoices(
  db: WatchableDatabase,
  onChange: (ids: ReadonlySet<string>) => void,
  onError?: (error: Error) => void,
): () => void {
  const controller = new AbortController();
  db.watchWithCallback(
    PENDING_INVOICES_QUERY,
    [],
    {
      onResult: (result) => {
        if (controller.signal.aborted) return;
        const ids = new Set<string>();
        for (const row of result.array) {
          if (typeof row.id === "string") ids.add(row.id);
        }
        onChange(ids);
      },
      onError: (error) => onError?.(error),
    },
    // ps_crud is PowerSync's own table; name it so its changes trigger the watch.
    { signal: controller.signal, tables: ["ps_crud"] },
  );
  return () => controller.abort();
}
