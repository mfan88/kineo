import { BOOLEAN_COLUMNS } from "@kineo/data";
import type { PowerSyncTauriDatabase } from "@powersync/tauri-plugin";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { startSync, type GetToken } from "./sync";

const tauri = vi.hoisted(() => ({
  listeners: new Map<string, (event: { payload: unknown }) => void>(),
  unlisten: vi.fn<() => void>(),
  invoke: vi.fn<(command: string, args?: unknown) => Promise<unknown>>(async () => null),
  notifyError: vi.fn<(message: string) => string>(() => "toast"),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: tauri.invoke }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: async (name: string, handler: (event: { payload: unknown }) => void) => {
    tauri.listeners.set(name, handler);
    return tauri.unlisten;
  },
}));
vi.mock("../components/Toasts", () => ({ notifyError: tauri.notifyError }));

function fakeDb() {
  const init = vi.fn<() => Promise<void>>(async () => {});
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return { db: { init, rustHandle: 7 } as unknown as PowerSyncTauriDatabase, init };
}

const emit = (name: string, payload: unknown) => tauri.listeners.get(name)?.({ payload });
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  tauri.listeners.clear();
  tauri.unlisten.mockClear();
  tauri.invoke.mockReset();
  tauri.invoke.mockResolvedValue(null);
  tauri.notifyError.mockClear();
});

describe("startSync", () => {
  it("opens the database and connects it with the boolean column list", async () => {
    const { db, init } = fakeDb();
    await startSync(db, async () => "jwt");
    expect(init).toHaveBeenCalled();
    expect(tauri.invoke).toHaveBeenCalledWith("sync_connect", {
      handle: 7,
      booleanColumns: BOOLEAN_COLUMNS,
    });
  });

  it("passes on the sync status the Rust side reports, until stopped", async () => {
    const seen: unknown[] = [];
    const stop = await startSync(
      fakeDb().db,
      async () => "jwt",
      (status) => seen.push(status),
    );
    emit("kineo://sync-status", { hasSynced: false, connected: true });
    emit("kineo://sync-status", { hasSynced: true, connected: true });
    expect(seen).toEqual([
      { hasSynced: false, connected: true },
      { hasSynced: true, connected: true },
    ]);
    const before = tauri.unlisten.mock.calls.length;
    stop();
    expect(tauri.unlisten.mock.calls.length).toBe(before + 3);
  });

  it("answers token requests with the right Clerk token", async () => {
    const getToken = vi.fn<GetToken>(async (options) =>
      options?.template === "powersync" ? "powersync-jwt" : "session-jwt",
    );
    await startSync(fakeDb().db, getToken);

    emit("kineo://token-request", { id: 1, kind: "powersync" });
    emit("kineo://token-request", { id: 2, kind: "session" });
    await settle();

    expect(getToken).toHaveBeenCalledWith({ template: "powersync" });
    expect(getToken).toHaveBeenCalledWith(undefined);
    expect(tauri.invoke).toHaveBeenCalledWith("sync_token_reply", {
      id: 1,
      token: "powersync-jwt",
      error: null,
    });
    expect(tauri.invoke).toHaveBeenCalledWith("sync_token_reply", {
      id: 2,
      token: "session-jwt",
      error: null,
    });
  });

  it("tells Rust when Clerk can't give a token", async () => {
    await startSync(fakeDb().db, () => Promise.reject(new Error("offline")));
    emit("kineo://token-request", { id: 3, kind: "session" });
    await settle();
    expect(tauri.invoke).toHaveBeenCalledWith("sync_token_reply", {
      id: 3,
      token: null,
      error: "Couldn't get a sign-in token.",
    });
  });

  it("shows a refused change as an error toast", async () => {
    await startSync(fakeDb().db, async () => "jwt");
    emit("kineo://upload-rejected", {
      table: "visits",
      operation: "PATCH",
      status: 400,
      code: "23514",
      message: "Visits can't be added once an invoice is sent.",
    });
    expect(tauri.notifyError).toHaveBeenCalledWith(
      "Visits can't be added once an invoice is sent. That change was undone.",
    );
  });

  it("stops listening if connecting fails, and when stopped", async () => {
    tauri.invoke.mockRejectedValueOnce(new Error("no database"));
    await expect(startSync(fakeDb().db, async () => "jwt")).rejects.toThrow("no database");
    expect(tauri.unlisten).toHaveBeenCalledTimes(3);

    tauri.unlisten.mockClear();
    const stop = await startSync(fakeDb().db, async () => "jwt");
    stop();
    expect(tauri.unlisten).toHaveBeenCalledTimes(3);
  });
});
