import type { FundingDetailKind } from "../types/models";
import type { FundingTypeDraft } from "./rules";

/** Starting points for a new funding type. Nothing is saved until the practitioner saves the type. */

export type FundingPresetKey = "autism-funding" | "cydb" | "icbc" | "blank";

export interface FundingPreset {
  key: FundingPresetKey;
  chipLabel: string;
  name: string;
  recipientName: string;
  recipientAddress: string;
  details: readonly { label: string; kind: FundingDetailKind; showOnInvoice: boolean }[];
  /** A heads-up shown while a type with this name exists, until the given date (YYYY-MM-DD, inclusive). */
  notice: { text: string; until: string } | null;
}

const PROVINCIAL_ADDRESS = "PO Box 9776 STN PROV GOVT\nVictoria BC V8W 9S5";

export const FUNDING_PRESETS: readonly FundingPreset[] = [
  {
    key: "autism-funding",
    chipLabel: "Autism Funding",
    name: "Autism Funding",
    recipientName: "Autism Funding Branch, Ministry of Children and Family Development",
    recipientAddress: PROVINCIAL_ADDRESS,
    details: [{ label: "Billing number", kind: "text", showOnInvoice: true }],
    notice: {
      text: "Autism Funding ends on 31 March 2027. When families move to the Children and Youth Disability Benefit, add that type, then move each patient across. Invoices already sent keep their old details.",
      until: "2027-03-31",
    },
  },
  {
    key: "cydb",
    chipLabel: "Children and Youth Disability Benefit",
    name: "Children and Youth Disability Benefit",
    recipientName: "",
    recipientAddress: PROVINCIAL_ADDRESS,
    details: [{ label: "Authorization number", kind: "text", showOnInvoice: true }],
    notice: null,
  },
  {
    key: "icbc",
    chipLabel: "ICBC",
    name: "ICBC",
    recipientName: "",
    recipientAddress: "",
    details: [{ label: "Claim number", kind: "text", showOnInvoice: true }],
    notice: null,
  },
  {
    key: "blank",
    chipLabel: "Blank type",
    name: "",
    recipientName: "",
    recipientAddress: "",
    details: [],
    notice: null,
  },
];

/** A copy of a preset for the editor, with a new id on each detail. */
export function presetDraft(key: FundingPresetKey, newId: () => string): FundingTypeDraft {
  const preset = FUNDING_PRESETS.find((candidate) => candidate.key === key);
  if (!preset) throw new RangeError(`Unknown funding preset: ${key}`);
  return {
    name: preset.name,
    recipientName: preset.recipientName,
    recipientAddress: preset.recipientAddress,
    details: preset.details.map((detail) => ({ ...detail, id: newId() })),
  };
}
