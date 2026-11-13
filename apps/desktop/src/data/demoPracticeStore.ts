import { logoFileError } from "@kineo/shared";
import type { PracticeStore } from "./practiceStore";
import { StoreError, type DemoStore } from "./store";

/** Reads a file as a data URL, e.g. "data:image/png;base64,…". */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new StoreError("That logo couldn't be read. Choose the image again."));
    });
    reader.addEventListener("error", () =>
      reject(new StoreError("That logo couldn't be read. Choose the image again.")),
    );
    reader.readAsDataURL(file);
  });
}

/**
 * The demo store behind the screens' PracticeStore interface, for tests: the same
 * rules, in memory, with logos kept as data URLs. A rule error becomes a rejected
 * promise, as with the local database.
 */
export class DemoPracticeStore implements PracticeStore {
  constructor(readonly demo: DemoStore) {}

  getState: PracticeStore["getState"] = () => this.demo.getState();
  subscribe: PracticeStore["subscribe"] = (listener) => this.demo.subscribe(listener);

  private run<T>(action: () => T): Promise<T> {
    return Promise.resolve().then(action);
  }

  addPatient: PracticeStore["addPatient"] = (input) => this.run(() => this.demo.addPatient(input));
  updatePatient: PracticeStore["updatePatient"] = (patientId, input) =>
    this.run(() => this.demo.updatePatient(patientId, input));
  saveVisit: PracticeStore["saveVisit"] = (patientId, note, visitDate) =>
    this.run(() => this.demo.saveVisit(patientId, note, visitDate));
  setVisitDate: PracticeStore["setVisitDate"] = (visitId, visitDate) =>
    this.run(() => this.demo.setVisitDate(visitId, visitDate));
  deleteVisit: PracticeStore["deleteVisit"] = (visitId) =>
    this.run(() => this.demo.deleteVisit(visitId));
  restoreVisit: PracticeStore["restoreVisit"] = (visit) =>
    this.run(() => this.demo.restoreVisit(visit));
  addToNote: PracticeStore["addToNote"] = (visitId, text) =>
    this.run(() => this.demo.addToNote(visitId, text));
  replaceNote: PracticeStore["replaceNote"] = (visitId, text) =>
    this.run(() => this.demo.replaceNote(visitId, text));

  createInvoice: PracticeStore["createInvoice"] = (patientId, visitIds) =>
    this.run(() => this.demo.createInvoice(patientId, visitIds));
  setVisitOnInvoice: PracticeStore["setVisitOnInvoice"] = (invoiceId, visitId, included) =>
    this.run(() => this.demo.setVisitOnInvoice(invoiceId, visitId, included));
  addLine: PracticeStore["addLine"] = (invoiceId, priceItemId, quantity) =>
    this.run(() => this.demo.addLine(invoiceId, priceItemId, quantity));
  setLineQuantity: PracticeStore["setLineQuantity"] = (lineId, quantity) =>
    this.run(() => this.demo.setLineQuantity(lineId, quantity));
  removeLine: PracticeStore["removeLine"] = (lineId) =>
    this.run(() => this.demo.removeLine(lineId));
  setTax: PracticeStore["setTax"] = (invoiceId, enabled) =>
    this.run(() => this.demo.setTax(invoiceId, enabled));
  sendInvoice: PracticeStore["sendInvoice"] = (invoiceId) =>
    this.run(() => this.demo.sendInvoice(invoiceId));
  recordPayment: PracticeStore["recordPayment"] = (invoiceId) =>
    this.run(() => this.demo.recordPayment(invoiceId));
  undoPayment: PracticeStore["undoPayment"] = (invoiceId) =>
    this.run(() => this.demo.undoPayment(invoiceId));
  cancelInvoice: PracticeStore["cancelInvoice"] = (invoiceId) =>
    this.run(() => this.demo.cancelInvoice(invoiceId));

  saveFundingType: PracticeStore["saveFundingType"] = (input) =>
    this.run(() => this.demo.saveFundingType(input));
  deleteFundingType: PracticeStore["deleteFundingType"] = (id) =>
    this.run(() => this.demo.deleteFundingType(id));
  addPatientFunding: PracticeStore["addPatientFunding"] = (input) =>
    this.run(() => this.demo.addPatientFunding(input));
  updatePatientFunding: PracticeStore["updatePatientFunding"] = (id, input) =>
    this.run(() => this.demo.updatePatientFunding(id, input));
  endPatientFunding: PracticeStore["endPatientFunding"] = (id) =>
    this.run(() => this.demo.endPatientFunding(id));
  undoEndPatientFunding: PracticeStore["undoEndPatientFunding"] = (id) =>
    this.run(() => this.demo.undoEndPatientFunding(id));

  setBillTo: PracticeStore["setBillTo"] = (invoiceId, choice) =>
    this.run(() => this.demo.setBillTo(invoiceId, choice));
  setBillToDetail: PracticeStore["setBillToDetail"] = (invoiceId, detailId, value) =>
    this.run(() => this.demo.setBillToDetail(invoiceId, detailId, value));
  setSelfPayAddress: PracticeStore["setSelfPayAddress"] = (invoiceId, address) =>
    this.run(() => this.demo.setSelfPayAddress(invoiceId, address));
  setLineServiceDate: PracticeStore["setLineServiceDate"] = (lineId, serviceDate) =>
    this.run(() => this.demo.setLineServiceDate(lineId, serviceDate));

  saveProfile: PracticeStore["saveProfile"] = (fields) =>
    this.run(() => this.demo.saveProfile(fields));
  addPriceItem: PracticeStore["addPriceItem"] = (input) =>
    this.run(() => this.demo.addPriceItem(input));
  updatePriceItem: PracticeStore["updatePriceItem"] = (id, input) =>
    this.run(() => this.demo.updatePriceItem(id, input));
  removePriceItem: PracticeStore["removePriceItem"] = (id) =>
    this.run(() => this.demo.removePriceItem(id));
  saveSettings: PracticeStore["saveSettings"] = (input) =>
    this.run(() => this.demo.saveSettings(input));
  saveInvoiceStyle: PracticeStore["saveInvoiceStyle"] = (input) =>
    this.run(() => this.demo.saveInvoiceStyle(input));

  uploadLogo: PracticeStore["uploadLogo"] = async (file) => {
    const problem = logoFileError(file);
    if (problem) throw new StoreError(problem);
    return readAsDataUrl(file);
  };
  logoSrc: PracticeStore["logoSrc"] = (logoPath) => Promise.resolve(logoPath);
  /** In memory there's no server to wait for. */
  isInvoicePending: PracticeStore["isInvoicePending"] = () => false;
}
