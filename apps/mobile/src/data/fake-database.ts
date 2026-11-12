import { PRACTICE_QUERIES, type QueryRows } from "@kineo/data";
import type { PracticeDatabase } from "./practice-store";

type Handler = { onResult: (results: QueryRows) => void; onError?: (error: Error) => void };

/**
 * For tests: a database that records what the store watches and lets the test
 * answer each query (or fail it), and decide whether opening works.
 */
export function fakeDatabase({ open = () => Promise.resolve() } = {}) {
  const watches = new Map<
    string,
    { handler: Handler; params: unknown[]; signal: AbortSignal | undefined }
  >();
  let opened = 0;
  const db: PracticeDatabase = {
    init: () => {
      opened += 1;
      return open();
    },
    watchWithCallback: (sql, params, handler, options) => {
      const table = Object.entries(PRACTICE_QUERIES).find(([, query]) => query === sql)?.[0];
      if (!table || !handler) throw new Error(`Unexpected query: ${sql}`);
      watches.set(table, { handler, params: params ?? [], signal: options?.signal });
    },
    writeTransaction: () => Promise.reject(new Error("The fake database can't write.")),
  };
  return {
    db,
    opened: () => opened,
    params: () => [...watches.values()].map((watch) => watch.params),
    watching: () => [...watches.values()].filter((watch) => !watch.signal?.aborted).length,
    /** Answers every query, with the given rows per table (none by default). */
    answerAll: (rows: Record<string, unknown[]> = {}) => {
      for (const [table, watch] of watches) {
        watch.handler.onResult({ rows: { _array: rows[table] ?? [] } });
      }
    },
    failQuery: (table: keyof typeof PRACTICE_QUERIES) => {
      watches.get(table)?.handler.onError?.(new Error("query failed"));
    },
  };
}
