import {
  continueLabel,
  formatDayMonth,
  formatTodayTitle,
  noteExcerpt,
  pickedVisitIds,
  uninvoicedVisitsFor,
} from "@kineo/shared";
import { router } from "expo-router";
import { Button, Card, Checkbox, useToast } from "heroui-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { PendingButton } from "@/components/pending-button";
import { Screen } from "@/components/screen";
import { FormSkeleton } from "@/components/skeletons";
import { Text } from "@/components/text";
import { PracticeGate, usePracticeData, usePracticeWriter } from "@/data/practice-data";
import { localDate } from "@/utils/local-date";
import { userMessage } from "@/utils/user-message";

/** Leaves the picker without making anything. */
function cancel(): void {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

/**
 * New invoice: the patient's visits not on an invoice yet, all ticked. Nothing is
 * made until Continue, which creates the draft with the ticked visits and opens it
 * in place of this screen; Cancel leaves nothing behind.
 */
function NewInvoiceScreen({ patientId, today = new Date() }: { patientId: string; today?: Date }) {
  const writer = usePracticeWriter();
  const { patients, visits, invoices } = usePracticeData();
  const { toast } = useToast();
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const offered = useMemo(() => uninvoicedVisitsFor(visits, patientId), [visits, patientId]);
  const picked = pickedVisitIds(offered, unticked);

  // The editor reads the local database, so open the new draft once it's there.
  const created = createdId !== null && invoices.some((invoice) => invoice.id === createdId);
  const opened = useRef(false);
  useEffect(() => {
    if (!created || createdId === null || opened.current) return;
    opened.current = true;
    router.replace({ pathname: "/invoice/[id]", params: { id: createdId } });
  }, [created, createdId]);

  const patient = patients.find((candidate) => candidate.id === patientId);
  if (!patient) {
    return (
      <Screen back title="Patient not found">
        <Text className="text-muted">
          This patient isn't on this phone any more. Go back and pick someone from Patients.
        </Text>
      </Screen>
    );
  }

  const todayDate = localDate(today);

  function toggle(visitId: string) {
    setUnticked((current) => {
      const next = new Set(current);
      if (next.has(visitId)) next.delete(visitId);
      else next.add(visitId);
      return next;
    });
  }

  async function startInvoice() {
    if (!patient) return;
    setCreating(true);
    try {
      const invoice = await writer.createInvoice(patient.id, picked);
      setCreatedId(invoice.id);
    } catch (caught) {
      setCreating(false);
      toast.show({
        variant: "danger",
        label: userMessage(caught) ?? "The invoice couldn't be started. Try again.",
      });
    }
  }

  const footer = (
    <View className="gap-1">
      <PendingButton
        pending={creating}
        isDisabled={picked.length === 0}
        pendingLabel="Creating…"
        label={continueLabel(picked.length)}
        className="min-h-12 w-full"
        onPress={() => void startInvoice()}
      />
      <Button variant="ghost" className="min-h-11 w-full" isDisabled={creating} onPress={cancel}>
        Cancel
      </Button>
    </View>
  );

  return (
    <Screen
      back
      title="New invoice"
      subtitle={`For ${patient.fullName}. Pick the visits to include.`}
      footer={footer}
    >
      {offered.length === 0 ? (
        <Card className="items-center px-6 py-10">
          <Text className="font-medium text-foreground">Nothing to invoice</Text>
          <Text className="text-center text-sm text-muted">
            Every visit for {patient.fullName} is already on an invoice.
          </Text>
        </Card>
      ) : (
        <Card accessibilityLabel="Visits not invoiced" className="px-4 py-0">
          {offered.map((visit, index) => {
            const date =
              visit.visitDate === todayDate
                ? formatTodayTitle(todayDate)
                : formatDayMonth(visit.visitDate, todayDate);
            const excerpt = noteExcerpt(visit.note, 60);
            const selected = !unticked.has(visit.id);
            return (
              // The whole row is the target; the box inside only shows the state.
              <Pressable
                key={visit.id}
                accessibilityRole="checkbox"
                accessibilityLabel={date}
                accessibilityState={{ checked: selected, disabled: creating }}
                disabled={creating}
                onPress={() => toggle(visit.id)}
                className={`min-h-14 flex-row items-center gap-3 py-2 ${index > 0 ? "border-t border-separator" : ""}`}
              >
                <Checkbox
                  isSelected={selected}
                  isDisabled={creating}
                  onSelectedChange={() => toggle(visit.id)}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                />
                <View className="flex-1">
                  <Text className="text-foreground">{date}</Text>
                  {excerpt === "" ? null : (
                    <Text numberOfLines={1} className="text-sm text-muted">
                      {excerpt}
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          })}
        </Card>
      )}
      <Text className="text-sm text-muted">
        A visit can be on one invoice only. Visits already invoiced aren't shown.
      </Text>
    </Screen>
  );
}

/** New invoice, behind a skeleton until the practice has been read. */
export function NewInvoice({ patientId, today }: { patientId: string; today?: Date }) {
  return (
    <PracticeGate
      skeleton={(showBlocks) => <FormSkeleton title="New invoice" showBlocks={showBlocks} />}
    >
      <NewInvoiceScreen patientId={patientId} {...(today ? { today } : {})} />
    </PracticeGate>
  );
}
