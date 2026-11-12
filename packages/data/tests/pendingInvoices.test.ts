import { queryResultFromMapped, type SqliteRecord, type WatchHandler } from "@powersync/common";
import { describe, expect, it, vi } from "vitest";
import { PENDING_INVOICES_QUERY, watchPendingInvoices, type WatchableDatabase } from "../src";
import { testDatabase } from "./sqlite";

function fakeDb() {
  let handler: WatchHandler | undefined;
  let options: { signal?: AbortSignal; tables?: string[] } | undefined;
  const db: WatchableDatabase = {
    watchWithCallback: (_sql, _params, h, o) => {
      handler = h;
      options = o;
    },
  };
  const answer = (rows: SqliteRecord[]) => handler?.onResult(queryResultFromMapped({}, rows));
  return { db, answer, options: () => options, handler: () => handler };
}

describe("watchPendingInvoices", () => {
  it("passes on the IDs of invoices not yet uploaded, as they change", () => {
    const { db, answer } = fakeDb();
    const onChange = vi.fn<(ids: ReadonlySet<string>) => void>();
    watchPendingInvoices(db, onChange);
    answer([{ id: "a" }, { id: "b" }]);
    answer([{ id: "b" }]);
    answer([]);
    expect(onChange.mock.calls.map(([ids]) => [...ids])).toEqual([["a", "b"], ["b"], []]);
  });

  it("watches PowerSync's upload queue, and stops when asked", () => {
    const { db, answer, options } = fakeDb();
    const onChange = vi.fn<(ids: ReadonlySet<string>) => void>();
    const stop = watchPendingInvoices(db, onChange);
    expect(options()?.tables).toEqual(["ps_crud"]);
    stop();
    expect(options()?.signal?.aborted).toBe(true);
    answer([{ id: "a" }]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("passes on query errors", () => {
    const { db, handler } = fakeDb();
    const onError = vi.fn<(error: Error) => void>();
    watchPendingInvoices(db, () => {}, onError);
    handler()?.onError?.(new Error("disk"));
    expect(onError).toHaveBeenCalledWith(new Error("disk"));
  });

  it("finds only invoice creations in the queue's JSON, once each", () => {
    const { run, all } = testDatabase();
    run("CREATE TABLE ps_crud (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT)");
    const add = (op: string, type: string, id: string) =>
      run("INSERT INTO ps_crud (data) VALUES (?)", JSON.stringify({ op, type, id, data: {} }));
    add("PUT", "invoices", "inv-new");
    add("PATCH", "invoices", "inv-old");
    add("PATCH", "visits", "visit-1");
    add("PUT", "patients", "patient-1");
    add("PUT", "invoices", "inv-new");
    expect(all(PENDING_INVOICES_QUERY)).toEqual([{ id: "inv-new" }]);
  });
});
