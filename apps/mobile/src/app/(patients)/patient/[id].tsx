import { useLocalSearchParams } from "expo-router";
import { Patient } from "@/screens/patient";

export default function PatientRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Patient patientId={id} />;
}
