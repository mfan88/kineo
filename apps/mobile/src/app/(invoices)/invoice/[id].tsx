import { useLocalSearchParams } from "expo-router";
import { Invoice } from "@/screens/invoice";

export default function InvoiceRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Invoice invoiceId={id} />;
}
