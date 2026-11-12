import { PENDING_INVOICES_QUERY, PRACTICE_QUERIES, type QueryRows } from "@kineo/data";
import type { PracticeDatabase } from "./practice-store";

type Handler = { onResult: (results: QueryRows) => void; onError?: (error: Error) => void };

/**
 * For tests: a database that records what the store watches and lets the test
 * answer each query (or fail it), decide whether opening works, and see what was written.
 */
export function fakeDatabase({
  open = () => Promise.resolve(),
  lookup = () => null,
}: {
  open?: () => Promise<void>;
  /** The row a write reads before changing anything (e.g. the visit being edited). */
  lookup?: (sql: string, parameters: unknown[]) => unknown;
} = {}) {
  const watches = new Map<
    string,
    { handler: Handler; params: unknown[]; signal: AbortSignal | undefined }
  >();
  let opened = 0;
  let pendingHandler: Handler | undefined;
  const writes: { sql: string; parameters: unknown[] }[] = [];
  const db: PracticeDatabase = {
    init: () => {
      opened += 1;
      return open();
    },
    watchWithCallback: (sql, params, handler, options) => {
      if (sql === PENDING_INVOICES_QUERY) {
        pendingHandler = handler;
        // Nothing is waiting to upload unless the test says so.
        handler?.onResult({ rows: { _array: [] } });
        return;
      }
      const table = Object.entries(PRACTICE_QUERIES).find(([, query]) => query === sql)?.[0];
      if (!table || !handler) throw new Error(`Unexpected query: ${sql}`);
      watches.set(table, { handler, params: params ?? [], signal: options?.signal });
    },
    // Writes are recorded, not stored: the test answers the watched queries itself.
    writeTransaction: (callback) =>
      callback({
        execute: (sql, parameters) => {
          writes.push({ sql, parameters: parameters ?? [] });
          return Promise.resolve();
        },
        getOptional: <T>(sql: string, parameters?: unknown[]) => {
          // The caller's row type is taken on trust, as with a real database.
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion
          const row = (lookup(sql, parameters ?? []) ?? null) as T | null;
          return Promise.resolve(row);
        },
      }),
  };
  return {
    db,
    opened: () => opened,
    writes,
    params: () => [...watches.values()].map((watch) => watch.params),
    watching: () => [...watches.values()].filter((watch) => !watch.signal?.aborted).length,
    /** Answers every query, with the given rows per table (none by default). */
    answerAll: (rows: Record<string, unknown[]> = {}) => {
      for (const [table, watch] of watches) {
        watch.handler.onResult({ rows: { _array: rows[table] ?? [] } });
      }
    },
    /** Says which invoices are still waiting to upload. */
    setPending: (ids: string[]) => {
      pendingHandler?.onResult({ rows: { _array: ids.map((id) => ({ id })) } });
    },
    failQuery: (table: keyof typeof PRACTICE_QUERIES) => {
      watches.get(table)?.handler.onError?.(new Error("query failed"));
    },
  };
}
