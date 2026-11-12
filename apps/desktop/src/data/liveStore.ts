import {
  PracticeWriter,
  watchPendingInvoices,
  watchPracticeData,
  type PracticeData,
  type WatchableDatabase,
  type WritableDatabase,
} from "@kineo/data";
import { notifyError } from "../components/Toasts";
import { deleteLogo, logoDataUrl, uploadLogo } from "./logos";
import type { PracticeStore } from "./practiceStore";
import { browserEnvironment } from "./store";

/** The logo functions LiveStore uses, so tests can replace them. */
export interface LogoFunctions {
  upload: (ownerId: string, file: File) => Promise<string>;
  dataUrl: (path: string) => Promise<string>;
  remove: (path: string) => Promise<void>;
}

const storageLogos: LogoFunctions = {
  upload: uploadLogo,
  dataUrl: logoDataUrl,
  remove: deleteLogo,
};

/**
 * The screens' store, backed by the local database: reads are watched (so sync
 * and local writes show straight away), writes go through PracticeWriter's rules,
 * and logos through Storage.
 */
export class LiveStore implements PracticeStore {
  private data: PracticeData | null = null;
  private readonly listeners = new Set<() => void>();
  private stopWatching: (() => void) | null = null;
  private stopWatchingPending: (() => void) | null = null;
  private pendingInvoices: ReadonlySet<string> = new Set();
  private warned = false;
  private readonly writer: PracticeWriter;

  constructor(
    private readonly db: WatchableDatabase & WritableDatabase,
    private readonly ownerId: string,
    private readonly logos: LogoFunctions = storageLogos,
  ) {
    this.writer = new PracticeWriter(db, { ...browserEnvironment, ownerId });
  }

  /** Starts watching the local database. Call once it's open. */
  start(): void {
    this.stopWatching?.();
    this.stopWatching = watchPracticeData(this.db, this.ownerId, {
      onData: (data) => {
        this.data = data;
        this.notify();
      },
      // Once per session, and never the row's contents (they can hold patient details).
      onError: () => {
        if (this.warned) return;
        this.warned = true;
        notifyError(
          "Some of your records couldn't be shown. Restart Kineō; if this keeps happening, contact support.",
        );
      },
    });
    this.stopWatchingPending?.();
    this.stopWatchingPending = watchPendingInvoices(this.db, (ids) => {
      this.pendingInvoices = ids;
      this.notify();
    });
  }

  stop(): void {
    this.stopWatching?.();
    this.stopWatching = null;
    this.stopWatchingPending?.();
    this.stopWatchingPending = null;
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  getState = (): PracticeData | null => this.data;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  addPatient: PracticeStore["addPatient"] = (input) => this.writer.addPatient(input);
  saveVisit: PracticeStore["saveVisit"] = (patientId, note) =>
    this.writer.saveVisit(patientId, note);
  addToNote: PracticeStore["addToNote"] = (visitId, text) => this.writer.addToNote(visitId, text);
  replaceNote: PracticeStore["replaceNote"] = (visitId, text) =>
    this.writer.replaceNote(visitId, text);

  createInvoice: PracticeStore["createInvoice"] = (patientId, visitIds) =>
    this.writer.createInvoice(patientId, visitIds);
  setVisitOnInvoice: PracticeStore["setVisitOnInvoice"] = (invoiceId, visitId, included) =>
    this.writer.setVisitOnInvoice(invoiceId, visitId, included);
  addLine: PracticeStore["addLine"] = (invoiceId, priceItemId, quantity) =>
    this.writer.addLine(invoiceId, priceItemId, quantity);
  setLineQuantity: PracticeStore["setLineQuantity"] = (lineId, quantity) =>
    this.writer.setLineQuantity(lineId, quantity);
  removeLine: PracticeStore["removeLine"] = (lineId) => this.writer.removeLine(lineId);
  setTax: PracticeStore["setTax"] = (invoiceId, enabled) => this.writer.setTax(invoiceId, enabled);
  sendInvoice: PracticeStore["sendInvoice"] = (invoiceId) => this.writer.sendInvoice(invoiceId);
  recordPayment: PracticeStore["recordPayment"] = (invoiceId) =>
    this.writer.recordPayment(invoiceId);
  undoPayment: PracticeStore["undoPayment"] = (invoiceId) => this.writer.undoPayment(invoiceId);

  saveProfile: PracticeStore["saveProfile"] = (fields) => this.writer.saveProfile(fields);
  addPriceItem: PracticeStore["addPriceItem"] = (input) => this.writer.addPriceItem(input);
  updatePriceItem: PracticeStore["updatePriceItem"] = (id, input) =>
    this.writer.updatePriceItem(id, input);
  removePriceItem: PracticeStore["removePriceItem"] = (id) => this.writer.removePriceItem(id);
  saveSettings: PracticeStore["saveSettings"] = (input) => this.writer.saveSettings(input);

  /** Saves the style; a logo it no longer uses is deleted from Storage afterwards. */
  saveInvoiceStyle: PracticeStore["saveInvoiceStyle"] = async (input) => {
    const previous = this.data?.invoiceStyle.logoPath ?? null;
    const saved = await this.writer.saveInvoiceStyle(input);
    if (previous !== null && previous !== saved.logoPath) {
      // Best effort: a leftover file only takes space in the practitioner's own folder.
      await this.logos.remove(previous).catch(() => {});
    }
    return saved;
  };

  isInvoicePending: PracticeStore["isInvoicePending"] = (invoiceId) =>
    this.pendingInvoices.has(invoiceId);

  uploadLogo: PracticeStore["uploadLogo"] = (file) => this.logos.upload(this.ownerId, file);
  logoSrc: PracticeStore["logoSrc"] = async (logoPath) =>
    logoPath === null ? null : this.logos.dataUrl(logoPath);
}
