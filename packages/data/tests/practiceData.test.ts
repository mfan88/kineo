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
  it("watches all eleven tables, only the practitioner's rows", () => {
    const { db, watches } = fakeDb();
    watch(db);
    expect(watches.size).toBe(11);
    for (const [table, query] of Object.entries(PRACTICE_QUERIES)) {
      expect(watches.get(table)?.params).toEqual([OWNER]);
      expect(query).toContain("WHERE owner_id = ?");
    }
  });

  it("maps the funding tables, and leaves out a funding type it can't read", () => {
    const { db, answerAll } = fakeDb();
    const { onData, onError } = watch(db);
    const typeId = "5eed0000-0000-4000-8000-000000000701";
    const detailId = "5eed0000-0000-4000-8000-000000000702";
    const type = {
      id: typeId,
      owner_id: OWNER,
      name: "Autism Funding",
      recipient_name: "Example Branch",
      recipient_address: "PO Box 1",
      details: JSON.stringify([
        { id: detailId, label: "Billing number", kind: "text", show_on_invoice: true },
      ]),
      created_at: NOW,
      updated_at: NOW,
    };
    answerAll({
      funding_types: [type, { ...type, id: P2, details: "broken" }],
      patient_fundings: [
        {
          id: "5eed0000-0000-4000-8000-000000000801",
          owner_id: OWNER,
          patient_id: P,
          funding_type_id: typeId,
          detail_values: JSON.stringify({ [detailId]: "4821" }),
          period_start: "2026-04-01",
          period_end: "2027-03-31",
          ended_on: null,
          created_at: NOW,
          updated_at: NOW,
        },
      ],
    });
    const data = onData.mock.lastCall?.[0];
    expect(data?.fundingTypes.map((t) => t.name)).toEqual(["Autism Funding"]);
    expect(data?.patientFundings).toMatchObject([
      { fundingTypeId: typeId, detailValues: { [detailId]: "4821" } },
    ]);
    expect(onError).toHaveBeenCalledWith(new RowError("funding_types"));
  });

  it("orders the funding tables by name and newest first", () => {
    expect(PRACTICE_QUERIES.funding_types).toContain("ORDER BY name COLLATE NOCASE");
    expect(PRACTICE_QUERIES.patient_fundings).toContain("ORDER BY created_at DESC");
  });

  it("loads visit items, ordered by visit then position", () => {
    expect(PRACTICE_QUERIES.visit_items).toContain("ORDER BY visit_id, position");
    const { db, answerAll } = fakeDb();
    const { onData, onError } = watch(db);
    const visitId = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
    const item = {
      id: "886313e1-3b8a-4372-9b90-0c9aee199e5d",
      owner_id: OWNER,
      visit_id: visitId,
      price_item_id: null,
      name: "Treatment",
      unit_price_cents: 9000,
      quantity: 2,
      position: 0,
      created_at: NOW,
    };
    answerAll({
      visit_items: [
        item,
        { ...item, id: "886313e1-3b8a-4372-9b90-0c9aee199e5e", position: 1, name: "Band" },
        { ...item, id: "886313e1-3b8a-4372-9b90-0c9aee199e5f", quantity: 0 },
      ],
    });
    const data = onData.mock.lastCall?.[0];
    expect(data?.visitItems.map((i) => [i.name, i.quantity, i.position])).toEqual([
      ["Treatment", 2, 0],
      ["Band", 2, 1],
    ]);
    expect(onError).toHaveBeenCalledWith(new RowError("visit_items"));
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
      visitItems: [],
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
