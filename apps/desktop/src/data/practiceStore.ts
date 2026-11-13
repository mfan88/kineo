import type { PracticeData } from "@kineo/data";
import type {
  AccentColor,
  HeaderLayout,
  Invoice,
  InvoiceFont,
  InvoiceStyle,
  LineItem,
  Patient,
  PracticeSettings,
  PriceItem,
  Profile,
  ProfileFields,
  Visit,
} from "@kineo/shared";

export interface InvoiceStyleInput {
  accentColor: AccentColor;
  font: InvoiceFont;
  headerLayout: HeaderLayout;
  footerNote: string;
  /** What `uploadLogo` returned, or null for no logo. */
  logoPath: string | null;
}

/**
 * What the screens read and change. The app uses the local database (LiveStore);
 * tests use the demo store (DemoPracticeStore). Actions reject with an error whose
 * message is safe to show (see userMessage) when a rule refuses the change.
 */
export interface PracticeStore {
  /** Everything the screens show, or null until it's first been read. */
  getState: () => PracticeData | null;
  subscribe: (listener: () => void) => () => void;

  addPatient(input: { fullName: string; reasonForVisit: string }): Promise<Patient>;
  saveVisit(patientId: string, note: string): Promise<Visit>;
  addToNote(visitId: string, text: string): Promise<Visit>;
  replaceNote(visitId: string, text: string): Promise<Visit>;

  createInvoice(patientId: string, visitIds: readonly string[]): Promise<Invoice>;
  setVisitOnInvoice(invoiceId: string, visitId: string, included: boolean): Promise<void>;
  addLine(invoiceId: string, priceItemId: string, quantity?: number): Promise<LineItem>;
  setLineQuantity(lineId: string, quantity: number): Promise<void>;
  removeLine(lineId: string): Promise<void>;
  setTax(invoiceId: string, enabled: boolean): Promise<void>;
  sendInvoice(invoiceId: string): Promise<Invoice>;
  recordPayment(invoiceId: string): Promise<Invoice>;
  undoPayment(invoiceId: string): Promise<Invoice>;
  cancelInvoice(invoiceId: string): Promise<Invoice>;

  saveProfile(fields: ProfileFields): Promise<Profile>;
  addPriceItem(input: { name: string; unitPriceCents: number }): Promise<PriceItem>;
  updatePriceItem(id: string, input: { name: string; unitPriceCents: number }): Promise<PriceItem>;
  removePriceItem(id: string): Promise<void>;
  saveSettings(input: {
    defaultTaxRateBasisPoints: number;
    invoiceNumberPrefix: string;
  }): Promise<PracticeSettings>;
  saveInvoiceStyle(input: InvoiceStyleInput): Promise<InvoiceStyle>;

  /**
   * Whether a new invoice hasn't reached the server yet. Until it has, the server
   * may still change its number (another device used it), so it can't be sent.
   * Changes are announced through `subscribe`.
   */
  isInvoicePending: (invoiceId: string) => boolean;

  /** Stores a chosen logo image; resolves to the value to save as `logoPath`. */
  uploadLogo(file: File): Promise<string>;
  /** An image source for a saved `logoPath` (null when there's no logo). */
  logoSrc(logoPath: string | null): Promise<string | null>;
}
