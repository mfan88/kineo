import { formatLastVisit, localDateString } from "../dates/display";
import type { Patient, Visit } from "../types/models";
import { lastVisit } from "./lookup";

type RecentPatient = Pick<Patient, "id" | "fullName" | "createdAt">;

/**
 * One row of Home's Recent list: the patient and the text under their name,
 * "Last visit 4 Nov", or "No visits yet" for a patient added but not yet seen.
 */
export interface RecentRow<P extends RecentPatient> {
  patient: P;
  lastVisit: string;
}

/**
 * Home's Recent list, newest first (`today` is YYYY-MM-DD). A patient is ranked by
 * their last visit date, or, with no visits yet, by the day they were added, so a
 * newly added patient can be found without searching. At most `limit` rows.
 */
export function recentRows<P extends RecentPatient>(
  patients: readonly P[],
  visits: readonly Pick<Visit, "patientId" | "visitDate" | "createdAt">[],
  today: string,
  limit = 5,
): RecentRow<P>[] {
  if (!Number.isInteger(limit) || limit < 0) {
    throw new RangeError("Limit must be a whole number of 0 or more.");
  }
  const ranked = patients.map((patient) => {
    const last = lastVisit(visits, patient.id);
    const addedAt = Date.parse(patient.createdAt);
    return {
      patient,
      day: last ? last.visitDate : localDateString(new Date(addedAt)),
      at: last ? Date.parse(last.createdAt) : addedAt,
      text: last ? formatLastVisit(last.visitDate, today) : "No visits yet",
    };
  });
  return ranked
    .toSorted((a, b) => {
      if (a.day !== b.day) return a.day < b.day ? 1 : -1;
      return (
        a.patient.fullName.localeCompare(b.patient.fullName, "en-CA") ||
        a.patient.id.localeCompare(b.patient.id)
      );
    })
    .slice(0, limit)
    .map(({ patient, text }) => ({ patient, lastVisit: text }));
}
