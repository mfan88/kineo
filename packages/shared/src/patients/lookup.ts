import type { Patient, Visit } from "../types/models";

type NamedPatient = Pick<Patient, "id" | "fullName">;

/** Lower-cases and strips accents so "José" matches "jose". */
function normalise(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Patients whose name matches the search, for "Who are you seeing?". Every word
 * typed must start a word in the name ("al ex" matches "Alex Example"), ignoring
 * case and accents. Names that start with the search come first, then A–Z.
 * An empty search returns no patients.
 */
export function searchPatients<P extends NamedPatient>(patients: readonly P[], query: string): P[] {
  const terms = normalise(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const matches = patients.filter((patient) => {
    const words = normalise(patient.fullName).split(/\s+/);
    return terms.every((term) => words.some((word) => word.startsWith(term)));
  });

  const first = terms[0] ?? "";
  return matches.toSorted((a, b) => {
    const aStarts = normalise(a.fullName).startsWith(first) ? 0 : 1;
    const bStarts = normalise(b.fullName).startsWith(first) ? 0 : 1;
    return (
      aStarts - bStarts || a.fullName.localeCompare(b.fullName, "en-CA") || a.id.localeCompare(b.id)
    );
  });
}

/**
 * The patients seen most recently, newest first, for the recent patient chips.
 * Patients without visits are left out. At most `limit` patients (default 5).
 */
export function recentPatients<P extends NamedPatient>(
  patients: readonly P[],
  visits: readonly Pick<Visit, "patientId" | "visitDate">[],
  limit = 5,
): P[] {
  if (!Number.isInteger(limit) || limit < 0) {
    throw new RangeError("Limit must be a whole number of 0 or more.");
  }
  const latestDate = new Map<string, string>();
  for (const visit of visits) {
    const seen = latestDate.get(visit.patientId);
    if (seen === undefined || visit.visitDate > seen) {
      latestDate.set(visit.patientId, visit.visitDate);
    }
  }
  return patients
    .filter((patient) => latestDate.has(patient.id))
    .toSorted((a, b) => {
      const aDate = latestDate.get(a.id) ?? "";
      const bDate = latestDate.get(b.id) ?? "";
      if (aDate !== bDate) return aDate < bDate ? 1 : -1;
      return a.fullName.localeCompare(b.fullName, "en-CA") || a.id.localeCompare(b.id);
    })
    .slice(0, limit);
}

/**
 * A patient's most recent visit (latest visit date; for two on the same day, the
 * one created last), or null if they have none.
 */
export function lastVisit<V extends Pick<Visit, "patientId" | "visitDate" | "createdAt">>(
  visits: readonly V[],
  patientId: string,
): V | null {
  let latest: V | null = null;
  for (const visit of visits) {
    if (visit.patientId !== patientId) continue;
    if (
      latest === null ||
      visit.visitDate > latest.visitDate ||
      (visit.visitDate === latest.visitDate &&
        Date.parse(visit.createdAt) > Date.parse(latest.createdAt))
    ) {
      latest = visit;
    }
  }
  return latest;
}
