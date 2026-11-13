import { dayInputValue, readVisitDateInput, type Visit } from "@kineo/shared";
import { BottomSheet, Button, FieldError, Input, Label, TextField, useToast } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";
import { usePracticeWriter } from "@/data/practice-data";
import { userMessage } from "@/utils/user-message";
import { PendingButton } from "./pending-button";

/**
 * Change date on a visit that isn't on an invoice: Cancel, "Change date", Visit date
 * (typed like "11 Nov 2026") and Save date. Mount it only while it's open.
 */
export function VisitDateSheet({
  visit,
  today,
  onClose,
}: {
  visit: Visit;
  /** The practitioner's today, YYYY-MM-DD. */
  today: string;
  onClose: () => void;
}) {
  const writer = usePracticeWriter();
  const { toast } = useToast();
  const [text, setText] = useState(() => dayInputValue(visit.visitDate));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    const read = readVisitDateInput(text, today);
    if (!read.ok) {
      setError(read.message);
      return;
    }
    setSaving(true);
    try {
      await writer.setVisitDate(visit.id, read.value);
      toast.show("Visit date changed");
      onClose();
    } catch (caught) {
      // A rule's own message is safe to show; anything else may hold patient details.
      toast.show({
        variant: "danger",
        label: userMessage(caught) ?? "That date couldn't be saved. Try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content keyboardBehavior="interactive" keyboardBlurBehavior="restore">
          <View className="gap-4 pb-6">
            <View className="flex-row items-center justify-between gap-3">
              <Button variant="ghost" className="-ml-3 min-h-11" onPress={onClose}>
                Cancel
              </Button>
              <BottomSheet.Title>Change date</BottomSheet.Title>
              {/* Keeps the title in the middle. */}
              <View className="w-16" />
            </View>
            <TextField isInvalid={error !== null}>
              <Label>Visit date</Label>
              <Input
                value={text}
                onChangeText={(value) => {
                  setText(value);
                  setError(null);
                }}
                placeholder="e.g. 11 Nov 2026"
                autoCorrect={false}
                autoComplete="off"
                accessibilityLabel="Visit date"
              />
              <FieldError>{error}</FieldError>
            </TextField>
            <PendingButton
              pending={saving}
              pendingLabel="Saving…"
              label="Save date"
              className="min-h-12 w-full"
              onPress={() => void save()}
            />
          </View>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
