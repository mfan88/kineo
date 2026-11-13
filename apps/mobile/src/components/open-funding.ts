import { router } from "expo-router";

/**
 * Opens the funding form on top of whichever tab you're in: Add funding for a patient,
 * or Edit funding when given one of their fundings.
 */
export function openPatientFunding(patientId: string, fundingId?: string): void {
  router.navigate({
    pathname: "/patient-funding/[patientId]",
    params: fundingId === undefined ? { patientId } : { patientId, fundingId },
  });
}
