import type { PracticeData, PracticeDataHandlers } from "@kineo/data";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { createDemoState } from "./store";
import { LiveStore, type LogoFunctions } from "./liveStore";

type WriterMethod = (...args: unknown[]) => Promise<unknown>;

const mocks = vi.hoisted(() => {
  const writer: Record<string, Mock<WriterMethod>> = {};
  return {
    handlers: null as PracticeDataHandlers | null,
    stopWatching: vi.fn<() => void>(),
    watchedOwner: "",
    writer,
    notifyError: vi.fn<(message: string) => string>(() => "toast"),
    /** Stands in for PracticeWriter: every method records its call. */
    PracticeWriter: function PracticeWriter(this: void) {
      return new Proxy(
        {},
        {
          get: (_target, name: string) => {
            mocks.writer[name] ??= vi.fn<WriterMethod>(async (...args) => ({ called: name, args }));
            return mocks.writer[name];
          },
        },
      );
    },
  };
});

vi.mock("@kineo/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@kineo/data")>();
  return {
    ...actual,
    watchPracticeData: (_db: unknown, ownerId: string, handlers: PracticeDataHandlers) => {
      mocks.watchedOwner = ownerId;
      mocks.handlers = handlers;
      return mocks.stopWatching;
    },
    PracticeWriter: mocks.PracticeWriter,
  };
});
vi.mock("../components/Toasts", () => ({ notifyError: mocks.notifyError }));

function data(logoPath: string | null = null): PracticeData {
  const state = createDemoState();
  return { ...state, invoiceStyle: { ...state.invoiceStyle, logoPath } };
}

function setup() {
  const logos = {
    upload: vi.fn<LogoFunctions["upload"]>(async () => "user_a/logo-new.png"),
    dataUrl: vi.fn<LogoFunctions["dataUrl"]>(async () => "data:image/png;base64,AA=="),
    remove: vi.fn<LogoFunctions["remove"]>(async () => {}),
  };
  // Never touched: watching and writing are replaced above.
  const db = {
    watchWithCallback: () => {},
    writeTransaction: async <T>(): Promise<T> => {
      throw new Error("not used");
    },
  };
  const store = new LiveStore(db, "user_a", logos);
  return { store, logos };
}

const style = {
  accentColor: "sky" as const,
  font: "clean" as const,
  headerLayout: "logo-left" as const,
  footerNote: "",
};

beforeEach(() => {
  mocks.handlers = null;
  for (const name of Object.keys(mocks.writer)) delete mocks.writer[name];
  mocks.stopWatching.mockClear();
  mocks.notifyError.mockClear();
});

describe("LiveStore", () => {
  it("has no data until the local database has been read, then tells subscribers", () => {
    const { store } = setup();
    const listener = vi.fn<() => void>();
    store.subscribe(listener);
    expect(store.getState()).toBeNull();

    store.start();
    expect(mocks.watchedOwner).toBe("user_a");
    const first = data();
    mocks.handlers?.onData(first);
    expect(store.getState()).toBe(first);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("stops watching", () => {
    const { store } = setup();
    store.start();
    store.stop();
    expect(mocks.stopWatching).toHaveBeenCalled();
  });

  it("hands every change to the rule-checking writer", async () => {
    const { store } = setup();
    await store.addPatient({ fullName: "Sky Example", reasonForVisit: "" });
    await store.saveVisit("p", "note");
    await store.addToNote("v", "more");
    await store.replaceNote("v", "new");
    await store.createInvoice("p", ["v"]);
    await store.setVisitOnInvoice("i", "v", true);
    await store.addLine("i", "item", 2);
    await store.setLineQuantity("l", 3);
    await store.removeLine("l");
    await store.setTax("i", true);
    await store.sendInvoice("i");
    await store.recordPayment("i");
    await store.undoPayment("i");
    await store.addPriceItem({ name: "Treatment", unitPriceCents: 9000 });
    await store.updatePriceItem("item", { name: "Treatment", unitPriceCents: 9500 });
    await store.removePriceItem("item");
    await store.saveSettings({ defaultTaxRateBasisPoints: 500, invoiceNumberPrefix: "" });
    expect(Object.keys(mocks.writer).toSorted()).toEqual(
      [
        "addLine",
        "addPatient",
        "addPriceItem",
        "addToNote",
        "createInvoice",
        "recordPayment",
        "removeLine",
        "removePriceItem",
        "replaceNote",
        "saveSettings",
        "saveVisit",
        "sendInvoice",
        "setLineQuantity",
        "setTax",
        "setVisitOnInvoice",
        "undoPayment",
        "updatePriceItem",
      ].toSorted(),
    );
    expect(mocks.writer.addLine).toHaveBeenCalledWith("i", "item", 2);
  });

  it("deletes the old logo after saving a style with a different one", async () => {
    const { store, logos } = setup();
    store.start();
    mocks.handlers?.onData(data("user_a/logo-old.png"));
    mocks.writer.saveInvoiceStyle = vi.fn<WriterMethod>(async () => ({
      logoPath: "user_a/logo-new.png",
    }));
    await store.saveInvoiceStyle({ ...style, logoPath: "user_a/logo-new.png" });
    expect(logos.remove).toHaveBeenCalledWith("user_a/logo-old.png");
  });

  it("keeps the logo when it hasn't changed, and doesn't fail if deleting fails", async () => {
    const { store, logos } = setup();
    store.start();
    mocks.handlers?.onData(data("user_a/logo-old.png"));
    mocks.writer.saveInvoiceStyle = vi.fn<WriterMethod>(async () => ({
      logoPath: "user_a/logo-old.png",
    }));
    await store.saveInvoiceStyle({ ...style, logoPath: "user_a/logo-old.png" });
    expect(logos.remove).not.toHaveBeenCalled();

    logos.remove.mockRejectedValueOnce(new Error("offline"));
    mocks.writer.saveInvoiceStyle = vi.fn<WriterMethod>(async () => ({ logoPath: null }));
    await expect(store.saveInvoiceStyle({ ...style, logoPath: null })).resolves.toEqual({
      logoPath: null,
    });
  });

  it("uploads logos into the practitioner's folder and reads them back", async () => {
    const { store, logos } = setup();
    const file = new File(["x"], "logo.png", { type: "image/png" });
    expect(await store.uploadLogo(file)).toBe("user_a/logo-new.png");
    expect(logos.upload).toHaveBeenCalledWith("user_a", file);
    expect(await store.logoSrc("user_a/logo-new.png")).toBe("data:image/png;base64,AA==");
    expect(await store.logoSrc(null)).toBeNull();
    expect(logos.dataUrl).toHaveBeenCalledTimes(1);
  });

  it("says once when records can't be shown, without their contents", () => {
    const { store } = setup();
    store.start();
    mocks.handlers?.onError?.(new Error("A row in patients couldn't be read."));
    mocks.handlers?.onError?.(new Error("again"));
    expect(mocks.notifyError).toHaveBeenCalledTimes(1);
    expect(mocks.notifyError.mock.calls[0]?.[0]).toMatch(/^Some of your records couldn't be shown/);
  });
});
