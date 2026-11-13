import { useLocalSearchParams } from "expo-router";
import { PatientFunding } from "@/screens/patient-funding";

export default function PatientFundingRoute() {
  const { patientId, fundingId } = useLocalSearchParams<{
    patientId: string;
    fundingId?: string;
  }>();
  return <PatientFunding patientId={patientId} {...(fundingId ? { fundingId } : {})} />;
}
