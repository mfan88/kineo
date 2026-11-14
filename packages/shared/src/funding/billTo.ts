import { formatDayMonth, formatDayMonthYear } from "../dates/display";
import type {
  FundingType,
  Invoice,
  InvoiceBillTo,
  LineItem,
  Patient,
  PatientFunding,
} from "../types/models";
import { activeFundingsFor, sentenceLabel } from "./rules";

/**
 * Who an invoice is addressed to. The invoice keeps its own copy (`billTo`), made when it is
 * created and refreshed while it is a draft; once sent it is locked.
 */

type PatientBilling = Pick<Patient, "fullName" | "billingAddress">;
type DatedLine = Pick<LineItem, "id" | "position" | "serviceDate">;

function selfPay(patient: PatientBilling): InvoiceBillTo {
  return { kind: "patient", name: patient.fullName, address: patient.billingAddress ?? "" };
}

function shownDetails(type: FundingType, funding: PatientFunding) {
  return type.details
    .filter((detail) => detail.showOnInvoice)
    .map((detail) => ({
      id: detail.id,
      label: detail.label,
      value: funding.detailValues[detail.id] ?? "",
    }));
}

/** The Bill to for a patient's funding, or self-pay when there is none. */
export function billToFor({
  patient,
  funding,
  type,
}: {
  patient: PatientBilling;
  funding: PatientFunding | null;
  type: FundingType | null;
}): InvoiceBillTo {
  if (funding === null || type === null) return selfPay(patient);
  return {
    kind: "funding",
    patientFundingId: funding.id,
    fundingName: type.name,
    name: type.recipientName,
    address: type.recipientAddress,
    details: shownDetails(type, funding),
  };
}

/** What a new invoice bills: the patient's newest active funding, else self-pay. */
export function defaultBillTo({
  patient,
  fundings,
  types,
  today,
}: {
  patient: PatientBilling & Pick<Patient, "id">;
  fundings: readonly PatientFunding[];
  types: readonly FundingType[];
  today: string;
}): InvoiceBillTo {
  for (const funding of activeFundingsFor(patient.id, fundings, today)) {
    const type = types.find((candidate) => candidate.id === funding.fundingTypeId);
    if (type) return billToFor({ patient, funding, type });
  }
  return selfPay(patient);
}

/** An invoice's Bill to, falling back to the patient for older invoices that have none (or no name). */
export function resolvedBillTo(
  invoice: Pick<Invoice, "billTo">,
  patient: PatientBilling | null,
): InvoiceBillTo {
  const { billTo } = invoice;
  if (billTo !== undefined && !(billTo.kind === "patient" && billTo.name.trim() === "")) {
    return billTo;
  }
  return selfPay(patient ?? { fullName: "Unknown patient", billingAddress: "" });
}

/**
 * A draft's Bill to after its type or funding was saved: name, address and funding name
 * come from the type; each shown detail takes the funding's value, keeping the invoice's
 * own value when the funding's is blank.
 */
export function refreshDraftBillTo(
  current: InvoiceBillTo,
  type: FundingType,
  funding: PatientFunding,
): InvoiceBillTo {
  const kept = current.kind === "funding" ? current.details : [];
  const details = type.details
    .filter((detail) => detail.showOnInvoice)
    .map((detail) => {
      const fresh = funding.detailValues[detail.id] ?? "";
      const value =
        fresh.trim() !== "" ? fresh : (kept.find((item) => item.id === detail.id)?.value ?? "");
      return { id: detail.id, label: detail.label, value };
    });
  return {
    kind: "funding",
    patientFundingId: funding.id,
    fundingName: type.name,
    name: type.recipientName,
    address: type.recipientAddress,
    details,
  };
}

export interface BillToOption {
  /** The funding's id, or "patient". */
  key: string;
  title: string;
  detail: string;
  selected: boolean;
}

/** The choices in Change: each active funding (newest first), then self-pay. */
export function billToOptions({
  patient,
  fundings,
  types,
  today,
  current,
}: {
  patient: Pick<Patient, "id" | "fullName">;
  fundings: readonly PatientFunding[];
  types: readonly FundingType[];
  today: string;
  current: InvoiceBillTo;
}): BillToOption[] {
  const options: BillToOption[] = [];
  for (const funding of activeFundingsFor(patient.id, fundings, today)) {
    const type = types.find((candidate) => candidate.id === funding.fundingTypeId);
    if (!type) continue;
    const first = shownDetails(type, funding).find((detail) => detail.value.trim() !== "");
    const parts: string[] = [];
    if (first) parts.push(`${first.label} ${first.value.trim()}`);
    if (funding.periodEnd !== null) parts.push(`to ${formatDayMonthYear(funding.periodEnd)}`);
    options.push({
      key: funding.id,
      title: type.name,
      detail: parts.join(" · "),
      selected: current.kind === "funding" && current.patientFundingId === funding.id,
    });
  }
  options.push({
    key: "patient",
    title: "Self-pay",
    detail: patient.fullName,
    selected: current.kind === "patient",
  });
  return options;
}

/** "Bill for Maya Okafor · Billing number 4821" for a funded invoice; "" for self-pay. */
export function billToSummary(billTo: InvoiceBillTo, patientName: string): string {
  if (billTo.kind !== "funding") return "";
  const shown = billTo.details
    .filter((detail) => detail.value.trim() !== "")
    .map((detail) => ` · ${detail.label} ${detail.value.trim()}`);
  return `Bill for ${patientName}${shown.join("")}`;
}

/** The field on the invoice a problem is about, so the screen can take the person to it. */
export type BillToTarget =
  | { kind: "recipient" }
  | { kind: "detail"; detailId: string }
  | { kind: "lineDate"; lineId: string }
  | { kind: "patientName" };

export interface BillToProblem {
  message: string;
  target: BillToTarget;
}

/** Why a draft's Bill to blocks sending. Same checks, order and words as the server's. */
export function billToProblems({
  billTo,
  lines,
  visitDates,
}: {
  billTo: InvoiceBillTo;
  lines: readonly DatedLine[];
  visitDates: readonly string[];
}): BillToProblem[] {
  const problems: BillToProblem[] = [];
  if (billTo.kind === "patient") {
    if (billTo.name.trim() === "") {
      problems.push({
        message: "Add the patient's name before sending.",
        target: { kind: "patientName" },
      });
    }
    return problems;
  }

  const noName = billTo.name.trim() === "";
  const noAddress = billTo.address.trim() === "";
  const target: BillToTarget = { kind: "recipient" };
  if (noName && noAddress) {
    problems.push({
      message: `${billTo.fundingName} has no recipient name or address. Add them in Settings, then send.`,
      target,
    });
  } else if (noName) {
    problems.push({
      message: `${billTo.fundingName} has no recipient name. Add it in Settings, then send.`,
      target,
    });
  } else if (noAddress) {
    problems.push({
      message: `${billTo.fundingName} has no recipient address. Add it in Settings, then send.`,
      target,
    });
  }
  for (const detail of billTo.details) {
    if (detail.value.trim() === "") {
      problems.push({
        message: `Add the ${sentenceLabel(detail.label)} before sending.`,
        target: { kind: "detail", detailId: detail.id },
      });
    }
  }
  const dates = new Set(visitDates);
  const badLine = lines
    .toSorted((a, b) => a.position - b.position)
    .find((line) => !line.serviceDate || !dates.has(line.serviceDate));
  if (badLine) {
    problems.push({
      message: "Pick a visit date for each line item before sending.",
      target: { kind: "lineDate", lineId: badLine.id },
    });
  }
  return problems;
}

/** The dates a line being added should get: one per visit date on a funded invoice, else a single undated line. */
export function serviceDatesForNewLine(
  billTo: InvoiceBillTo,
  visitDates: readonly string[],
): (string | null)[] {
  if (billTo.kind !== "funding" || visitDates.length === 0) return [null];
  return [...new Set(visitDates)].toSorted();
}

/** Undated lines that can be dated automatically because the invoice has exactly one visit date. */
export function linesToAutoDate(
  lines: readonly DatedLine[],
  visitDates: readonly string[],
): string[] {
  const unique = new Set(visitDates);
  if (unique.size !== 1) return [];
  return lines.filter((line) => !line.serviceDate).map((line) => line.id);
}

/** Lines whose date was just taken off the invoice along with its visit. */
export function linesLosingDate(
  lines: readonly DatedLine[],
  removedDate: string,
  remainingVisitDates: readonly string[],
): string[] {
  if (remainingVisitDates.includes(removedDate)) return [];
  return lines.filter((line) => line.serviceDate === removedDate).map((line) => line.id);
}

/** "4 Nov", or "Pick a date" when the line has none. */
export function lineDateLabel(serviceDate: string | null | undefined): string {
  return serviceDate ? formatDayMonth(serviceDate) : "Pick a date";
}
