import { queryResultFromMapped, type SqliteRecord, type WatchHandler } from "@powersync/common";
import { describe, expect, it, vi } from "vitest";
import {
  PRACTICE_QUERIES,
  RowError,
  watchPracticeData,
  type PracticeData,
  type WatchableDatabase,
} from "../src";

const OWNER = "user_test";
const NOW = "2026-11-12T10:00:00.000Z";
const P = "0f8fad5b-d9cb-469f-a165-70867728950e";
const P2 = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

const patient = (id: string, fullName: string) => ({
  id,
  owner_id: OWNER,
  full_name: fullName,
  reason_for_visit: null,
  created_at: NOW,
  updated_at: NOW,
});

/** A stand-in database: each test answers each table's watch when it likes. */
function fakeDb() {
  const watches = new Map<
    string,
    { handler: WatchHandler; params: unknown[]; signal: AbortSignal | undefined }
  >();
  const db: WatchableDatabase = {
    watchWithCallback: (sql, params, handler, options) => {
      const table = Object.entries(PRACTICE_QUERIES).find(([, query]) => query === sql)?.[0];
      if (!table || !handler) throw new Error(`Unexpected query: ${sql}`);
      watches.set(table, { handler, params: params ?? [], signal: options?.signal });
    },
  };
  const answer = (table: string, rows: SqliteRecord[]) => {
    watches.get(table)?.handler.onResult(queryResultFromMapped({}, rows));
  };
  const answerAll = (rows: Partial<Record<string, SqliteRecord[]>> = {}) => {
    for (const table of Object.keys(PRACTICE_QUERIES)) answer(table, rows[table] ?? []);
  };
  return { db, watches, answer, answerAll };
}

function watch(db: WatchableDatabase) {
  const onData = vi.fn<(data: PracticeData) => void>();
  const onError = vi.fn<(error: Error) => void>();
  const stop = watchPracticeData(db, OWNER, { onData, onError }, () => NOW);
  return { onData, onError, stop };
}

describe("watchPracticeData", () => {
  it("watches all eight tables, only the practitioner's rows", () => {
    const { db, watches } = fakeDb();
    watch(db);
    expect(watches.size).toBe(8);
    for (const [table, query] of Object.entries(PRACTICE_QUERIES)) {
      expect(watches.get(table)?.params).toEqual([OWNER]);
      expect(query).toContain("WHERE owner_id = ?");
    }
  });

  it("waits until every table has answered", () => {
    const { db, answer } = fakeDb();
    const { onData } = watch(db);
    answer("patients", [patient(P, "Sky Example")]);
    answer("visits", []);
    expect(onData).not.toHaveBeenCalled();
  });

  it("gives an empty practice with default profile, settings and style", () => {
    const { db, answerAll } = fakeDb();
    const { onData } = watch(db);
    answerAll();
    expect(onData).toHaveBeenCalledTimes(1);
    const data = onData.mock.lastCall?.[0];
    expect(data).toMatchObject({
      patients: [],
      visits: [],
      invoices: [],
      lineItems: [],
      priceItems: [],
    });
    expect(data?.profile.fullName).toEqual({ value: "", showOnInvoice: false });
    expect(data?.settings.defaultTaxRateBasisPoints).toBe(0);
    expect(data?.invoiceStyle.accentColor).toBe("sky");
  });

  it("sends everything again when one table changes", () => {
    const { db, answer, answerAll } = fakeDb();
    const { onData } = watch(db);
    answerAll({ patients: [patient(P, "Sky Example")] });
    answer("patients", [patient(P, "Sky Example"), patient(P2, "Rain Example")]);
    expect(onData).toHaveBeenCalledTimes(2);
    expect(onData.mock.lastCall?.[0].patients.map((p) => p.fullName)).toEqual([
      "Sky Example",
      "Rain Example",
    ]);
  });

  it("leaves out a row that can't be read, reports it, and keeps the rest", () => {
    const { db, answerAll } = fakeDb();
    const { onData, onError } = watch(db);
    answerAll({ patients: [patient(P, "Sky Example"), patient(P2, "   ")] });
    expect(onData.mock.lastCall?.[0].patients.map((p) => p.id)).toEqual([P]);
    expect(onError).toHaveBeenCalledWith(expect.any(RowError));
  });

  it("falls back to the defaults if the profile can't be read", () => {
    const { db, answerAll } = fakeDb();
    const { onData, onError } = watch(db);
    answerAll({ profiles: [{ id: P, owner_id: OWNER, full_name: 42, updated_at: "garbage" }] });
    expect(onData.mock.lastCall?.[0].profile.fullName.value).toBe("");
    expect(onError).toHaveBeenCalledWith(expect.any(RowError));
  });

  it("passes on query errors", () => {
    const { db, watches } = fakeDb();
    const { onError } = watch(db);
    watches.get("visits")?.handler.onError?.(new Error("disk full"));
    expect(onError).toHaveBeenCalledWith(new Error("disk full"));
  });

  it("stops: cancels every watch and ignores late answers", () => {
    const { db, watches, answerAll } = fakeDb();
    const { onData, stop } = watch(db);
    stop();
    expect([...watches.values()].every(({ signal }) => signal?.aborted)).toBe(true);
    answerAll();
    expect(onData).not.toHaveBeenCalled();
  });
});
