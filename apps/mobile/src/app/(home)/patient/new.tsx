import { useLocalSearchParams } from "expo-router";
import { NewPatient } from "@/screens/new-patient";

export default function NewPatientRoute() {
  const { name } = useLocalSearchParams<{ name?: string }>();
  return <NewPatient name={name ?? ""} />;
}
