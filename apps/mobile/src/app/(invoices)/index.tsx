import { parseInvoiceGroup } from "@kineo/shared";
import { useLocalSearchParams } from "expo-router";
import { Invoices } from "@/screens/invoices";

export default function InvoicesRoute() {
  const { group } = useLocalSearchParams<{ group?: string }>();
  return <Invoices group={parseInvoiceGroup(group)} />;
}
