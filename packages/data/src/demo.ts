import { DEFAULT_INVOICE_NUMBER_FORMAT } from "@kineo/shared";
import type {
  FundingType,
  Invoice,
  InvoiceStyle,
  LineItem,
  Patient,
  PatientFunding,
  PracticeSettings,
  PriceItem,
  Profile,
  Visit,
  VisitItem,
} from "@kineo/shared";

import type { PracticeData } from "./practiceData";

/**
 * A made-up demo practice, shared by both apps' demo screens and tests
 * (`@kineo/data/demo`). Matches supabase/seed.sql. Never put real patient
 * information here.
 */

const owner = "user_seed_demo";

const morgan = "5eed0000-0000-4000-8000-000000000201";
const casey = "5eed0000-0000-4000-8000-000000000202";
const jordan = "5eed0000-0000-4000-8000-000000000203";
const riley = "5eed0000-0000-4000-8000-000000000204";
const paidInvoice = "5eed0000-0000-4000-8000-000000000301";
const sentInvoice = "5eed0000-0000-4000-8000-000000000302";
const draftInvoice = "5eed0000-0000-4000-8000-000000000303";

export const demoSettings: PracticeSettings = {
  ownerId: owner,
  defaultTaxRateBasisPoints: 500,
  invoiceNumberFormat: { ...DEFAULT_INVOICE_NUMBER_FORMAT, prefix: "INV" },
  invoiceNumberStart: 1,
  updatedAt: "2026-10-01T16:00:00Z",
};

export const demoPatients: Patient[] = [
  {
    id: morgan,
    ownerId: owner,
    fullName: "Morgan Testcase",
    reasonForVisit: "Lower back pain",
    createdAt: "2026-10-01T16:00:00Z",
    updatedAt: "2026-10-01T16:00:00Z",
  },
  {
    id: casey,
    ownerId: owner,
    fullName: "Casey Fictional",
    reasonForVisit: "Ankle sprain",
    createdAt: "2026-10-20T17:00:00Z",
    updatedAt: "2026-10-20T17:00:00Z",
  },
  {
    id: jordan,
    ownerId: owner,
    fullName: "Jordan Sample",
    reasonForVisit: "Shoulder rehab",
    createdAt: "2026-10-28T18:00:00Z",
    updatedAt: "2026-10-28T18:00:00Z",
  },
  {
    id: riley,
    ownerId: owner,
    fullName: "Riley Placeholder",
    reasonForVisit: null,
    createdAt: "2026-11-06T19:00:00Z",
    updatedAt: "2026-11-06T19:00:00Z",
  },
];

export const demoInvoices: Invoice[] = [
  {
    id: paidInvoice,
    ownerId: owner,
    patientId: morgan,
    number: 1,
    status: "paid",
    taxEnabled: false,
    taxRateBasisPoints: 0,
    sentAt: "2026-10-08T22:05:00Z",
    paidAt: "2026-10-12T15:00:00Z",
    cancelledAt: null,
    cancelledVisitDates: null,
    createdAt: "2026-10-08T22:00:00Z",
    updatedAt: "2026-10-12T15:00:00Z",
  },
  {
    id: sentInvoice,
    ownerId: owner,
    patientId: morgan,
    number: 2,
    status: "sent",
    taxEnabled: true,
    taxRateBasisPoints: 500,
    sentAt: "2026-10-22T22:05:00Z",
    paidAt: null,
    cancelledAt: null,
    cancelledVisitDates: null,
    createdAt: "2026-10-22T22:00:00Z",
    updatedAt: "2026-10-22T22:05:00Z",
  },
  {
    id: draftInvoice,
    ownerId: owner,
    patientId: casey,
    number: 3,
    status: "draft",
    taxEnabled: false,
    taxRateBasisPoints: 0,
    sentAt: null,
    paidAt: null,
    cancelledAt: null,
    cancelledVisitDates: null,
    createdAt: "2026-11-03T22:00:00Z",
    updatedAt: "2026-11-03T22:00:00Z",
  },
];

function visit(
  id: string,
  patientId: string,
  visitDate: string,
  note: string,
  invoiceId: string | null,
): Visit {
  const time = `${visitDate}T18:00:00Z`;
  return {
    id,
    ownerId: owner,
    patientId,
    visitDate,
    note,
    noteEditedAt: time,
    invoiceId,
    createdAt: time,
    updatedAt: time,
  };
}

export const demoVisits: Visit[] = [
  visit("5eed0000-0000-4000-8000-000000000401", morgan, "2026-10-01", "Made-up note.", paidInvoice),
  visit("5eed0000-0000-4000-8000-000000000402", morgan, "2026-10-15", "Made-up note.", sentInvoice),
  visit("5eed0000-0000-4000-8000-000000000403", morgan, "2026-10-22", "Made-up note.", sentInvoice),
  visit("5eed0000-0000-4000-8000-000000000404", casey, "2026-11-03", "Made-up note.", draftInvoice),
  visit("5eed0000-0000-4000-8000-000000000405", jordan, "2026-10-28", "Made-up note.", null),
  visit("5eed0000-0000-4000-8000-000000000406", jordan, "2026-11-04", "Made-up note.", null),
  visit("5eed0000-0000-4000-8000-000000000407", riley, "2026-11-06", "", null),
];

function visitItem(
  id: string,
  visitId: string,
  priceItemId: string,
  name: string,
  unitPriceCents: number,
  quantity: number,
  position: number,
): VisitItem {
  return {
    id,
    ownerId: owner,
    visitId,
    priceItemId,
    name,
    unitPriceCents,
    quantity,
    position,
    createdAt: "2026-10-28T18:00:00Z",
  };
}

// Two items on an uninvoiced visit, so the items line and Edit items have something to show.
export const demoVisitItems: VisitItem[] = [
  visitItem(
    "5eed0000-0000-4000-8000-000000000451",
    "5eed0000-0000-4000-8000-000000000405",
    "5eed0000-0000-4000-8000-000000000101",
    "Initial assessment",
    12000,
    1,
    0,
  ),
  visitItem(
    "5eed0000-0000-4000-8000-000000000452",
    "5eed0000-0000-4000-8000-000000000405",
    "5eed0000-0000-4000-8000-000000000102",
    "Follow-up treatment",
    9500,
    2,
    1,
  ),
];

function line(
  id: string,
  invoiceId: string,
  name: string,
  unitPriceCents: number,
  quantity: number,
  position: number,
): LineItem {
  return {
    id,
    ownerId: owner,
    invoiceId,
    priceItemId: null,
    name,
    unitPriceCents,
    quantity,
    position,
  };
}

export const demoLineItems: LineItem[] = [
  line("5eed0000-0000-4000-8000-000000000501", paidInvoice, "Initial assessment", 12000, 1, 0),
  line("5eed0000-0000-4000-8000-000000000502", sentInvoice, "Follow-up treatment", 9500, 2, 0),
  line("5eed0000-0000-4000-8000-000000000503", sentInvoice, "Exercise band", 1500, 1, 1),
  line("5eed0000-0000-4000-8000-000000000504", draftInvoice, "Initial assessment", 12000, 1, 0),
];

export const demoPriceItems: PriceItem[] = [
  {
    id: "5eed0000-0000-4000-8000-000000000101",
    ownerId: owner,
    name: "Initial assessment",
    unitPriceCents: 12000,
    createdAt: "2026-10-01T16:00:00Z",
    updatedAt: "2026-10-01T16:00:00Z",
  },
  {
    id: "5eed0000-0000-4000-8000-000000000102",
    ownerId: owner,
    name: "Follow-up treatment",
    unitPriceCents: 9500,
    createdAt: "2026-10-01T16:00:00Z",
    updatedAt: "2026-10-01T16:00:00Z",
  },
  {
    id: "5eed0000-0000-4000-8000-000000000103",
    ownerId: owner,
    name: "Exercise band",
    unitPriceCents: 1500,
    createdAt: "2026-10-01T16:00:00Z",
    updatedAt: "2026-10-01T16:00:00Z",
  },
];

export const demoProfile: Profile = {
  ownerId: owner,
  fullName: { value: "Alex Example", showOnInvoice: true },
  title: { value: "Registered Physiotherapist", showOnInvoice: true },
  clinicName: { value: "Example Physiotherapy", showOnInvoice: true },
  address: { value: "100 Sample Street, Vancouver BC V5K 0A1", showOnInvoice: true },
  phone: { value: "604-555-0100", showOnInvoice: false },
  updatedAt: "2026-10-01T16:00:00Z",
};

export const demoInvoiceStyle: InvoiceStyle = {
  ownerId: owner,
  logoPath: null,
  footerLogoPath: null,
  accentColor: "sky",
  font: "clean",
  headerLayout: "logo-left",
  footerNote: "Thank you. Please keep this receipt for your insurance claim.",
  showMadeWith: true,
  updatedAt: "2026-10-01T16:00:00Z",
};

const autismType = "5eed0000-0000-4000-8000-000000000701";
const autismBillingNumber = "5eed0000-0000-4000-8000-000000000702";
const icbcType = "5eed0000-0000-4000-8000-000000000703";
const icbcClaimNumber = "5eed0000-0000-4000-8000-000000000704";

export const demoFundingTypes: FundingType[] = [
  {
    id: autismType,
    ownerId: owner,
    name: "Autism Funding",
    recipientName: "Autism Funding Branch, Ministry of Children and Family Development",
    recipientAddress: "PO Box 9776 STN PROV GOVT\nVictoria BC V8W 9S5",
    details: [
      { id: autismBillingNumber, label: "Billing number", kind: "text", showOnInvoice: true },
    ],
    createdAt: "2026-10-20T17:00:00Z",
    updatedAt: "2026-10-20T17:00:00Z",
  },
  {
    id: icbcType,
    ownerId: owner,
    name: "ICBC",
    recipientName: "",
    recipientAddress: "",
    details: [{ id: icbcClaimNumber, label: "Claim number", kind: "text", showOnInvoice: true }],
    createdAt: "2026-10-20T17:00:00Z",
    updatedAt: "2026-10-20T17:00:00Z",
  },
];

export const demoPatientFundings: PatientFunding[] = [
  {
    id: "5eed0000-0000-4000-8000-000000000801",
    ownerId: owner,
    patientId: casey,
    fundingTypeId: autismType,
    detailValues: { [autismBillingNumber]: "4821" },
    periodStart: "2026-04-01",
    periodEnd: "2027-03-31",
    endedOn: null,
    createdAt: "2026-10-20T17:30:00Z",
    updatedAt: "2026-10-20T17:30:00Z",
  },
];

/**
 * The whole demo practice, as fresh copies, so changing one never touches another.
 * Copied through JSON (the data is plain JSON), which works in every app's JavaScript
 * engine; React Native's Hermes has no structuredClone.
 */
export function createDemoPractice(): PracticeData {
  return jsonCopy({
    patients: demoPatients,
    visits: demoVisits,
    visitItems: demoVisitItems,
    invoices: demoInvoices,
    lineItems: demoLineItems,
    priceItems: demoPriceItems,
    profile: demoProfile,
    settings: demoSettings,
    invoiceStyle: demoInvoiceStyle,
    fundingTypes: demoFundingTypes,
    patientFundings: demoPatientFundings,
  });
}

function jsonCopy<T>(value: T): T {
  // The demo records are plain JSON, so the copy has the same shape.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return JSON.parse(JSON.stringify(value)) as T;
}
