/*
 * The parts of a PowerSync database @kineo/data uses, described here rather than
 * imported from @powersync/common: desktop's Tauri SDK uses common 2.0 and the
 * React Native SDK 1.x, and both fit these shapes. Tests use plain SQLite.
 */

/**
 * A query result. Both PowerSync versions put the rows in `rows._array`
 * (2.0 also has `array`, which 1.x lacks), so read rows with rowsOf.
 */
export interface QueryRows {
  rows?: { _array: unknown[] } | undefined;
}

/** The rows of a query result, whichever PowerSync version produced it. */
export function rowsOf(result: QueryRows): unknown[] {
  // `_array` is PowerSync's name, and the one place both versions put the rows.
  // oxlint-disable-next-line eslint/no-underscore-dangle
  return result.rows?._array ?? [];
}

/** Watches a query; PowerSync calls `onResult` straight away and after each change. */
export interface WatchableDatabase {
  watchWithCallback(
    sql: string,
    parameters?: unknown[],
    handler?: { onResult: (results: QueryRows) => void; onError?: (error: Error) => void },
    options?: { signal?: AbortSignal; tables?: string[] },
  ): void;
}

/** The parts of a PowerSync transaction writes use. */
export interface WriteContext {
  execute(sql: string, parameters?: unknown[]): Promise<unknown>;
  getOptional<T>(sql: string, parameters?: unknown[]): Promise<T | null>;
  getAll<T>(sql: string, parameters?: unknown[]): Promise<T[]>;
}

/** The part of a PowerSync database writes use. */
export interface WritableDatabase {
  writeTransaction<T>(callback: (tx: WriteContext) => Promise<T>): Promise<T>;
}
