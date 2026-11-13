import { countLabel, readyPatients } from "@kineo/shared";
import { Card } from "heroui-native";
import { useMemo } from "react";
import { Pressable } from "react-native";
import { openNewInvoice } from "@/components/open-invoice";
import { Screen } from "@/components/screen";
import { FormSkeleton } from "@/components/skeletons";
import { Text } from "@/components/text";
import { PracticeGate, usePracticeData } from "@/data/practice-data";

/**
 * Ready to invoice: the patients with visits not on an invoice yet, the one waiting
 * longest first. Picking one opens their New invoice step.
 */
function ReadyToInvoiceScreen() {
  const { patients, visits } = usePracticeData();
  const rows = useMemo(() => readyPatients(patients, visits), [patients, visits]);

  return (
    <Screen back title="Ready to invoice">
      {rows.length === 0 ? (
        <Card className="items-center px-6 py-10">
          <Text className="font-medium text-foreground">You're all caught up</Text>
          <Text className="text-center text-sm text-muted">Every visit is on an invoice.</Text>
        </Card>
      ) : (
        <Card accessibilityLabel="Patients ready to invoice" className="px-4 py-0">
          {rows.map(({ patient, visitCount }, index) => {
            const count = countLabel(visitCount, "visit");
            return (
              <Pressable
                key={patient.id}
                accessibilityRole="button"
                accessibilityLabel={`${patient.fullName}, ${count}`}
                onPress={() => openNewInvoice(patient.id)}
                className={`min-h-14 flex-row items-center justify-between gap-3 active:opacity-70 ${index > 0 ? "border-t border-separator" : ""}`}
              >
                <Text className="shrink font-medium text-foreground">{patient.fullName}</Text>
                <Text className="text-[13px] text-muted tabular-nums">{count}</Text>
              </Pressable>
            );
          })}
        </Card>
      )}
    </Screen>
  );
}

/** Ready to invoice, behind a skeleton until the practice has been read. */
export function ReadyToInvoice() {
  return (
    <PracticeGate
      skeleton={(showBlocks) => <FormSkeleton title="Ready to invoice" showBlocks={showBlocks} />}
    >
      <ReadyToInvoiceScreen />
    </PracticeGate>
  );
}
