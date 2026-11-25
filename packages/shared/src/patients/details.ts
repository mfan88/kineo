import type { InvoicePatientDetail, Patient } from "../types/models";

/** Limits and validation rules for patient contact and custom details, matching the server. */

export const MAX_PARENT_NAMES = 4;
export const MAX_PARENT_NAME_LENGTH = 200;
export const MAX_PATIENT_EMAIL_LENGTH = 254;
export const MAX_PATIENT_PHONE_LENGTH = 40;
export const MAX_PATIENT_CUSTOM_DETAILS = 20;
export const MAX_PATIENT_CUSTOM_DETAIL_LABEL_LENGTH = 80;
export const MAX_PATIENT_CUSTOM_DETAIL_VALUE_LENGTH = 500;
export const PATIENT_EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type PatientDetailsErrorField =
  "fullName" | "parentNames" | "email" | "phone" | "customDetails";

export type PatientDetailsErrors = Partial<Record<PatientDetailsErrorField, string>>;

export interface PatientCustomDetailInput {
  id: string;
  label: string;
  value: string;
  showOnInvoice: boolean;
}

export interface PatientDetailsInput {
  fullName: string;
  isChild?: boolean;
  parentNames?: readonly string[];
  parentNamesOnInvoice?: boolean;
  email?: string;
  emailOnInvoice?: boolean;
  phone?: string;
  phoneOnInvoice?: boolean;
  customDetails?: readonly PatientCustomDetailInput[];
}

export interface NormalisedPatientDetails {
  fullName: string;
  isChild: boolean;
  parentNames: string[];
  parentNamesOnInvoice: boolean;
  email: string;
  emailOnInvoice: boolean;
  phone: string;
  phoneOnInvoice: boolean;
  customDetails: PatientCustomDetailInput[];
}

export type InvoicePatientDetailsSource = Pick<
  Patient,
  | "isChild"
  | "parentNames"
  | "parentNamesOnInvoice"
  | "email"
  | "emailOnInvoice"
  | "phone"
  | "phoneOnInvoice"
  | "customDetails"
>;

/** Trims inputs, drops blank parent entries, and clears parent fields when not a child. */
export function normalisePatientDetails(input: PatientDetailsInput): NormalisedPatientDetails {
  const isChild = Boolean(input.isChild);
  const parentNames = isChild
    ? (input.parentNames ?? []).map((name) => name.trim()).filter((name) => name !== "")
    : [];

  return {
    fullName: input.fullName.trim(),
    isChild,
    parentNames,
    parentNamesOnInvoice: isChild && Boolean(input.parentNamesOnInvoice),
    email: (input.email ?? "").trim(),
    emailOnInvoice: Boolean(input.emailOnInvoice),
    phone: (input.phone ?? "").trim(),
    phoneOnInvoice: Boolean(input.phoneOnInvoice),
    customDetails: (input.customDetails ?? []).map((detail) => ({
      id: detail.id.trim(),
      label: detail.label.trim(),
      value: detail.value.trim(),
      showOnInvoice: detail.showOnInvoice,
    })),
  };
}

/** Problems with a patient's details form; `required` enforces contact and parent fields. */
export function patientDetailsErrors(
  input: PatientDetailsInput,
  options: { required: boolean },
): PatientDetailsErrors {
  const errors: PatientDetailsErrors = {};

  if (input.fullName.trim() === "") {
    errors.fullName = "Add the patient's name.";
  }

  if (options.required && input.isChild) {
    const hasParent = (input.parentNames ?? []).some((name) => name.trim() !== "");
    if (!hasParent) {
      errors.parentNames = "Add a parent's name.";
    }
  }

  const email = (input.email ?? "").trim();
  if (email === "") {
    if (options.required) {
      errors.email = "Add an email so you can reach this patient.";
    }
  } else if (!PATIENT_EMAIL_PATTERN.test(email)) {
    errors.email = "Enter an email like name@example.com.";
  }

  const phone = (input.phone ?? "").trim();
  if (options.required && phone === "") {
    errors.phone = "Add a phone number so you can reach this patient.";
  }

  const customDetails = input.customDetails ?? [];
  const hasBlankDetail = customDetails.some(
    (detail) => detail.label.trim() === "" || detail.value.trim() === "",
  );
  if (hasBlankDetail) {
    errors.customDetails = "Give each detail a label and a value.";
  } else {
    const labels = new Set<string>();
    for (const detail of customDetails) {
      const label = detail.label.trim().toLowerCase();
      if (labels.has(label)) {
        errors.customDetails = "Each detail needs its own label.";
        break;
      }
      labels.add(label);
    }
  }

  return errors;
}

/** Builds the ordered list of shown, non-empty patient details to copy onto an invoice. */
export function invoicePatientDetails(
  patient: InvoicePatientDetailsSource,
): InvoicePatientDetail[] {
  const details: InvoicePatientDetail[] = [];

  if (patient.isChild && patient.parentNamesOnInvoice) {
    const names = patient.parentNames.map((name) => name.trim()).filter((name) => name !== "");
    if (names.length > 0) {
      details.push({
        id: "parents",
        label: names.length === 1 ? "Parent" : "Parents",
        value: names.join(", "),
      });
    }
  }

  const email = patient.email.trim();
  if (patient.emailOnInvoice && email !== "") {
    details.push({ id: "email", label: "Email", value: email });
  }

  const phone = patient.phone.trim();
  if (patient.phoneOnInvoice && phone !== "") {
    details.push({ id: "phone", label: "Phone", value: phone });
  }

  for (const detail of patient.customDetails) {
    if (!detail.showOnInvoice) continue;
    const label = detail.label.trim();
    const value = detail.value.trim();
    if (label !== "" && value !== "") {
      details.push({ id: detail.id, label, value });
    }
  }

  return details;
}
