import { useLocalSearchParams } from "expo-router";
import { InvoicePreview } from "@/screens/invoice-preview";

export default function InvoicePreviewRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <InvoicePreview invoiceId={id} />;
}
