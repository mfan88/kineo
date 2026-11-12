import { searchPatients, type Patient } from "@kineo/shared";

type ListedPatient = Pick<Patient, "id" | "fullName">;

/**
 * The patients the Patients tab lists: everyone A–Z until something is typed,
 * then only the matches (best first, as on Home).
 */
export function patientList<P extends ListedPatient>(patients: readonly P[], query: string): P[] {
  if (query.trim() === "") {
    return patients.toSorted(
      (a, b) => a.fullName.localeCompare(b.fullName, "en-CA") || a.id.localeCompare(b.id),
    );
  }
  return searchPatients(patients, query);
}
