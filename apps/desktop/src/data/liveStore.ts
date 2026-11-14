import {
  PracticeWriter,
  watchPendingInvoices,
  watchPracticeData,
  type PracticeData,
  type WatchableDatabase,
  type WritableDatabase,
} from "@kineo/data";
import { FEEDBACK_EMAIL } from "@kineo/shared";
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

/** How long a create waits for the watched data to show the new record. */
const SHOWN_WAIT_MS = 3000;

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
          `Some of your records couldn't be shown. Restart Kineō; if this keeps happening, email ${FEEDBACK_EMAIL}.`,
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

  /**
   * Resolves once the watched data includes the record `isShown` looks for, so a
   * screen opened right after creating it finds it instead of treating it as missing.
   * The watch catches up a moment after the write; if it doesn't within `SHOWN_WAIT_MS`
   * (or isn't running), this resolves anyway.
   */
  private whenShown(isShown: (data: PracticeData) => boolean): Promise<void> {
    const shown = () => this.data !== null && isShown(this.data);
    if (this.stopWatching === null || shown()) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        unsubscribe();
        resolve();
      };
      const timer = setTimeout(done, SHOWN_WAIT_MS);
      const unsubscribe = this.subscribe(() => {
        if (shown()) done();
      });
    });
  }

  addPatient: PracticeStore["addPatient"] = async (input) => {
    const patient = await this.writer.addPatient(input);
    await this.whenShown((data) => data.patients.some((shown) => shown.id === patient.id));
    return patient;
  };
  updatePatient: PracticeStore["updatePatient"] = (patientId, input) =>
    this.writer.updatePatient(patientId, input);
  saveVisit: PracticeStore["saveVisit"] = (patientId, note, visitDate, items) =>
    this.writer.saveVisit(patientId, note, visitDate, items);
  setVisitItems: PracticeStore["setVisitItems"] = (visitId, items) =>
    this.writer.setVisitItems(visitId, items);
  setVisitDate: PracticeStore["setVisitDate"] = (visitId, visitDate) =>
    this.writer.setVisitDate(visitId, visitDate);
  deleteVisit: PracticeStore["deleteVisit"] = (visitId) => this.writer.deleteVisit(visitId);
  restoreVisit: PracticeStore["restoreVisit"] = (visit) => this.writer.restoreVisit(visit);
  addToNote: PracticeStore["addToNote"] = (visitId, text) => this.writer.addToNote(visitId, text);
  replaceNote: PracticeStore["replaceNote"] = (visitId, text) =>
    this.writer.replaceNote(visitId, text);

  createInvoice: PracticeStore["createInvoice"] = async (patientId, visitIds) => {
    const invoice = await this.writer.createInvoice(patientId, visitIds);
    await this.whenShown((data) => data.invoices.some((shown) => shown.id === invoice.id));
    return invoice;
  };
  deleteDraftInvoice: PracticeStore["deleteDraftInvoice"] = (invoiceId) =>
    this.writer.deleteDraftInvoice(invoiceId);
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
  cancelInvoice: PracticeStore["cancelInvoice"] = (invoiceId) =>
    this.writer.cancelInvoice(invoiceId);

  saveFundingType: PracticeStore["saveFundingType"] = (input) => this.writer.saveFundingType(input);
  deleteFundingType: PracticeStore["deleteFundingType"] = (id) => this.writer.deleteFundingType(id);
  addPatientFunding: PracticeStore["addPatientFunding"] = (input) =>
    this.writer.addPatientFunding(input);
  updatePatientFunding: PracticeStore["updatePatientFunding"] = (id, input) =>
    this.writer.updatePatientFunding(id, input);
  endPatientFunding: PracticeStore["endPatientFunding"] = (id) => this.writer.endPatientFunding(id);
  undoEndPatientFunding: PracticeStore["undoEndPatientFunding"] = (id) =>
    this.writer.undoEndPatientFunding(id);

  setBillTo: PracticeStore["setBillTo"] = (invoiceId, choice) =>
    this.writer.setBillTo(invoiceId, choice);
  setBillToDetail: PracticeStore["setBillToDetail"] = (invoiceId, detailId, value) =>
    this.writer.setBillToDetail(invoiceId, detailId, value);
  setSelfPayAddress: PracticeStore["setSelfPayAddress"] = (invoiceId, address) =>
    this.writer.setSelfPayAddress(invoiceId, address);
  setLineServiceDate: PracticeStore["setLineServiceDate"] = (lineId, serviceDate) =>
    this.writer.setLineServiceDate(lineId, serviceDate);

  saveProfile: PracticeStore["saveProfile"] = (fields) => this.writer.saveProfile(fields);
  addPriceItem: PracticeStore["addPriceItem"] = (input) => this.writer.addPriceItem(input);
  updatePriceItem: PracticeStore["updatePriceItem"] = (id, input) =>
    this.writer.updatePriceItem(id, input);
  removePriceItem: PracticeStore["removePriceItem"] = (id) => this.writer.removePriceItem(id);
  restorePriceItem: PracticeStore["restorePriceItem"] = (item) =>
    this.writer.restorePriceItem(item);
  saveSettings: PracticeStore["saveSettings"] = (input) => this.writer.saveSettings(input);

  /**
   * Saves the style; a header or footer logo it no longer uses is deleted from Storage
   * afterwards. A path the other slot still uses is kept.
   */
  saveInvoiceStyle: PracticeStore["saveInvoiceStyle"] = async (input) => {
    const style = this.data?.invoiceStyle;
    const previous = [style?.logoPath ?? null, style?.footerLogoPath ?? null];
    const saved = await this.writer.saveInvoiceStyle(input);
    const inUse = [saved.logoPath, saved.footerLogoPath];
    const unused = new Set<string>();
    for (const path of previous) {
      if (path !== null && !inUse.includes(path)) unused.add(path);
    }
    for (const path of unused) {
      // Best effort: a leftover file only takes space in the practitioner's own folder.
      await this.logos.remove(path).catch(() => {});
    }
    return saved;
  };

  isInvoicePending: PracticeStore["isInvoicePending"] = (invoiceId) =>
    this.pendingInvoices.has(invoiceId);

  uploadLogo: PracticeStore["uploadLogo"] = (file) => this.logos.upload(this.ownerId, file);
  logoSrc: PracticeStore["logoSrc"] = async (logoPath) =>
    logoPath === null ? null : this.logos.dataUrl(logoPath);
}
