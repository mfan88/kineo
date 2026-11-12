import { describe, expect, it, vi } from "vitest";
import { LogoError, LogoStore, logoContentType, toBase64, type LogoFiles } from "./logo";

const PATH = "user_2abc123/logo-0f8fad5b-d9cb-469f-a165-70867728950e.png";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

function memoryFiles(initial: Record<string, string> = {}) {
  const kept = new Map(Object.entries(initial));
  const files: LogoFiles = {
    read: (path) => Promise.resolve(kept.get(path) ?? null),
    write: (path, bytes) => {
      kept.set(path, toBase64(bytes));
      return Promise.resolve();
    },
  };
  return { files, kept };
}

function setUp(
  respond: () => Response | Promise<Response>,
  options: { token?: string | null; files?: LogoFiles } = {},
) {
  const memory = memoryFiles();
  const fetchFn = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(() =>
    Promise.resolve(respond()),
  );
  const token = options.token === undefined ? "session-jwt" : options.token;
  const store = new LogoStore(
    options.files ?? memory.files,
    () => Promise.resolve(token),
    fetchFn,
    "https://api.test/storage/v1/",
  );
  return { store, fetchFn, kept: memory.kept };
}

describe("logoContentType", () => {
  it("accepts logo paths and gives their type", () => {
    expect(logoContentType(PATH)).toBe("image/png");
    expect(logoContentType(PATH.replace(".png", ".jpg"))).toBe("image/jpeg");
    expect(logoContentType(PATH.replace(".png", ".svg"))).toBe("image/svg+xml");
  });

  it.each([
    "",
    "logo-0f8fad5b-d9cb-469f-a165-70867728950e.png",
    "user_/logo-0f8fad5b-d9cb-469f-a165-70867728950e.png",
    "user_abc/../logo-0f8fad5b-d9cb-469f-a165-70867728950e.png",
    "user_abc/logo-not-a-uuid.png",
    "user_abc/logo-0f8fad5b-d9cb-469f-a165-70867728950e.gif",
    "admin/logo-0f8fad5b-d9cb-469f-a165-70867728950e.png",
    "user_abc/sub/logo-0f8fad5b-d9cb-469f-a165-70867728950e.png",
  ])("refuses %j", (path) => {
    expect(logoContentType(path)).toBeNull();
  });
});

describe("toBase64", () => {
  it("encodes bytes, including empty and long input", () => {
    expect(toBase64(new Uint8Array())).toBe("");
    expect(toBase64(PNG)).toBe("iVBORw==");
    const long = new Uint8Array(100_000).fill(65);
    expect(toBase64(long)).toBe(Buffer.from(long).toString("base64"));
  });
});

describe("LogoStore", () => {
  it("downloads the logo with the session token, keeps it, and returns a data URI", async () => {
    const { store, fetchFn, kept } = setUp(() => new Response(PNG));
    expect(await store.dataUri(PATH)).toBe("data:image/png;base64,iVBORw==");
    expect(fetchFn).toHaveBeenCalledWith(
      `https://api.test/storage/v1/object/authenticated/logos/${PATH}`,
      { headers: { Authorization: "Bearer session-jwt" } },
    );
    expect(kept.get(PATH)).toBe("iVBORw==");
  });

  it("uses the kept copy without going online", async () => {
    const memory = memoryFiles({ [PATH]: "a2VwdA==" });
    const { store, fetchFn } = setUp(() => new Response(PNG), { files: memory.files });
    expect(await store.dataUri(PATH)).toBe("data:image/png;base64,a2VwdA==");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("asks once for the same logo while it loads", async () => {
    const { store, fetchFn } = setUp(() => new Response(PNG));
    await Promise.all([store.dataUri(PATH), store.dataUri(PATH)]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("refuses a path that isn't a logo's without any request", async () => {
    const { store, fetchFn } = setUp(() => new Response(PNG));
    await expect(store.dataUri("../secrets.png")).rejects.toBeInstanceOf(LogoError);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("says the logo is missing when Storage can't find it", async () => {
    const { store } = setUp(() => new Response(null, { status: 404 }));
    await expect(store.dataUri(PATH)).rejects.toThrow(/couldn't be found/);
  });

  it("asks to check the connection when offline or without a token", async () => {
    const offline = new LogoStore(
      memoryFiles().files,
      () => Promise.resolve("t"),
      () => Promise.reject(new TypeError("Network request failed")),
    );
    await expect(offline.dataUri(PATH)).rejects.toThrow(/internet connection/);
    const { store, fetchFn } = setUp(() => new Response(PNG), { token: null });
    await expect(store.dataUri(PATH)).rejects.toThrow(/internet connection/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("refuses an empty or oversized download, and keeps nothing", async () => {
    const empty = setUp(() => new Response(new Uint8Array()));
    await expect(empty.store.dataUri(PATH)).rejects.toBeInstanceOf(LogoError);
    const huge = setUp(() => new Response(new Uint8Array(1024 * 1024 + 1)));
    await expect(huge.store.dataUri(PATH)).rejects.toBeInstanceOf(LogoError);
    expect(huge.kept.size).toBe(0);
  });

  it("tries again after a failure", async () => {
    let fail = true;
    const { store } = setUp(() => (fail ? new Response(null, { status: 500 }) : new Response(PNG)));
    await expect(store.dataUri(PATH)).rejects.toThrow(/Try again/);
    fail = false;
    expect(await store.dataUri(PATH)).toBe("data:image/png;base64,iVBORw==");
  });

  it("still returns the logo when keeping a copy fails", async () => {
    const files: LogoFiles = {
      read: () => Promise.resolve(null),
      write: () => Promise.reject(new Error("disk full")),
    };
    const { store } = setUp(() => new Response(PNG), { files });
    expect(await store.dataUri(PATH)).toBe("data:image/png;base64,iVBORw==");
  });
});
