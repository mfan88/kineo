import { useLocalSearchParams } from "expo-router";
import { NewInvoice } from "@/screens/new-invoice";

export default function NewInvoiceRoute() {
  const { patientId } = useLocalSearchParams<{ patientId: string }>();
  return <NewInvoice patientId={patientId} />;
}
