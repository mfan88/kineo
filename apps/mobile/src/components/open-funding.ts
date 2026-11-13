import { router, type Href } from "expo-router";

/**
 * Opens the funding form on top of whichever tab you're in: Add funding for a patient,
 * or Edit funding when given one of their fundings.
 */
export function openPatientFunding(patientId: string, fundingId?: string): void {
  const path = `/patient-funding/${patientId}`;
  // The route is added with the funding form (F14); until Expo regenerates its typed
  // routes the path isn't in `Href`. Switch to a typed pathname then.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  router.navigate((fundingId === undefined ? path : `${path}?fundingId=${fundingId}`) as Href);
}
