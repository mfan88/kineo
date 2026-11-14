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
    onPending: null as ((ids: ReadonlySet<string>) => void) | null,
    stopWatchingPending: vi.fn<() => void>(),
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
    watchPendingInvoices: (_db: unknown, onChange: (ids: ReadonlySet<string>) => void) => {
      mocks.onPending = onChange;
      return mocks.stopWatchingPending;
    },
  };
});
vi.mock("../components/Toasts", () => ({ notifyError: mocks.notifyError }));

function data(logoPath: string | null = null, footerLogoPath: string | null = null): PracticeData {
  const state = createDemoState();
  return { ...state, invoiceStyle: { ...state.invoiceStyle, logoPath, footerLogoPath } };
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
  footerLogoPath: null,
  showMadeWith: true,
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
    expect(mocks.stopWatchingPending).toHaveBeenCalled();
  });

  it("knows which invoices haven't reached the server, and says when that changes", () => {
    const { store } = setup();
    const listener = vi.fn<() => void>();
    store.subscribe(listener);
    store.start();
    expect(store.isInvoicePending("inv-1")).toBe(false);
    mocks.onPending?.(new Set(["inv-1"]));
    expect(store.isInvoicePending("inv-1")).toBe(true);
    mocks.onPending?.(new Set());
    expect(store.isInvoicePending("inv-1")).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("hands every change to the rule-checking writer", async () => {
    const { store } = setup();
    await store.addPatient({ fullName: "Sky Example", reasonForVisit: "" });
    await store.updatePatient("p", { fullName: "Sky Example", reasonForVisit: "" });
    await store.saveVisit("p", "note");
    await store.setVisitDate("v", "2026-11-10");
    await store.deleteVisit("v");
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
    await store.saveSettings({
      defaultTaxRateBasisPoints: 500,
      invoiceNumberFormat: createDemoState().settings.invoiceNumberFormat,
      invoiceNumberStart: 1,
    });
    expect(Object.keys(mocks.writer).toSorted()).toEqual(
      [
        "addLine",
        "addPatient",
        "addPriceItem",
        "addToNote",
        "deleteVisit",
        "setVisitDate",
        "updatePatient",
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

  it("finishes creating an invoice or patient only once the watched data shows it", async () => {
    const { store } = setup();
    store.start();
    const first = data();
    mocks.handlers?.onData(first);
    const [invoice] = first.invoices;
    const [patient] = first.patients;
    if (!invoice || !patient) throw new Error("demo data has an invoice and a patient");
    const newInvoice = { ...invoice, id: "inv-new" };
    const newPatient = { ...patient, id: "pat-new" };
    mocks.writer.createInvoice = vi.fn<WriterMethod>(async () => newInvoice);
    mocks.writer.addPatient = vi.fn<WriterMethod>(async () => newPatient);

    let created = false;
    const creating = store.createInvoice(patient.id, []).then((result) => {
      created = true;
      return result;
    });
    let added = false;
    const adding = store.addPatient({ fullName: "Sky Example", reasonForVisit: "" }).then(() => {
      added = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(created).toBe(false);
    expect(added).toBe(false);

    mocks.handlers?.onData({ ...first, invoices: [...first.invoices, newInvoice] });
    expect(await creating).toBe(newInvoice);
    expect(added).toBe(false);
    mocks.handlers?.onData({
      ...first,
      invoices: [...first.invoices, newInvoice],
      patients: [...first.patients, newPatient],
    });
    await adding;
    expect(added).toBe(true);
  });

  it("stops waiting for a new invoice after a few seconds", async () => {
    vi.useFakeTimers();
    try {
      const { store } = setup();
      store.start();
      const first = data();
      mocks.handlers?.onData(first);
      mocks.writer.createInvoice = vi.fn<WriterMethod>(async () => ({ id: "inv-never-shown" }));
      const creating = store.createInvoice("p", []);
      await vi.advanceTimersByTimeAsync(3000);
      await expect(creating).resolves.toEqual({ id: "inv-never-shown" });
    } finally {
      vi.useRealTimers();
    }
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

  it("deletes a replaced or removed footer logo the same way", async () => {
    const { store, logos } = setup();
    store.start();
    mocks.handlers?.onData(data("user_a/header.png", "user_a/footer-old.png"));
    mocks.writer.saveInvoiceStyle = vi.fn<WriterMethod>(async () => ({
      logoPath: "user_a/header.png",
      footerLogoPath: "user_a/footer-new.png",
    }));
    await store.saveInvoiceStyle({
      ...style,
      logoPath: "user_a/header.png",
      footerLogoPath: "user_a/footer-new.png",
    });
    expect(logos.remove).toHaveBeenCalledTimes(1);
    expect(logos.remove).toHaveBeenCalledWith("user_a/footer-old.png");

    mocks.handlers?.onData(data("user_a/header.png", "user_a/footer-new.png"));
    mocks.writer.saveInvoiceStyle = vi.fn<WriterMethod>(async () => ({
      logoPath: "user_a/header.png",
      footerLogoPath: null,
    }));
    await store.saveInvoiceStyle({ ...style, logoPath: "user_a/header.png" });
    expect(logos.remove).toHaveBeenLastCalledWith("user_a/footer-new.png");
    expect(logos.remove).toHaveBeenCalledTimes(2);
  });

  it("never deletes a path the other slot still uses", async () => {
    const { store, logos } = setup();
    store.start();
    // The header logo moves to the footer slot, and the header slot is cleared.
    mocks.handlers?.onData(data("user_a/shared.png", null));
    mocks.writer.saveInvoiceStyle = vi.fn<WriterMethod>(async () => ({
      logoPath: null,
      footerLogoPath: "user_a/shared.png",
    }));
    await store.saveInvoiceStyle({
      ...style,
      logoPath: null,
      footerLogoPath: "user_a/shared.png",
    });
    expect(logos.remove).not.toHaveBeenCalled();

    // Both slots held the same file; clearing one keeps it for the other.
    mocks.handlers?.onData(data("user_a/same.png", "user_a/same.png"));
    mocks.writer.saveInvoiceStyle = vi.fn<WriterMethod>(async () => ({
      logoPath: "user_a/same.png",
      footerLogoPath: null,
    }));
    await store.saveInvoiceStyle({ ...style, logoPath: "user_a/same.png" });
    expect(logos.remove).not.toHaveBeenCalled();
  });

  it("passes items through to the writer", async () => {
    const { store } = setup();
    const items = [{ priceItemId: null, name: "Item", unitPriceCents: 100, quantity: 1 }];
    await store.saveVisit("p", "note", "2026-11-01", items);
    expect(mocks.writer.saveVisit).toHaveBeenCalledWith("p", "note", "2026-11-01", items);
    await store.setVisitItems("v", items);
    expect(mocks.writer.setVisitItems).toHaveBeenCalledWith("v", items);
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
