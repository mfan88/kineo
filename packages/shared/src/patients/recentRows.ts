import { formatLastVisit } from "../dates/display";
import type { Patient, Visit } from "../types/models";
import { lastVisit, recentPatients } from "./lookup";

/** One row of Home's Recent list: the patient and "Last visit 4 Nov". */
export interface RecentRow<P extends Pick<Patient, "id" | "fullName">> {
  patient: P;
  lastVisit: string;
}

/**
 * Home's Recent list: the patients seen most recently, newest first, each with when
 * they were last seen (`today` is YYYY-MM-DD). Patients without visits are left out.
 */
export function recentRows<P extends Pick<Patient, "id" | "fullName">>(
  patients: readonly P[],
  visits: readonly Pick<Visit, "patientId" | "visitDate" | "createdAt">[],
  today: string,
  limit = 5,
): RecentRow<P>[] {
  const rows: RecentRow<P>[] = [];
  for (const patient of recentPatients(patients, visits, limit)) {
    const last = lastVisit(visits, patient.id);
    if (last) rows.push({ patient, lastVisit: formatLastVisit(last.visitDate, today) });
  }
  return rows;
}
