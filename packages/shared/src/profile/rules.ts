import type { Profile, ProfileField } from "../types/models";

/**
 * Profile rules. Each profile field has a "Show on invoice" flag, and a field
 * shown on invoices must have a value. Hidden fields may be empty.
 */

/** The profile fields, in the order they appear on screen and on invoices. */
export const PROFILE_FIELD_KEYS = ["fullName", "title", "clinicName", "address", "phone"] as const;

export type ProfileFieldKey = (typeof PROFILE_FIELD_KEYS)[number];

export const PROFILE_FIELD_LABELS: Record<ProfileFieldKey, string> = {
  fullName: "Full name",
  title: "Title or certification",
  clinicName: "Clinic name",
  address: "Address",
  phone: "Phone",
};

export type ProfileFields = Pick<Profile, ProfileFieldKey>;

/** An inline error for one field, ready to show under it. */
export interface ProfileFieldError {
  field: ProfileFieldKey;
  message: string;
}

function isBlank(field: ProfileField): boolean {
  return field.value.trim() === "";
}

/**
 * Errors for fields that are shown on invoices but empty, in screen order.
 * An empty list means the profile can be saved.
 */
export function profileErrors(profile: ProfileFields): ProfileFieldError[] {
  return PROFILE_FIELD_KEYS.filter(
    (key) => profile[key].showOnInvoice && isBlank(profile[key]),
  ).map((field) => ({
    field,
    message: `Add your ${PROFILE_FIELD_LABELS[field].toLowerCase()} or turn off "Show on invoice".`,
  }));
}

/** Whether every field shown on invoices has a value. */
export function isProfileComplete(profile: ProfileFields): boolean {
  return profileErrors(profile).length === 0;
}

/** The fields to print on an invoice, in order, with trimmed values. */
export function invoiceProfileLines(
  profile: ProfileFields,
): { field: ProfileFieldKey; value: string }[] {
  return PROFILE_FIELD_KEYS.filter(
    (key) => profile[key].showOnInvoice && !isBlank(profile[key]),
  ).map((field) => ({ field, value: profile[field].value.trim() }));
}
