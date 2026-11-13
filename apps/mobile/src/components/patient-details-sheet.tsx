import type { Patient } from "@kineo/shared";
import { BottomSheet, Button, FieldError, Input, Label, TextField, useToast } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";
import { Text } from "@/components/text";
import { usePracticeWriter } from "@/data/practice-data";
import { userMessage } from "@/utils/user-message";
import { PendingButton } from "./pending-button";

/**
 * Edit details on a patient: Cancel, "Edit details", Full name, Reason for visit and
 * Save details. Draft invoices billed to the patient take the new name; sent ones
 * keep theirs. Mount it only while it's open, so it starts from the saved details.
 */
export function PatientDetailsSheet({
  patient,
  onClose,
}: {
  patient: Patient;
  onClose: () => void;
}) {
  const writer = usePracticeWriter();
  const { toast } = useToast();
  const [fullName, setFullName] = useState(patient.fullName);
  const [reason, setReason] = useState(patient.reasonForVisit ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    if (fullName.trim() === "") {
      setNameError("Add the patient's full name.");
      return;
    }
    setSaving(true);
    try {
      await writer.updatePatient(patient.id, { fullName, reasonForVisit: reason });
      toast.show("Patient updated");
      onClose();
    } catch (caught) {
      // A rule's own message is safe to show; anything else may hold patient details.
      toast.show({
        variant: "danger",
        label: userMessage(caught) ?? "Those details couldn't be saved. Try again.",
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
              <BottomSheet.Title>Edit details</BottomSheet.Title>
              {/* Keeps the title in the middle. */}
              <View className="w-16" />
            </View>
            <TextField isInvalid={nameError !== null}>
              <Label>Full name</Label>
              <Input
                value={fullName}
                onChangeText={(value) => {
                  setFullName(value);
                  setNameError(null);
                }}
                autoCapitalize="words"
                autoComplete="off"
                accessibilityLabel="Full name"
              />
              <FieldError>{nameError}</FieldError>
            </TextField>
            <TextField>
              <Label>Reason for visit (optional)</Label>
              <Input
                value={reason}
                onChangeText={setReason}
                autoCapitalize="sentences"
                autoComplete="off"
                accessibilityLabel="Reason for visit (optional)"
              />
            </TextField>
            <Text className="text-sm text-muted">
              Invoices not sent yet show the new name. Sent invoices keep the one they were sent
              with.
            </Text>
            <PendingButton
              pending={saving}
              pendingLabel="Saving…"
              label="Save details"
              className="min-h-12 w-full"
              onPress={() => void save()}
            />
          </View>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
