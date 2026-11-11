import type { Invoice, LineItem, Patient, PracticeSettings, Visit } from "@kineo/shared";

/**
 * Made-up demo data for building screens before the database is connected.
 * Matches supabase/seed.sql. Never put real patient information here.
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
  invoiceNumberPrefix: "INV-",
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
