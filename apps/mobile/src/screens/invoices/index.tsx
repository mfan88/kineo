import { Card } from "heroui-native";
import { useMemo } from "react";
import { Pressable, View } from "react-native";
import { statusTagFor, statusTags } from "@kineo/tokens";
import { StatusTag } from "@/components/status-tag";
import { openInvoice } from "@/components/open-invoice";
import { Screen } from "@/components/screen";
import { Text } from "@/components/text";
import { usePracticeData } from "@/data/practice-data";
import { invoiceRows } from "@/utils/invoice-list";

/** Invoices: every invoice, newest first. Opening one goes to its editor. */
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
            return (
              <Pressable
                key={row.id}
                accessibilityRole="button"
                accessibilityLabel={`${row.number}, ${row.patientName}, ${row.total}, ${statusTags[statusTagFor(row.status)].label}`}
                onPress={() => openInvoice(row.id)}
                className={`min-h-14 flex-row items-center gap-3 py-2 active:opacity-70 ${index > 0 ? "border-t border-separator" : ""}`}
              >
                <View className="flex-1">
                  <Text className="font-medium text-foreground">{row.patientName}</Text>
                  <Text className="text-sm text-muted tabular-nums">{row.number}</Text>
                </View>
                {/* Total over its tag, so a long tag never squeezes the patient's name. */}
                <View className="items-end gap-1">
                  <Text className="font-medium text-foreground tabular-nums">{row.total}</Text>
                  <StatusTag status={row.status} />
                </View>
              </Pressable>
            );
          })}
        </Card>
      )}
    </Screen>
  );
}
