import type { WriteEnvironment } from "@kineo/data";
import { describe, expect, it, vi } from "vitest";
import { fakeDatabase } from "./fake-database";
import { PracticeStore } from "./practice-store";

const NOW = "2026-11-12T17:00:00.000Z";
const ENV: WriteEnvironment = {
  ownerId: "owner_test",
  now: () => NOW,
  today: () => "2026-11-12",
  newId: () => "00000000-0000-4000-8000-000000000001",
};

const PATIENT_ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  owner_id: "owner_test",
  full_name: "Jordan Sample",
  reason_for_visit: null,
  created_at: NOW,
  updated_at: NOW,
};

function setUp(options?: Parameters<typeof fakeDatabase>[0]) {
  const fake = fakeDatabase(options);
  const store = new PracticeStore(fake.db, ENV);
  const listener = vi.fn<() => void>();
  store.subscribe(listener);
  return { ...fake, store, listener };
}

describe("PracticeStore", () => {
  it("is loading until started and every table has been read", () => {
    const { store, opened, params, answerAll } = setUp();
    expect(store.getState()).toEqual({ status: "loading" });
    store.start();
    expect(opened()).toBe(1);
    expect(store.getState()).toEqual({ status: "loading" });
    // Only this owner's rows are read.
    expect(params().length).toBe(10);
    expect(params().every((p) => p.length === 1 && p[0] === "owner_test")).toBe(true);

    answerAll();
    const state = store.getState();
    expect(state.status).toBe("ready");
    expect(state.status === "ready" && state.data.patients).toEqual([]);
  });

  it("shows an empty practice's defaults, and rows as they change", () => {
    const { store, listener, answerAll } = setUp();
    store.start();
    answerAll();
    listener.mockClear();

    answerAll({ patients: [PATIENT_ROW] });
    const state = store.getState();
    expect(state.status === "ready" && state.data.patients.map((p) => p.fullName)).toEqual([
      "Jordan Sample",
    ]);
    expect(state.status === "ready" && state.data.settings.ownerId).toBe("owner_test");
    expect(listener).toHaveBeenCalled();
  });

  it("leaves out a row it can't read and still shows the rest", () => {
    const { store, answerAll } = setUp();
    store.start();
    answerAll({ patients: [PATIENT_ROW] });
    expect(store.hasRowsLeftOut()).toBe(false);
    answerAll({ patients: [PATIENT_ROW, { ...PATIENT_ROW, id: "bad", full_name: null }] });
    const state = store.getState();
    expect(state.status === "ready" && state.data.patients.length).toBe(1);
    // Remembered for the session, so the screens can say so once.
    expect(store.hasRowsLeftOut()).toBe(true);
    answerAll({ patients: [PATIENT_ROW] });
    expect(store.hasRowsLeftOut()).toBe(true);
  });

  it("fails when the database can't be opened, and recovers on another start", async () => {
    let works = false;
    const { store, answerAll } = setUp({
      open: () => (works ? Promise.resolve() : Promise.reject(new Error("no disk"))),
    });
    store.start();
    await vi.waitFor(() => expect(store.getState()).toEqual({ status: "failed" }));

    works = true;
    store.start();
    expect(store.getState()).toEqual({ status: "loading" });
    answerAll();
    expect(store.getState().status).toBe("ready");
  });

  it("fails when a query fails before anything was read, but keeps data already shown", () => {
    const first = setUp();
    first.store.start();
    first.failQuery("patients");
    expect(first.store.getState()).toEqual({ status: "failed" });

    const second = setUp();
    second.store.start();
    second.answerAll();
    second.failQuery("patients");
    expect(second.store.getState().status).toBe("ready");
  });

  it("stops watching when stopped, and ignores a late failure to open", async () => {
    const rejects: ((error: Error) => void)[] = [];
    const promise = new Promise<void>((_resolve, reject) => rejects.push(reject));
    const { store, watching } = setUp({ open: () => promise });
    store.start();
    expect(watching()).toBe(10);
    store.stop();
    expect(watching()).toBe(0);
    rejects[0]?.(new Error("too late"));
    await promise.catch(() => {});
    expect(store.getState()).toEqual({ status: "loading" });
  });

  it("offers a writer for the same owner", () => {
    const { store } = setUp();
    expect(store.writer).toBeDefined();
  });

  it("knows which invoices haven't reached the server, as that changes", () => {
    const { store, listener, answerAll, setPending } = setUp();
    store.start();
    answerAll();
    expect(store.isInvoicePending("inv-1")).toBe(false);
    listener.mockClear();

    setPending(["inv-1", "inv-2"]);
    expect(store.isInvoicePending("inv-1")).toBe(true);
    expect(store.isInvoicePending("inv-3")).toBe(false);
    expect(listener).toHaveBeenCalled();

    setPending([]);
    expect(store.isInvoicePending("inv-1")).toBe(false);

    // After stopping, a late answer changes nothing.
    store.stop();
    setPending(["inv-1"]);
    expect(store.isInvoicePending("inv-1")).toBe(false);
  });
});
