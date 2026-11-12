import type { InvoiceStatus } from "@kineo/shared";
import { Card, Chip } from "heroui-native";
import { useMemo } from "react";
import { View } from "react-native";
import { Screen } from "@/components/screen";
import { Text } from "@/components/text";
import { usePracticeData } from "@/data/practice-data";
import { invoiceRows } from "@/utils/invoice-list";

const STATUS_TAGS: Record<
  InvoiceStatus,
  { label: string; color: "warning" | "accent" | "success" }
> = {
  draft: { label: "Draft", color: "warning" },
  sent: { label: "Sent", color: "accent" },
  paid: { label: "Paid", color: "success" },
};

/** Invoices: every invoice, newest first, with who it's for, its total and where it stands. */
export function Invoices() {
  const practice = usePracticeData();
  const rows = useMemo(() => invoiceRows(practice), [practice]);

  return (
    <Screen title="Invoices">
      {rows.length === 0 ? (
        <Card className="items-center px-6 py-10">
          <Text className="font-medium text-foreground">No invoices yet</Text>
          <Text className="text-center text-sm text-muted">
            Invoice a patient's visits and they'll show up here.
          </Text>
        </Card>
      ) : (
        <Card accessibilityLabel="Invoices" className="px-4 py-1">
          {rows.map((row, index) => {
            const tag = STATUS_TAGS[row.status];
            return (
              <View
                key={row.id}
                accessible
                accessibilityLabel={`${row.number}, ${row.patientName}, ${row.total}, ${tag.label}`}
                className={`min-h-14 flex-row items-center gap-3 py-2 ${index > 0 ? "border-t border-separator" : ""}`}
              >
                <View className="flex-1">
                  <Text className="font-medium text-foreground">{row.patientName}</Text>
                  <Text className="text-sm text-muted">{row.number}</Text>
                </View>
                <Text className="font-medium text-foreground">{row.total}</Text>
                <Chip size="sm" variant="soft" color={tag.color}>
                  {tag.label}
                </Chip>
              </View>
            );
          })}
        </Card>
      )}
    </Screen>
  );
}
